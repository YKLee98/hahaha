import { createShopifyClient, createGraphQLClient, ORDER_PARAMS } from '../config/shopify.config';
import { AlbumProduct, ProductFilter } from '../models/product.model';
import { ShopifyOrder, OrderFilter } from '../models/order.model';
import { loggers } from '../utils/logger';
import { ShopifyError, retryWithBackoff } from '../utils/error-handler';
import { hasAlbumTag, isValidBarcode, validateAlbumProduct } from '../utils/validators';

const logger = loggers.shopify;

export class ShopifyService {
  private restClient;
  private graphqlClient;

  constructor() {
    this.restClient = createShopifyClient();
    this.graphqlClient = createGraphQLClient();
  }

  /**
   * Fetch all products with Album tag and valid barcodes
   */
  async getAlbumProducts(filter?: ProductFilter): Promise<AlbumProduct[]> {
    logger.info('Fetching album products from Shopify');
    
    try {
      const albums: AlbumProduct[] = [];
      let pageInfo = { hasNextPage: true, endCursor: null };

      // Use GraphQL for better performance with large catalogs
      while (pageInfo.hasNextPage) {
        const query = `
          query GetProducts($first: Int!, $after: String, $query: String) {
            products(first: $first, after: $after, query: $query) {
              edges {
                node {
                  id
                  title
                  vendor
                  productType
                  tags
                  status
                  variants(first: 100) {
                    edges {
                      node {
                        id
                        title
                        sku
                        barcode
                        price
                        inventoryQuantity
                      }
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `;

        const queryString = this.buildProductQuery(filter);
        
        const response: any = await retryWithBackoff(
          () => this.graphqlClient.request(query, {
            variables: {
              first: 100,
              after: pageInfo.endCursor,
              query: queryString,
            },
          }),
          {
            maxRetries: 3,
            onRetry: (error, attempt) => {
              logger.warn({ error: error.message, attempt }, 'Retrying Shopify product fetch');
            },
          }
        );

        const products = response.body.data.products;
        
        for (const edge of products.edges) {
          const product = edge.node;
          
          // Check if product has album tag
          if (!hasAlbumTag(product.tags.join(','))) {
            continue;
          }

          // Process each variant
          for (const variantEdge of product.variants.edges) {
            const variant = variantEdge.node;
            
            // Skip variants without valid barcodes
            if (!isValidBarcode(variant.barcode)) {
              continue;
            }

            const albumProduct: AlbumProduct = {
              productId: this.extractIdFromGid(product.id),
              variantId: this.extractIdFromGid(variant.id),
              title: product.title,
              variantTitle: variant.title,
              vendor: product.vendor,
              sku: variant.sku || '',
              barcode: variant.barcode.trim(),
              price: variant.price,
              tags: product.tags,
            };

            const validated = validateAlbumProduct(albumProduct);
            if (validated) {
              albums.push(validated);
            }
          }
        }

        pageInfo = products.pageInfo;
      }

      logger.info({ count: albums.length }, 'Album products fetched successfully');
      return albums;

    } catch (error) {
      logger.error({ error }, 'Failed to fetch album products');
      throw new ShopifyError('Failed to fetch products', error);
    }
  }

  /**
   * Fetch orders with fulfillment information
   */
  async getFulfilledOrders(filter: OrderFilter): Promise<ShopifyOrder[]> {
    logger.info({ filter }, 'Fetching fulfilled orders from Shopify');
    
    try {
      const orders: ShopifyOrder[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const params = {
          ...ORDER_PARAMS,
          ...filter,
          page,
        };

        const response: any = await retryWithBackoff(
          () => this.restClient.get({
            path: 'orders',
            query: params,
          }),
          {
            maxRetries: 3,
            onRetry: (error, attempt) => {
              logger.warn({ error: error.message, attempt }, 'Retrying Shopify order fetch');
            },
          }
        );

        const fetchedOrders = response.body.orders as ShopifyOrder[];
        
        if (fetchedOrders.length === 0) {
          hasMore = false;
        } else {
          orders.push(...fetchedOrders);
          page++;
          
          // Shopify REST API has a limit of 250 items per page
          if (fetchedOrders.length < params.limit) {
            hasMore = false;
          }
        }

        // Respect rate limits
        await this.respectRateLimit(response.headers);
      }

      logger.info({ count: orders.length }, 'Fulfilled orders fetched successfully');
      return orders;

    } catch (error) {
      logger.error({ error }, 'Failed to fetch fulfilled orders');
      throw new ShopifyError('Failed to fetch orders', error);
    }
  }

  /**
   * Fetch order by ID with full details
   */
  async getOrderById(orderId: string | number): Promise<ShopifyOrder> {
    logger.info({ orderId }, 'Fetching order details');
    
    try {
      const response: any = await retryWithBackoff(
        () => this.restClient.get({
          path: `orders/${orderId}`,
        }),
        {
          maxRetries: 3,
        }
      );

      return response.body.order as ShopifyOrder;

    } catch (error) {
      logger.error({ error, orderId }, 'Failed to fetch order');
      throw new ShopifyError(`Failed to fetch order ${orderId}`, error);
    }
  }

  /**
   * Fetch fulfillments for an order
   */
  async getOrderFulfillments(orderId: string | number): Promise<any[]> {
    logger.info({ orderId }, 'Fetching order fulfillments');
    
    try {
      const response: any = await retryWithBackoff(
        () => this.restClient.get({
          path: `orders/${orderId}/fulfillments`,
        }),
        {
          maxRetries: 3,
        }
      );

      return response.body.fulfillments || [];

    } catch (error) {
      logger.error({ error, orderId }, 'Failed to fetch fulfillments');
      throw new ShopifyError(`Failed to fetch fulfillments for order ${orderId}`, error);
    }
  }

  /**
   * Register webhook for order fulfillment events
   */
  async registerWebhook(topic: string, address: string): Promise<void> {
    logger.info({ topic, address }, 'Registering webhook');
    
    try {
      await this.restClient.post({
        path: 'webhooks',
        data: {
          webhook: {
            topic,
            address,
            format: 'json',
          },
        },
      });

      logger.info({ topic }, 'Webhook registered successfully');

    } catch (error: any) {
      // Ignore if webhook already exists
      if (error.response?.body?.errors?.webhook?.[0]?.includes('already exists')) {
        logger.info({ topic }, 'Webhook already exists');
        return;
      }
      
      logger.error({ error, topic }, 'Failed to register webhook');
      throw new ShopifyError('Failed to register webhook', error);
    }
  }

  /**
   * List all registered webhooks
   */
  async listWebhooks(): Promise<any[]> {
    try {
      const response = await this.restClient.get({
        path: 'webhooks',
      });

      return response.body.webhooks || [];

    } catch (error) {
      logger.error({ error }, 'Failed to list webhooks');
      throw new ShopifyError('Failed to list webhooks', error);
    }
  }

  /**
   * Build GraphQL query string from filter
   */
  private buildProductQuery(filter?: ProductFilter): string {
    const queryParts: string[] = [];

    if (filter?.status) {
      queryParts.push(`status:${filter.status}`);
    }

    if (filter?.vendor) {
      queryParts.push(`vendor:"${filter.vendor}"`);
    }

    if (filter?.productType) {
      queryParts.push(`product_type:"${filter.productType}"`);
    }

    // Always filter for products with album tag
    queryParts.push('tag:album OR tag:Album OR tag:ALBUM');

    return queryParts.join(' AND ');
  }

  /**
   * Extract numeric ID from Shopify GraphQL GID
   */
  private extractIdFromGid(gid: string): number {
    const match = gid.match(/\/(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Respect Shopify rate limits
   */
  private async respectRateLimit(headers: any): Promise<void> {
    const apiCallLimit = headers['x-shopify-shop-api-call-limit'];
    
    if (apiCallLimit) {
      const [used, limit] = apiCallLimit.split('/').map(Number);
      const percentageUsed = (used / limit) * 100;
      
      if (percentageUsed > 80) {
        const delay = percentageUsed > 95 ? 2000 : 1000;
        logger.warn({ used, limit, delay }, 'Approaching rate limit, slowing down');
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}

// Export singleton instance
export const shopifyService = new ShopifyService();