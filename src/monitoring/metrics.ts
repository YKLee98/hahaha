import * as client from 'prom-client';
import { Request, Response, NextFunction } from 'express';

const { Registry, Counter, Histogram, Gauge } = client;

// Create a Registry
export const metricsRegistry = new Registry();

// Default metrics
client.register.setDefaultLabels({
  app: 'shopify-hanteo-integration',
});

// Custom metrics
export const metrics = {
  // HTTP metrics
  httpRequestDuration: new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.5, 1, 2, 5],
    registers: [metricsRegistry],
  }),

  httpRequestTotal: new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [metricsRegistry],
  }),

  // Shopify API metrics
  shopifyApiCalls: new Counter({
    name: 'shopify_api_calls_total',
    help: 'Total number of Shopify API calls',
    labelNames: ['endpoint', 'status'],
    registers: [metricsRegistry],
  }),

  shopifyApiDuration: new Histogram({
    name: 'shopify_api_duration_seconds',
    help: 'Duration of Shopify API calls in seconds',
    labelNames: ['endpoint'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
    registers: [metricsRegistry],
  }),

  // Hanteo API metrics
  hanteoApiCalls: new Counter({
    name: 'hanteo_api_calls_total',
    help: 'Total number of Hanteo API calls',
    labelNames: ['endpoint', 'status'],
    registers: [metricsRegistry],
  }),

  hanteoApiDuration: new Histogram({
    name: 'hanteo_api_duration_seconds',
    help: 'Duration of Hanteo API calls in seconds',
    labelNames: ['endpoint'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
    registers: [metricsRegistry],
  }),

  // Sales sync metrics
  salesTransactions: new Counter({
    name: 'sales_transactions_total',
    help: 'Total number of sales transactions processed',
    labelNames: ['status', 'vendor'],
    registers: [metricsRegistry],
  }),

  salesBatchSize: new Histogram({
    name: 'sales_batch_size',
    help: 'Size of sales batches sent to Hanteo',
    buckets: [1, 5, 10, 25, 50, 100],
    registers: [metricsRegistry],
  }),

  // Webhook metrics
  webhooksReceived: new Counter({
    name: 'webhooks_received_total',
    help: 'Total number of webhooks received',
    labelNames: ['topic', 'status'],
    registers: [metricsRegistry],
  }),

  webhookProcessingDuration: new Histogram({
    name: 'webhook_processing_duration_seconds',
    help: 'Duration of webhook processing in seconds',
    labelNames: ['topic'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
    registers: [metricsRegistry],
  }),

  // Cache metrics
  albumProductsCached: new Gauge({
    name: 'album_products_cached',
    help: 'Number of album products in cache',
    registers: [metricsRegistry],
  }),

  cacheAge: new Gauge({
    name: 'cache_age_seconds',
    help: 'Age of the product cache in seconds',
    registers: [metricsRegistry],
  }),

  // Error metrics
  errors: new Counter({
    name: 'errors_total',
    help: 'Total number of errors',
    labelNames: ['type', 'service'],
    registers: [metricsRegistry],
  }),

  // Business metrics
  ordersProcessed: new Counter({
    name: 'orders_processed_total',
    help: 'Total number of orders processed',
    labelNames: ['status'],
    registers: [metricsRegistry],
  }),

  albumsSold: new Counter({
    name: 'albums_sold_total',
    help: 'Total number of albums sold',
    labelNames: ['vendor', 'country'],
    registers: [metricsRegistry],
  }),
};

// Middleware to track HTTP metrics
export const httpMetricsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    const route = req.route?.path || req.path || 'unknown';
    const method = req.method;
    const statusCode = res.statusCode.toString();

    metrics.httpRequestDuration.observe(
      { method, route, status_code: statusCode },
      duration
    );
    
    metrics.httpRequestTotal.inc({
      method,
      route,
      status_code: statusCode,
    });
  });

  next();
};

// Helper functions to track API metrics
export const trackShopifyApiCall = (
  endpoint: string,
  status: 'success' | 'error',
  duration?: number
) => {
  metrics.shopifyApiCalls.inc({ endpoint, status });
  
  if (duration !== undefined) {
    metrics.shopifyApiDuration.observe({ endpoint }, duration / 1000);
  }
};

export const trackHanteoApiCall = (
  endpoint: string,
  status: 'success' | 'error',
  duration?: number
) => {
  metrics.hanteoApiCalls.inc({ endpoint, status });
  
  if (duration !== undefined) {
    metrics.hanteoApiDuration.observe({ endpoint }, duration / 1000);
  }
};

export const trackSalesTransaction = (
  status: 'success' | 'failed',
  vendor: string,
  count: number = 1
) => {
  metrics.salesTransactions.inc({ status, vendor }, count);
};

export const trackWebhook = (
  topic: string,
  status: 'received' | 'processed' | 'failed',
  duration?: number
) => {
  metrics.webhooksReceived.inc({ topic, status });
  
  if (duration !== undefined && status === 'processed') {
    metrics.webhookProcessingDuration.observe({ topic }, duration / 1000);
  }
};

export const trackError = (type: string, service: string) => {
  metrics.errors.inc({ type, service });
};

export const updateCacheMetrics = (productCount: number, ageInSeconds: number) => {
  metrics.albumProductsCached.set(productCount);
  metrics.cacheAge.set(ageInSeconds);
};

export const trackOrderProcessed = (status: 'success' | 'failed') => {
  metrics.ordersProcessed.inc({ status });
};

export const trackAlbumsSold = (vendor: string, country: string, quantity: number) => {
  metrics.albumsSold.inc({ vendor, country }, quantity);
};

// Export metrics endpoint handler
export const metricsHandler = async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', metricsRegistry.contentType);
    const metrics = await metricsRegistry.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).end();
  }
};