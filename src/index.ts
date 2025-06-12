import express from 'express';
import cron from 'node-cron';
import { config } from './config';
import { shopifyService } from './services/shopify.service';
import { hanteoService } from './services/hanteo.service';
import { syncService } from './services/sync.service';
import { webhookRoutes } from './webhooks/order-fulfillment.webhook';
import { logger, loggers } from './utils/logger';
import { AppError } from './utils/error-handler';
import { httpMetricsMiddleware, metricsHandler, updateCacheMetrics } from './monitoring/metrics';

const app = express();
const appLogger = loggers.api;

// Middleware for raw body (needed for webhook verification)
app.use('/webhooks', express.raw({ type: 'application/json' }));

// Regular JSON parsing for other routes
app.use(express.json());

// Metrics middleware (exclude metrics endpoint itself)
app.use((req, res, next) => {
  if (req.path !== '/metrics') {
    httpMetricsMiddleware(req, res, next);
  } else {
    next();
  }
});

// Health check endpoint
app.get('/health', (_req, res) => {
  const stats = syncService.getStatistics();
  res.json({
    status: 'healthy',
    environment: config.app.env,
    hanteoEnv: config.hanteo.env,
    statistics: stats,
    timestamp: new Date().toISOString(),
  });
});

// Metrics endpoint
app.get('/metrics', metricsHandler);

// Webhook routes
webhookRoutes.forEach(({ path, handler }) => {
  app.post(path, handler);
});

// Manual sync endpoint (protected in production)
app.post('/sync/orders', async (req, res, next) => {
  try {
    // In production, this should be protected with authentication
    if (config.app.env === 'production') {
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${process.env.SYNC_API_KEY}`) {
        throw new AppError('Unauthorized', 401);
      }
    }

    const { hoursAgo = 24, limit = 250 } = req.body;
    
    appLogger.info({ hoursAgo, limit }, 'Manual sync triggered');
    
    const results = await syncService.processRecentFulfilledOrders({
      hoursAgo,
      limit,
    });

    res.json({
      status: 'success',
      results,
    });

  } catch (error) {
    next(error);
  }
});

// Error handling middleware
app.use((err: Error | AppError, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err.message || 'Internal server error';

  appLogger.error({
    error: err,
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
    },
  }, 'Request error');

  res.status(statusCode).json({
    error: {
      message,
      ...(config.app.env !== 'production' && { stack: err.stack }),
    },
  });
});

// Initialize application
async function initialize() {
  try {
    logger.info('Initializing Shopify-Hanteo integration service');

    // Validate configurations
    const hanteoValid = await hanteoService.validateConfiguration();
    if (!hanteoValid) {
      throw new Error('Hanteo configuration validation failed');
    }

    // Initial product sync (optional - don't fail if it doesn't work)
    try {
      await syncService.syncAlbumProducts();
    } catch (error) {
      logger.warn({ error }, 'Initial product sync failed - continuing without product cache');
      logger.info('Products will be synced on the next scheduled run or can be synced manually');
    }

    // Register webhooks
    const webhookUrl = process.env.WEBHOOK_URL || `https://your-domain.com`;
    const webhookTopics = [
      'orders/fulfilled',
      'fulfillments/create',
      'fulfillments/update',
      'orders/updated',
    ];

    for (const topic of webhookTopics) {
      try {
        await shopifyService.registerWebhook(
          topic,
          `${webhookUrl}/webhooks/${topic.replace('/', '-')}`
        );
      } catch (error) {
        appLogger.warn({ error, topic }, 'Failed to register webhook');
      }
    }

    // List registered webhooks
    const webhooks = await shopifyService.listWebhooks();
    appLogger.info({ webhooks: webhooks.length }, 'Registered webhooks');

    // Setup cron jobs
    setupCronJobs();

    // Start server
    const server = app.listen(config.app.port, () => {
      logger.info({
        port: config.app.port,
        env: config.app.env,
        hanteoEnv: config.hanteo.env,
      }, 'Server started successfully');
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });

      // Force exit after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    });

  } catch (error) {
    logger.fatal({ error }, 'Failed to initialize application');
    process.exit(1);
  }
}

// Setup scheduled tasks
function setupCronJobs() {
  // Sync products every hour
  cron.schedule('0 * * * *', async () => {
    logger.info('Running scheduled product sync');
    try {
      await syncService.syncAlbumProducts();
      
      // Update cache metrics
      const stats = syncService.getStatistics();
      updateCacheMetrics(stats.albumProductsCount, stats.cacheAge / 1000);
    } catch (error) {
      logger.error({ error }, 'Scheduled product sync failed');
    }
  });

  // Process recent orders every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    logger.info('Running scheduled order sync');
    try {
      await syncService.processRecentFulfilledOrders({
        hoursAgo: 2, // Check last 2 hours
        limit: 100,
      });
    } catch (error) {
      logger.error({ error }, 'Scheduled order sync failed');
    }
  });

  // Daily comprehensive sync at 3 AM KST
  cron.schedule('0 3 * * *', async () => {
    logger.info('Running daily comprehensive sync');
    try {
      await syncService.processRecentFulfilledOrders({
        hoursAgo: 24,
        limit: 1000,
      });
    } catch (error) {
      logger.error({ error }, 'Daily comprehensive sync failed');
    }
  }, {
    timezone: 'Asia/Seoul',
  });

  // Update metrics every minute
  cron.schedule('* * * * *', () => {
    const stats = syncService.getStatistics();
    updateCacheMetrics(stats.albumProductsCount, stats.cacheAge / 1000);
  });

  logger.info('Cron jobs scheduled');
}

// Start the application
initialize().catch((error) => {
  logger.fatal({ error }, 'Application failed to start');
  process.exit(1);
});