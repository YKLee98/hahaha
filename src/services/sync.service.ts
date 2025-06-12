import { shopifyService } from './shopify.service';
import { hanteoService, HanteoService } from './hanteo.service';
import { AlbumProduct } from '../models/product.model';
import { ShopifyOrder } from '../models/order.model';
import { SalesTransaction } from '../models/sales.model';
import { loggers } from '../utils/logger';
import { extractBirthYear } from '../utils/validators';

const logger = loggers.sync;

export class SyncService {
  private albumProductsCache: Map<number, AlbumProduct> = new Map();
  private lastCacheUpdate: Date = new Date(0);
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour

  /**
   * Sync album products from Shopify to cache
   */
  async syncAlbumProducts(): Promise<void> {
    logger.info('Starting album products sync');

    try {
      const products = await shopifyService.getAlbumProducts({
        hasBarcode: true,
        tags: ['album'],
        status: 'active',
      });

      // Clear and rebuild cache
      this.albumProductsCache.clear();
      
      for (const product of products) {
        this.albumProductsCache.set(product.variantId, product);
      }

      this.lastCacheUpdate = new Date();

      logger.info({
        productsCount: products.length,
        variantsCount: this.albumProductsCache.size,
      }, 'Album products synced successfully');

    } catch (error) {
      logger.error({ error }, 'Failed to sync album products');
      throw error;
    }
  }

  /**
   * Check if cache needs refresh
   */
  private async ensureProductsCached(): Promise<void> {
    const cacheAge = Date.now() - this.lastCacheUpdate.getTime();
    
    if (cacheAge > this.CACHE_TTL || this.albumProductsCache.size === 0) {
      await this.syncAlbumProducts();
    }
  }

  /**
   * Process fulfilled orders and send to Hanteo
   */
  async processRecentFulfilledOrders(options: {
    hoursAgo?: number;
    limit?: number;
  } = {}): Promise<{
    ordersProcessed: number;
    transactionsSent: number;
    transactionsSuccess: number;
    transactionsFailed: number;
    errors: Array<{ orderId: string; error: string }>;
  }> {
    const { hoursAgo = 24, limit = 250 } = options;
    
    logger.info({ hoursAgo, limit }, 'Processing recent fulfilled orders');

    // Ensure products are cached
    await this.ensureProductsCached();

    const results = {
      ordersProcessed: 0,
      transactionsSent: 0,
      transactionsSuccess: 0,
      transactionsFailed: 0,
      errors: [] as Array<{ orderId: string; error: string }>,
    };

    try {
      // Calculate date range
      const updatedAtMin = new Date();
      updatedAtMin.setHours(updatedAtMin.getHours() - hoursAgo);

      // Fetch fulfilled orders
      const orders = await shopifyService.getFulfilledOrders({
        fulfillment_status: 'shipped',
        updated_at_min: updatedAtMin.toISOString(),
        limit,
      });

      logger.info({ ordersCount: orders.length }, 'Fetched fulfilled orders');

      // Process each order
      const allTransactions: SalesTransaction[] = [];

      for (const order of orders) {
        try {
          const transactions = await this.processOrder(order);
          allTransactions.push(...transactions);
          results.ordersProcessed++;
        } catch (error) {
          logger.error({ error, orderId: order.id }, 'Failed to process order');
          results.errors.push({
            orderId: order.name,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Send to Hanteo in batches
      if (allTransactions.length > 0) {
        const batchResults = await hanteoService.sendSalesDataInBatches(allTransactions);
        
        results.transactionsSent = batchResults.totalSent;
        results.transactionsSuccess = batchResults.totalSuccess;
        results.transactionsFailed = batchResults.totalFailed;

        // Log failed transactions
        if (batchResults.failedTransactions.length > 0) {
          logger.error({
            failedCount: batchResults.failedTransactions.length,
            failures: batchResults.failedTransactions,
          }, 'Some transactions failed');
        }
      }

      logger.info(results, 'Order processing completed');
      return results;

    } catch (error) {
      logger.error({ error }, 'Failed to process orders');
      throw error;
    }
  }

  /**
   * Process a single order and extract album sales transactions
   */
  async processOrder(order: ShopifyOrder): Promise<SalesTransaction[]> {
    const transactions: SalesTransaction[] = [];

    // Get fulfillments if not included
    if (!order.fulfillments || order.fulfillments.length === 0) {
      order.fulfillments = await shopifyService.getOrderFulfillments(order.id);
    }

    // Process each fulfillment
    for (const fulfillment of order.fulfillments) {
      // Skip if no tracking number (not actually shipped)
      if (!fulfillment.tracking_number && !fulfillment.tracking_numbers?.length) {
        logger.debug({
          orderId: order.id,
          fulfillmentId: fulfillment.id,
        }, 'Skipping fulfillment without tracking number');
        continue;
      }

      // Process line items in this fulfillment
      for (const lineItem of fulfillment.line_items) {
        const albumProduct = this.albumProductsCache.get(lineItem.variant_id);
        
        if (!albumProduct) {
          continue; // Not an album product
        }

        // Extract customer information
        const customerInfo = order.customer ? {
          id: order.customer.id.toString(),
          email: order.customer.email,
          gender: this.extractGenderFromCustomer(order.customer),
          birthYear: this.extractBirthYearFromCustomer(order.customer),
        } : undefined;

        // Extract shipping information
        const shippingInfo = order.shipping_address ? {
          country: order.shipping_address.country_name || order.shipping_address.country,
          countryCode: order.shipping_address.country_code || 
                       HanteoService.getCountryCode(order.shipping_address.country),
          city: order.shipping_address.city,
          province: order.shipping_address.province,
        } : undefined;

        const transaction: SalesTransaction = {
          orderId: order.id.toString(),
          orderName: order.name,
          fulfillmentId: fulfillment.id.toString(),
          lineItemId: lineItem.id.toString(),
          productId: albumProduct.productId.toString(),
          variantId: albumProduct.variantId.toString(),
          barcode: albumProduct.barcode,
          albumName: `${albumProduct.title} - ${albumProduct.variantTitle}`.trim(),
          quantity: lineItem.quantity,
          customerInfo,
          shippingInfo,
          transactionTime: new Date(fulfillment.created_at),
          trackingNumber: fulfillment.tracking_number || fulfillment.tracking_numbers?.[0],
          status: 'pending',
        };

        transactions.push(transaction);
      }
    }

    logger.debug({
      orderId: order.id,
      orderName: order.name,
      transactionsCount: transactions.length,
    }, 'Processed order');

    return transactions;
  }

  /**
   * Process a webhook event for order fulfillment
   */
  async processWebhookFulfillment(payload: any): Promise<void> {
    logger.info({ orderId: payload.id }, 'Processing webhook fulfillment');

    try {
      // Ensure products are cached
      await this.ensureProductsCached();

      // Fetch full order details
      const order = await shopifyService.getOrderById(payload.id);

      // Process the order
      const transactions = await this.processOrder(order);

      if (transactions.length > 0) {
        // Send immediately for webhook events
        const result = await hanteoService.sendSalesData(transactions);
        
        logger.info({
          orderId: order.id,
          orderName: order.name,
          transactionsCount: transactions.length,
          result,
        }, 'Webhook fulfillment processed successfully');
      } else {
        logger.info({
          orderId: order.id,
          orderName: order.name,
        }, 'No album products in order');
      }

    } catch (error) {
      logger.error({ error, orderId: payload.id }, 'Failed to process webhook fulfillment');
      throw error;
    }
  }

  /**
   * Extract gender from customer data
   */
  private extractGenderFromCustomer(customer: any): string | undefined {
    // Check customer tags for gender
    if (customer.tags) {
      const tags = customer.tags.toLowerCase();
      if (tags.includes('male') || tags.includes('man')) return 'M';
      if (tags.includes('female') || tags.includes('woman')) return 'W';
    }

    // Check customer note
    if (customer.note) {
      const note = customer.note.toLowerCase();
      if (note.includes('gender:m') || note.includes('gender: m')) return 'M';
      if (note.includes('gender:f') || note.includes('gender: f') || 
          note.includes('gender:w') || note.includes('gender: w')) return 'W';
    }

    return undefined;
  }

  /**
   * Extract birth year from customer data
   */
  private extractBirthYearFromCustomer(customer: any): string | undefined {
    // Check customer tags for birth year
    if (customer.tags) {
      const yearMatch = customer.tags.match(/birth[_-]?year[:\s]*([0-9]{4})/i);
      if (yearMatch) {
        return yearMatch[1];
      }
    }

    // Check customer note
    if (customer.note) {
      const yearMatch = customer.note.match(/birth[_-]?year[:\s]*([0-9]{4})/i);
      if (yearMatch) {
        return yearMatch[1];
      }
      
      // Try to extract from birth date
      const dateMatch = customer.note.match(/birth[_-]?date[:\s]*([0-9\-\/]+)/i);
      if (dateMatch) {
        return extractBirthYear(dateMatch[1]);
      }
    }

    return undefined;
  }

  /**
   * Get sync statistics
   */
  getStatistics(): {
    albumProductsCount: number;
    lastCacheUpdate: Date;
    cacheAge: number;
  } {
    return {
      albumProductsCount: this.albumProductsCache.size,
      lastCacheUpdate: this.lastCacheUpdate,
      cacheAge: Date.now() - this.lastCacheUpdate.getTime(),
    };
  }
}

// Export singleton instance
export const syncService = new SyncService();