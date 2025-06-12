#!/usr/bin/env node

import { shopifyService } from '../services/shopify.service';
import { logger } from '../utils/logger';

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://your-domain.com';

const webhookEndpoints = [
  { topic: 'orders/fulfilled', path: '/webhooks/orders/fulfilled' },
  { topic: 'fulfillments/create', path: '/webhooks/fulfillments/create' },
  { topic: 'fulfillments/update', path: '/webhooks/fulfillments/update' },
  { topic: 'orders/updated', path: '/webhooks/orders/updated' },
];

async function setupWebhooks() {
  logger.info('Setting up Shopify webhooks...');

  try {
    // List existing webhooks
    const existingWebhooks = await shopifyService.listWebhooks();
    logger.info({ count: existingWebhooks.length }, 'Existing webhooks found');

    // Register new webhooks
    for (const { topic, path } of webhookEndpoints) {
      const address = `${WEBHOOK_URL}${path}`;
      
      // Check if webhook already exists
      const exists = existingWebhooks.some(
        (webhook) => webhook.topic === topic && webhook.address === address
      );

      if (exists) {
        logger.info({ topic, address }, 'Webhook already exists');
        continue;
      }

      try {
        await shopifyService.registerWebhook(topic, address);
        logger.info({ topic, address }, 'Webhook registered successfully');
      } catch (error: any) {
        if (error.message?.includes('already exists')) {
          logger.info({ topic }, 'Webhook already exists');
        } else {
          logger.error({ error, topic, address }, 'Failed to register webhook');
        }
      }
    }

    // List all webhooks after setup
    const finalWebhooks = await shopifyService.listWebhooks();
    logger.info('Registered webhooks:');
    finalWebhooks.forEach((webhook) => {
      logger.info({
        id: webhook.id,
        topic: webhook.topic,
        address: webhook.address,
        created: webhook.created_at,
      });
    });

    logger.info('Webhook setup completed');

  } catch (error) {
    logger.error({ error }, 'Webhook setup failed');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  setupWebhooks()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error({ error }, 'Script failed');
      process.exit(1);
    });
}