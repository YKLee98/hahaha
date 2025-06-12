import { Request, Response } from 'express';
import crypto from 'crypto';
import {
  verifyWebhookSignature,
  handleOrderFulfillment,
} from '../../src/webhooks/order-fulfillment.webhook';
import { syncService } from '../../src/services/sync.service';
import { config } from '../../src/config';

// Mock dependencies
jest.mock('../../src/services/sync.service');
jest.mock('../../src/config', () => ({
  config: {
    shopify: {
      webhookSecret: 'test-webhook-secret',
    },
  },
}));

describe('Order Fulfillment Webhook', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let responseJson: jest.Mock;
  let responseStatus: jest.Mock;

  beforeEach(() => {
    // Setup mock response
    responseJson = jest.fn();
    responseStatus = jest.fn(() => ({ json: responseJson }));
    
    mockResponse = {
      status: responseStatus,
      json: responseJson,
    };

    // Setup base mock request
    mockRequest = {
      headers: {
        'x-shopify-topic': 'orders/fulfilled',
        'x-shopify-hmac-sha256': 'test-hmac',
        'x-shopify-shop-domain': 'test-shop.myshopify.com',
      },
      body: {
        id: 12345,
        name: '#1001',
        fulfillment_status: 'fulfilled',
      },
    };

    // Clear mocks
    jest.clearAllMocks();
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid webhook signature', () => {
      const rawBody = JSON.stringify({ test: 'data' });
      const secret = 'webhook-secret';
      const validHash = crypto
        .createHmac('sha256', secret)
        .update(rawBody, 'utf8')
        .digest('base64');

      const isValid = verifyWebhookSignature(rawBody, validHash, secret);
      expect(isValid).toBe(true);
    });

    it('should reject invalid webhook signature', () => {
      const rawBody = JSON.stringify({ test: 'data' });
      const secret = 'webhook-secret';
      const invalidHash = 'invalid-hash';

      const isValid = verifyWebhookSignature(rawBody, invalidHash, secret);
      expect(isValid).toBe(false);
    });
  });

  describe('handleOrderFulfillment', () => {
    it('should process orders/fulfilled webhook', async () => {
      const handler = handleOrderFulfillment as any;
      
      await handler(mockRequest, mockResponse, jest.fn());

      expect(responseStatus).toHaveBeenCalledWith(200);
      expect(responseJson).toHaveBeenCalledWith({ status: 'received' });

      // Wait for async processing
      await new Promise(resolve => setImmediate(resolve));
      
      expect(syncService.processWebhookFulfillment).toHaveBeenCalledWith({
        id: 12345,
        name: '#1001',
        fulfillment_status: 'fulfilled',
      });
    });

    it('should process fulfillments/create webhook', async () => {
      mockRequest.headers!['x-shopify-topic'] = 'fulfillments/create';
      const handler = handleOrderFulfillment as any;
      
      await handler(mockRequest, mockResponse, jest.fn());

      expect(responseStatus).toHaveBeenCalledWith(200);
      
      await new Promise(resolve => setImmediate(resolve));
      expect(syncService.processWebhookFulfillment).toHaveBeenCalled();
    });

    it('should process fulfillments/update webhook', async () => {
      mockRequest.headers!['x-shopify-topic'] = 'fulfillments/update';
      const handler = handleOrderFulfillment as any;
      
      await handler(mockRequest, mockResponse, jest.fn());

      expect(responseStatus).toHaveBeenCalledWith(200);
      
      await new Promise(resolve => setImmediate(resolve));
      expect(syncService.processWebhookFulfillment).toHaveBeenCalled();
    });

    it('should process orders/updated webhook only if fulfilled', async () => {
      mockRequest.headers!['x-shopify-topic'] = 'orders/updated';
      mockRequest.body.fulfillment_status = 'fulfilled';
      const handler = handleOrderFulfillment as any;
      
      await handler(mockRequest, mockResponse, jest.fn());

      await new Promise(resolve => setImmediate(resolve));
      expect(syncService.processWebhookFulfillment).toHaveBeenCalled();
    });

    it('should skip orders/updated webhook if not fulfilled', async () => {
      mockRequest.headers!['x-shopify-topic'] = 'orders/updated';
      mockRequest.body.fulfillment_status = 'pending';
      const handler = handleOrderFulfillment as any;
      
      await handler(mockRequest, mockResponse, jest.fn());

      await new Promise(resolve => setImmediate(resolve));
      expect(syncService.processWebhookFulfillment).not.toHaveBeenCalled();
    });

    it('should handle unknown webhook topics', async () => {
      mockRequest.headers!['x-shopify-topic'] = 'unknown/topic';
      const handler = handleOrderFulfillment as any;
      
      await handler(mockRequest, mockResponse, jest.fn());

      expect(responseStatus).toHaveBeenCalledWith(200);
      
      await new Promise(resolve => setImmediate(resolve));
      expect(syncService.processWebhookFulfillment).not.toHaveBeenCalled();
    });

    it('should verify webhook signature when secret is configured', async () => {
      const rawBody = JSON.stringify(mockRequest.body);
      const validHmac = crypto
        .createHmac('sha256', config.shopify.webhookSecret!)
        .update(rawBody, 'utf8')
        .digest('base64');

      (mockRequest as any).rawBody = rawBody;
      mockRequest.headers!['x-shopify-hmac-sha256'] = validHmac;

      const handler = handleOrderFulfillment as any;
      
      await handler(mockRequest, mockResponse, jest.fn());

      expect(responseStatus).toHaveBeenCalledWith(200);
    });

    it('should reject webhook with invalid signature', async () => {
      const rawBody = JSON.stringify(mockRequest.body);
      (mockRequest as any).rawBody = rawBody;
      mockRequest.headers!['x-shopify-hmac-sha256'] = 'invalid-hmac';

      const handler = handleOrderFulfillment as any;
      
      await handler(mockRequest, mockResponse, jest.fn());

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({ error: 'Unauthorized' });
      
      await new Promise(resolve => setImmediate(resolve));
      expect(syncService.processWebhookFulfillment).not.toHaveBeenCalled();
    });

    it('should handle webhook processing errors gracefully', async () => {
      (syncService.processWebhookFulfillment as jest.Mock).mockRejectedValue(
        new Error('Processing error')
      );

      const handler = handleOrderFulfillment as any;
      
      await handler(mockRequest, mockResponse, jest.fn());

      // Should still respond with 200
      expect(responseStatus).toHaveBeenCalledWith(200);
      expect(responseJson).toHaveBeenCalledWith({ status: 'received' });
    });

    it('should skip signature verification if no secret configured', async () => {
      // Temporarily remove webhook secret
      const originalSecret = config.shopify.webhookSecret;
      (config.shopify as any).webhookSecret = undefined;

      mockRequest.headers!['x-shopify-hmac-sha256'] = 'any-value';
      const handler = handleOrderFulfillment as any;
      
      await handler(mockRequest, mockResponse, jest.fn());

      expect(responseStatus).toHaveBeenCalledWith(200);
      
      // Restore secret
      (config.shopify as any).webhookSecret = originalSecret;
    });
  });

  describe('Async processing', () => {
    it('should process webhook asynchronously', async () => {
      let processingStarted = false;
      let processingCompleted = false;

      (syncService.processWebhookFulfillment as jest.Mock).mockImplementation(async () => {
        processingStarted = true;
        await new Promise(resolve => setTimeout(resolve, 100));
        processingCompleted = true;
      });

      const handler = handleOrderFulfillment as any;
      
      await handler(mockRequest, mockResponse, jest.fn());

      // Response should be sent immediately
      expect(responseStatus).toHaveBeenCalledWith(200);
      expect(processingStarted).toBe(false);
      expect(processingCompleted).toBe(false);

      // Wait a bit for async processing to start
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(processingStarted).toBe(true);
      expect(processingCompleted).toBe(false);

      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(processingCompleted).toBe(true);
    });
  });
});