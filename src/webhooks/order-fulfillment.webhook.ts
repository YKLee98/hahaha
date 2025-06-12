import { Request, Response } from 'express';
import crypto from 'crypto';
import { syncService } from '../services/sync.service';
import { config } from '../config';
import { loggers } from '../utils/logger';
import { asyncHandler } from '../utils/error-handler';

const logger = loggers.webhook;

/**
 * Verify Shopify webhook signature
 */
export const verifyWebhookSignature = (
  rawBody: string,
  signature: string,
  secret: string
): boolean => {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');

  return hash === signature;
};

/**
 * Handle order fulfillment webhook
 */
export const handleOrderFulfillment = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const topic = req.headers['x-shopify-topic'] as string;
    const hmac = req.headers['x-shopify-hmac-sha256'] as string;
    const shop = req.headers['x-shopify-shop-domain'] as string;

    logger.info({ topic, shop }, 'Received webhook');

    // Verify webhook if secret is configured
    if (config.shopify.webhookSecret) {
      const rawBody = (req as any).rawBody;
      const isValid = verifyWebhookSignature(
        rawBody,
        hmac,
        config.shopify.webhookSecret
      );

      if (!isValid) {
        logger.error({ topic, shop }, 'Invalid webhook signature');
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }

    // Process different topics
    switch (topic) {
      case 'orders/fulfilled':
      case 'fulfillments/create':
      case 'fulfillments/update':
        await processOrderFulfillment(req.body);
        break;

      case 'orders/updated':
        // Only process if order is fulfilled
        if (req.body.fulfillment_status === 'fulfilled' || 
            req.body.fulfillment_status === 'partial') {
          await processOrderFulfillment(req.body);
        }
        break;

      default:
        logger.warn({ topic }, 'Unhandled webhook topic');
    }

    // Always respond quickly to webhooks
    res.status(200).json({ status: 'received' });
  }
);

/**
 * Process order fulfillment in the background
 */
const processOrderFulfillment = async (payload: any) => {
  // Process asynchronously to avoid webhook timeout
  setImmediate(async () => {
    try {
      await syncService.processWebhookFulfillment(payload);
    } catch (error) {
      logger.error({ error, orderId: payload.id }, 'Failed to process fulfillment webhook');
      // Don't throw - webhook already responded
    }
  });
};

/**
 * Webhook routes configuration
 */
export const webhookRoutes = [
  {
    path: '/webhooks/orders/fulfilled',
    handler: handleOrderFulfillment,
  },
  {
    path: '/webhooks/fulfillments/create',
    handler: handleOrderFulfillment,
  },
  {
    path: '/webhooks/fulfillments/update',
    handler: handleOrderFulfillment,
  },
  {
    path: '/webhooks/orders/updated',
    handler: handleOrderFulfillment,
  },
];