import { ShopifyService } from '../../src/services/shopify.service';
import { createShopifyClient } from '../../src/config/shopify.config';
import { ShopifyError } from '../../src/utils/error-handler';

// Mock the Shopify client
jest.mock('../../src/config/shopify.config', () => ({
  createShopifyClient: jest.fn(),
  createGraphQLClient: jest.fn(),
  PRODUCT_PARAMS: {
    limit: 250,
    fields: 'id,title,vendor,product_type,tags,variants',
    status: 'active',
  },
  ORDER_PARAMS: {
    limit: 250,
    status: 'any',
    fulfillment_status: 'shipped',
  },
}));

describe('ShopifyService', () => {
  let shopifyService: ShopifyService;
  let mockRestClient: any;
  let mockGraphQLClient: any;

  beforeEach(() => {
    // Setup mock clients
    mockRestClient = {
      get: jest.fn(),
      post: jest.fn(),
    };

    mockGraphQLClient = {
      request: jest.fn(),
    };

    // Mock the client creation
    (createShopifyClient as jest.Mock).mockReturnValue(mockRestClient);
    (require('../../src/config/shopify.config').createGraphQLClient as jest.Mock)
      .mockReturnValue(mockGraphQLClient);

    // Create service instance
    shopifyService = new ShopifyService();
  });

  describe('getAlbumProducts', () => {
    it('should fetch and filter album products with valid barcodes', async () => {
      // Mock GraphQL response
      const mockResponse = {
        body: {
          data: {
            products: {
              edges: [
                {
                  node: {
                    id: 'gid://shopify/Product/1234567890',
                    title: 'Test Album 1',
                    vendor: 'Artist 1',
                    productType: 'Music',
                    tags: ['album', 'k-pop'],
                    status: 'ACTIVE',
                    variants: {
                      edges: [
                        {
                          node: {
                            id: 'gid://shopify/ProductVariant/9876543210',
                            title: 'CD Version',
                            sku: 'ALBUM-001',
                            barcode: '8809633189505',
                            price: '25.00',
                            inventoryQuantity: 100,
                          },
                        },
                        {
                          node: {
                            id: 'gid://shopify/ProductVariant/9876543211',
                            title: 'LP Version',
                            sku: 'ALBUM-002',
                            barcode: '', // Empty barcode
                            price: '35.00',
                            inventoryQuantity: 50,
                          },
                        },
                      ],
                    },
                  },
                },
                {
                  node: {
                    id: 'gid://shopify/Product/1234567891',
                    title: 'Not an Album',
                    vendor: 'Artist 2',
                    productType: 'Merchandise',
                    tags: ['merch', 't-shirt'], // No album tag
                    status: 'ACTIVE',
                    variants: {
                      edges: [
                        {
                          node: {
                            id: 'gid://shopify/ProductVariant/9876543212',
                            title: 'Size M',
                            sku: 'MERCH-001',
                            barcode: '1234567890123',
                            price: '20.00',
                            inventoryQuantity: 200,
                          },
                        },
                      ],
                    },
                  },
                },
              ],
              pageInfo: {
                hasNextPage: false,
                endCursor: null,
              },
            },
          },
        },
      };

      mockGraphQLClient.request.mockResolvedValueOnce(mockResponse);

      // Call the method
      const result = await shopifyService.getAlbumProducts();

      // Assertions
      expect(result).toHaveLength(1); // Only one album with valid barcode
      expect(result[0]).toMatchObject({
        productId: 1234567890,
        variantId: 9876543210,
        title: 'Test Album 1',
        variantTitle: 'CD Version',
        vendor: 'Artist 1',
        sku: 'ALBUM-001',
        barcode: '8809633189505',
        price: '25.00',
        tags: ['album', 'k-pop'],
      });

      // Verify GraphQL was called correctly
      expect(mockGraphQLClient.request).toHaveBeenCalledTimes(1);
    });

    it('should handle pagination correctly', async () => {
      // First page response
      const firstPageResponse = {
        body: {
          data: {
            products: {
              edges: [
                {
                  node: {
                    id: 'gid://shopify/Product/1',
                    title: 'Album 1',
                    vendor: 'Artist 1',
                    productType: 'Music',
                    tags: ['album'],
                    status: 'ACTIVE',
                    variants: {
                      edges: [
                        {
                          node: {
                            id: 'gid://shopify/ProductVariant/1',
                            title: 'Version 1',
                            sku: 'ALB-001',
                            barcode: '8809633189505',
                            price: '25.00',
                            inventoryQuantity: 100,
                          },
                        },
                      ],
                    },
                  },
                },
              ],
              pageInfo: {
                hasNextPage: true,
                endCursor: 'cursor123',
              },
            },
          },
        },
      };

      // Second page response
      const secondPageResponse = {
        body: {
          data: {
            products: {
              edges: [
                {
                  node: {
                    id: 'gid://shopify/Product/2',
                    title: 'Album 2',
                    vendor: 'Artist 2',
                    productType: 'Music',
                    tags: ['album'],
                    status: 'ACTIVE',
                    variants: {
                      edges: [
                        {
                          node: {
                            id: 'gid://shopify/ProductVariant/2',
                            title: 'Version 2',
                            sku: 'ALB-002',
                            barcode: '8809633189506',
                            price: '30.00',
                            inventoryQuantity: 80,
                          },
                        },
                      ],
                    },
                  },
                },
              ],
              pageInfo: {
                hasNextPage: false,
                endCursor: null,
              },
            },
          },
        },
      };

      mockGraphQLClient.request
        .mockResolvedValueOnce(firstPageResponse)
        .mockResolvedValueOnce(secondPageResponse);

      // Call the method
      const result = await shopifyService.getAlbumProducts();

      // Assertions
      expect(result).toHaveLength(2);
      expect(mockGraphQLClient.request).toHaveBeenCalledTimes(2);
      
      // Check second call includes cursor
      expect(mockGraphQLClient.request).toHaveBeenNthCalledWith(2, 
        expect.any(String),
        expect.objectContaining({
          variables: expect.objectContaining({
            after: 'cursor123',
          }),
        })
      );
    });

    it('should throw ShopifyError on API failure', async () => {
      mockGraphQLClient.request.mockRejectedValueOnce(new Error('API Error'));

      await expect(shopifyService.getAlbumProducts()).rejects.toThrow(ShopifyError);
    });
  });

  describe('getFulfilledOrders', () => {
    it('should fetch fulfilled orders with pagination', async () => {
      const mockOrders = [
        (global as any).testUtils.mockShopifyOrder({ id: 1 }),
        (global as any).testUtils.mockShopifyOrder({ id: 2 }),
      ];

      // First page
      mockRestClient.get.mockResolvedValueOnce({
        body: { orders: mockOrders },
        headers: { 'x-shopify-shop-api-call-limit': '10/40' },
      });

      // Second page (empty)
      mockRestClient.get.mockResolvedValueOnce({
        body: { orders: [] },
        headers: { 'x-shopify-shop-api-call-limit': '11/40' },
      });

      const result = await shopifyService.getFulfilledOrders({
        fulfillment_status: 'shipped',
        limit: 2,
      });

      expect(result).toHaveLength(2);
      expect(mockRestClient.get).toHaveBeenCalledTimes(2);
    });

    it('should respect rate limits', async () => {
      const mockOrders = [(global as any).testUtils.mockShopifyOrder()];

      // Mock response with high rate limit usage
      mockRestClient.get.mockResolvedValueOnce({
        body: { orders: mockOrders },
        headers: { 'x-shopify-shop-api-call-limit': '38/40' }, // 95% usage
      });

      // Mock empty second page
      mockRestClient.get.mockResolvedValueOnce({
        body: { orders: [] },
        headers: { 'x-shopify-shop-api-call-limit': '39/40' },
      });

      // Spy on setTimeout to check delay
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      await shopifyService.getFulfilledOrders({ limit: 1 });

      // Should have delayed due to high rate limit usage
      expect(setTimeoutSpy).toHaveBeenCalled();
      
      setTimeoutSpy.mockRestore();
    });
  });

  describe('registerWebhook', () => {
    it('should register a new webhook', async () => {
      mockRestClient.post.mockResolvedValueOnce({
        body: { webhook: { id: 123, topic: 'orders/fulfilled' } },
      });

      await shopifyService.registerWebhook(
        'orders/fulfilled',
        'https://example.com/webhook'
      );

      expect(mockRestClient.post).toHaveBeenCalledWith({
        path: 'webhooks',
        data: {
          webhook: {
            topic: 'orders/fulfilled',
            address: 'https://example.com/webhook',
            format: 'json',
          },
        },
      });
    });

    it('should ignore "already exists" errors', async () => {
      const error = new Error('Webhook already exists');
      (error as any).response = {
        body: {
          errors: {
            webhook: ['has already been taken'],
          },
        },
      };

      mockRestClient.post.mockRejectedValueOnce(error);

      // Should not throw
      await expect(
        shopifyService.registerWebhook('orders/fulfilled', 'https://example.com/webhook')
      ).resolves.not.toThrow();
    });
  });
});