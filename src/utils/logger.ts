import pino from 'pino';
import { config } from '../config';

const isProduction = config.app.env === 'production';

const baseConfig = {
  level: config.app.logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    bindings: (bindings: any) => {
      return {
        pid: bindings.pid,
        hostname: bindings.hostname,
        node_version: process.version,
      };
    },
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-shopify-hmac-sha256"]',
      'accessToken',
      'access_token',
      'customer.email',
      'customer.phone',
      'shipping_address.phone',
      'email',
      'swsBirth',
    ],
    censor: '[REDACTED]',
  },
};

const devConfig = {
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss.l',
      ignore: 'pid,hostname',
      singleLine: false,
      errorProps: 'stack',
    },
  },
};

export const logger = pino({
  ...baseConfig,
  ...(isProduction ? {} : devConfig),
});

// Create child loggers for different services
export const createLogger = (service: string) => {
  return logger.child({ service });
};

// Structured logging helpers
export const loggers = {
  shopify: createLogger('shopify'),
  hanteo: createLogger('hanteo'),
  webhook: createLogger('webhook'),
  sync: createLogger('sync'),
  api: createLogger('api'),
};

// Log request/response for debugging
export const logHttpRequest = (
  logger: pino.Logger,
  method: string,
  url: string,
  data?: any,
  headers?: any
) => {
  logger.debug(
    {
      method,
      url,
      ...(data && { body: data }),
      ...(headers && { headers }),
    },
    'HTTP Request'
  );
};

export const logHttpResponse = (
  logger: pino.Logger,
  status: number,
  data: any,
  duration?: number
) => {
  const level = status >= 400 ? 'error' : 'debug';
  logger[level](
    {
      status,
      ...(duration && { duration_ms: duration }),
      response: data,
    },
    'HTTP Response'
  );
};

export default logger;