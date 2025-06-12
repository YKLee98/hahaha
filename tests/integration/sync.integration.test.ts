import { syncService } from '../../src/services/sync.service';
import { shopifyService } from '../../src/services/shopify.service';
import { hanteoService } from '../../src/services/hanteo.service';
import { AlbumProduct } from '../../src/models/product.model';
import { ShopifyOrder } from '../../src/models/order.model';

// Mock services
jest.mock('../../src/services/shopify.service');
jest.mock('../../src/services/hanteo.service');

describe('SyncService Integration Tests', () => {
  const mockAlbumProducts: AlbumProduct[] = [
    {
      productId: 1234567890,
      variantId: 9876543210,
      title: 'Test Album 1',
      variantTitle: 'CD Version',
      vendor: 'Artist 1',
      sku: 'ALB-001',
      barcode: '8809633189505',
      price: '25.00',
      tags: ['album', 'k-pop'],
    },
    {
      productId: 1234567891,
      variantId: 9876543211,
      title: 'Test Album 2',
      variantTitle: 'LP Version',
      vendor: 'Artist 2',
      sku: 'ALB-002',
      barcode: '8809633189506',
      price: '35.00',
      tags: ['album', 'j-pop'],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('syncAlbumProducts', () => {
    it('should sync album products and update cache', async () => {
      (shopifyService.getAlbumProducts as jest.Mock).mockResolvedValue(mockAlbumProducts);

      await syncService.syncAlbumProducts();

      expect(shopifyService.getAlbumProducts).toHaveBeenCalledWith({
        hasBarcode: true,
        tags: ['album'],
        status: 'active',
      });

      const stats = syncService.getStatistics();
      expect(stats.albumProductsCount).toBe(2);
    });

    it('should handle sync failures', async () => {
      (shopifyService.getAlbumProducts as jest.Mock).mockRejectedValue(
        new Error('API Error')
      );

      await expect(syncService.syncAlbumProducts()).rejects.toThrow('API Error');
    });
  });

  describe('processRecentFulfilledOrders', () => {
    beforeEach(async () => {
      // Setup product cache
      (shopifyService.getAlbumProducts as jest.Mock).mockResolvedValue(mockAlbumProducts);
      await syncService.syncAlbumProducts();
    });

    it('should process fulfilled orders and send to Hanteo', async () => {
      const mockOrder: ShopifyOrder = {
        id: 5555555555,
        name: '#1001',
        email: 'customer@example.com',
        created_at: '2025-06-12T10:00:00+09:00',
        updated_at: '2025-06-12T11:00:00+09:00',
        fulfillment_status: 'fulfilled',
        financial_status: 'paid',
        total_price: '25.00',
        currency: 'USD',
        customer: {
          id: 1111111111,
          email: 'customer@example.com',
          first_name: 'Test',
          last_name: 'Customer',
          created_at: '2025-01-01T00:00:00+09:00',
          updated_at: '2025-01-01T00:00:00+09:00',
          tags: 'gender:M,birth_year:1990',
        },
        shipping_address: {
          first_name: 'Test',
          last_name: 'Customer',
          address1: '123 Test St',
          city: 'Seoul',
          province: 'Seoul',
          country: 'South Korea',
          zip: '12345',
          name: 'Test Customer',
          province_code: 'SE',
          country_code: 'KR',
          country_name: 'South Korea',
        },
        line_items: [
          {
            id: 7777777777,
            variant_id: 9876543210, // Matches first album product
            product_id: 1234567890,
            title: 'Test Album 1 - CD Version',
            quantity: 2,
            price: '25.00',
            sku: 'ALB-001',
            variant_title: 'CD Version',
            vendor: 'Artist 1',
            fulfillment_service: 'manual',
            product_exists: true,
            fulfillable_quantity: 0,
            fulfillment_status: 'fulfilled',
          },
        ],
        fulfillments: [
          {
            id: 3333333333,
            order_id: 5555555555,
            status: 'success',
            created_at: '2025-06-12T11:00:00+09:00',
            updated_at: '2025-06-12T11:00:00+09:00',
            tracking_company: 'Korea Post',
            tracking_number: 'KR1234567890',
            line_items: [],
            notify_customer: true,
          },
        ],
      };

      (shopifyService.getFulfilledOrders as jest.Mock).mockResolvedValue([mockOrder]);
      (shopifyService.getOrderFulfillments as jest.Mock).mockResolvedValue(mockOrder.fulfillments);
      (hanteoService.sendSalesDataInBatches as jest.Mock).mockResolvedValue({
        totalSent: 1,
        totalSuccess: 1,
        totalFailed: 0,
        batchResults: [{
          code: 100,
          message: 'Success',
          resultData: {
            requestCount: 1,
            successCount: 1,
            failCount: 0,
          },
        }],
        failedTransactions: [],
      });

      const result = await syncService.processRecentFulfilledOrders({
        hoursAgo: 24,
        limit: 100,
      });

      expect(result).toEqual({
        ordersProcessed: 1,
        transactionsSent: 1,
        transactionsSuccess: 1,
        transactionsFailed: 0,
        errors: [],
      });

      expect(hanteoService.sendSalesDataInBatches).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            orderId: '5555555555',
            orderName: '#1001',
            barcode: '8809633189505',
            albumName: 'Test Album 1 - CD Version',
            quantity: 2,
            customerInfo: expect.objectContaining({
              gender: 'M',
              birthYear: '1990',
            }),
            shippingInfo: expect.objectContaining({
              countryCode: 'KR',
              city: 'Seoul',
            }),
          }),
        ])
      );
    });

    it('should skip orders without album products', async () => {
      const nonAlbumOrder: ShopifyOrder = {
        id: 6666666666,
        name: '#1002',
        email: 'customer2@example.com',
        created_at: '2025-06-12T10:00:00+09:00',
        updated_at: '2025-06-12T11:00:00+09:00',
        fulfillment_status: 'fulfilled',
        financial_status: 'paid',
        total_price: '50.00',
        currency: 'USD',
        customer: {
          id: 2222222222,
          email: 'customer2@example.com',
          first_name: 'Another',
          last_name: 'Customer',
          created_at: '2025-01-01T00:00:00+09:00',
          updated_at: '2025-01-01T00:00:00+09:00',
        },
        line_items: [
          {
            id: 8888888888,
            variant_id: 1234567890, // Not in album products cache
            product_id: 9999999999,
            title: 'T-Shirt - Size M',
            quantity: 1,
            price: '20.00',
            sku: 'SHIRT-001',
            variant_title: 'Size M',
            vendor: 'Merch Vendor',
            fulfillment_service: 'manual',
            product_exists: true,
            fulfillable_quantity: 0,
            fulfillment_status: 'fulfilled',
          },
        ],
        fulfillments: [
          {
            id: 4444444444,
            order_id: 6666666666,
            status: 'success',
            created_at: '2025-06-12T11:00:00+09:00',
            updated_at: '2025-06-12T11:00:00+09:00',
            tracking_number: 'US1234567890',
            line_items: [],
            notify_customer: true,
          },
        ],
      };

      (shopifyService.getFulfilledOrders as jest.Mock).mockResolvedValue([nonAlbumOrder]);

      const result = await syncService.processRecentFulfilledOrders();

      expect(result.ordersProcessed).toBe(1);
      expect(result.transactionsSent).toBe(0);
      expect(hanteoService.sendSalesDataInBatches).not.toHaveBeenCalled();
    });

    it('should handle order processing errors gracefully', async () => {
      const errorOrder: ShopifyOrder = {
        id: 7777777777,
        name: '#1003',
        email: 'error@example.com',
        created_at: '2025-06-12T10:00:00+09:00',
        updated_at: '2025-06-12T11:00:00+09:00',
        fulfillment_status: 'fulfilled',
        financial_status: 'paid',
        total_price: '25.00',
        currency: 'USD',
        customer: null as any, // This will cause an error
        line_items: [],
        fulfillments: [],
      };

      (shopifyService.getFulfilledOrders as jest.Mock).mockResolvedValue([errorOrder]);
      (shopifyService.getOrderFulfillments as jest.Mock).mockRejectedValue(
        new Error('Failed to fetch fulfillments')
      );

      const result = await syncService.processRecentFulfilledOrders();

      expect(result.ordersProcessed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        orderId: '#1003',
        error: 'Failed to fetch fulfillments',
      });
    });
  });

  describe('processWebhookFulfillment', () => {
    beforeEach(async () => {
      // Setup product cache
      (shopifyService.getAlbumProducts as jest.Mock).mockResolvedValue(mockAlbumProducts);
      await syncService.syncAlbumProducts();
    });

    it('should process webhook fulfillment immediately', async () => {
      const webhookPayload = {
        id: 5555555555,
        order_number: 1001,
        fulfillment_status: 'fulfilled',
      };

      const mockOrder = (global as any).testUtils.mockShopifyOrder({
        id: 5555555555,
        line_items: [
          {
            id: 7777777777,
            variant_id: 9876543210,
            product_id: 1234567890,
            quantity: 1,
          },
        ],
      });

      (shopifyService.getOrderById as jest.Mock).mockResolvedValue(mockOrder);
      (hanteoService.sendSalesData as jest.Mock).mockResolvedValue({
        code: 100,
        message: 'Success',
        resultData: {
          requestCount: 1,
          successCount: 1,
          failCount: 0,
        },
      });

      await syncService.processWebhookFulfillment(webhookPayload);

      expect(shopifyService.getOrderById).toHaveBeenCalledWith(5555555555);
      expect(hanteoService.sendSalesData).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            orderId: '5555555555',
            barcode: '8809633189505',
          }),
        ])
      );
    });

    it('should handle webhook processing errors', async () => {
      const webhookPayload = { id: 9999999999 };

      (shopifyService.getOrderById as jest.Mock).mockRejectedValue(
        new Error('Order not found')
      );

      await expect(syncService.processWebhookFulfillment(webhookPayload))
        .rejects.toThrow('Order not found');
    });
  });

  describe('cache management', () => {
    it('should refresh cache when TTL expires', async () => {
      (shopifyService.getAlbumProducts as jest.Mock).mockResolvedValue(mockAlbumProducts);

      // Initial sync
      await syncService.syncAlbumProducts();
      expect(shopifyService.getAlbumProducts).toHaveBeenCalledTimes(1);

      // Mock time passing (less than TTL)
      const originalDate = Date.now;
      Date.now = jest.fn(() => originalDate() + 30 * 60 * 1000); // 30 minutes later

      // Process orders - should not refresh cache
      (shopifyService.getFulfilledOrders as jest.Mock).mockResolvedValue([]);
      await syncService.processRecentFulfilledOrders();
      expect(shopifyService.getAlbumProducts).toHaveBeenCalledTimes(1);

      // Mock time passing (more than TTL)
      Date.now = jest.fn(() => originalDate() + 90 * 60 * 1000); // 90 minutes later

      // Process orders - should refresh cache
      await syncService.processRecentFulfilledOrders();
      expect(shopifyService.getAlbumProducts).toHaveBeenCalledTimes(2);

      // Restore Date.now
      Date.now = originalDate;
    });
  });
});