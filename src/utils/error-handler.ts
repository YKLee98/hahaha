import { AxiosError } from 'axios';
import { logger } from './logger';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ShopifyError extends AppError {
  constructor(message: string, details?: any) {
    super(`Shopify Error: ${message}`, 503, true, details);
  }
}

export class HanteoError extends AppError {
  public readonly code?: number;
  public readonly failedData?: any;

  constructor(message: string, code?: number, details?: any, failedData?: any) {
    super(`Hanteo Error: ${message}`, 503, true, details);
    this.code = code;
    this.failedData = failedData;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(`Validation Error: ${message}`, 400, true, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, true);
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfter?: number;

  constructor(message: string = 'Rate limit exceeded', retryAfter?: number) {
    super(message, 429, true);
    this.retryAfter = retryAfter;
  }
}

// Error handler middleware
export const errorHandler = (error: Error | AppError | AxiosError) => {
  // Log error details
  logger.error({
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error instanceof AppError && {
        statusCode: error.statusCode,
        isOperational: error.isOperational,
        details: error.details,
      }),
      ...(error instanceof AxiosError && {
        response: {
          status: error.response?.status,
          data: error.response?.data,
          headers: error.response?.headers,
        },
        request: {
          method: error.config?.method,
          url: error.config?.url,
        },
      }),
    },
  });

  // Handle specific error types
  if (error instanceof AxiosError) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      if (status === 429) {
        const retryAfter = error.response.headers['retry-after'];
        throw new RateLimitError('API rate limit exceeded', retryAfter);
      }

      if (status === 401) {
        throw new AuthenticationError(data?.message || 'Authentication failed');
      }

      throw new AppError(
        data?.message || `Request failed with status ${status}`,
        status,
        true,
        data
      );
    } else if (error.request) {
      throw new AppError('No response received from server', 503, true);
    }
  }

  // Re-throw operational errors
  if (error instanceof AppError && error.isOperational) {
    throw error;
  }

  // For programming errors, log and throw generic error
  logger.fatal(error, 'Unexpected error occurred');
  throw new AppError('Internal server error', 500, false);
};

// Async error wrapper for Express routes
export const asyncHandler = (fn: Function) => {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Retry mechanism for network requests
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> => {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    factor = 2,
    onRetry,
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        throw lastError;
      }

      const delay = Math.min(initialDelay * Math.pow(factor, attempt), maxDelay);

      if (onRetry) {
        onRetry(lastError, attempt + 1);
      }

      logger.warn(
        {
          error: lastError.message,
          attempt: attempt + 1,
          nextRetryIn: delay,
        },
        'Retrying failed operation'
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
};