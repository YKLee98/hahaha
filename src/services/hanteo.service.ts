import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { hanteoConfig, HANTEO_RESPONSE_CODES, COUNTRY_CODE_MAP } from '../config/hanteo.config';
import {
  HanteoToken,
  HanteoTokenResponse,
  HanteoSalesData,
  HanteoSalesResponse,
  SalesTransaction,
} from '../models/sales.model';
import { loggers } from '../utils/logger';
import { HanteoError, AuthenticationError, retryWithBackoff } from '../utils/error-handler';
import { generateOpVal, convertGender, isValidTransactionDate } from '../utils/validators';

const logger = loggers.hanteo;

export class HanteoService {
  private axiosInstance: AxiosInstance;
  private token: HanteoToken | null = null;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: config.hanteo.baseUrl,
      timeout: hanteoConfig.timeout,
      headers: hanteoConfig.headers,
    });

    // Add request interceptor for logging
    this.axiosInstance.interceptors.request.use(
      (request) => {
        logger.debug({
          method: request.method,
          url: request.url,
          headers: request.headers,
          ...(request.data && { body: request.data }),
        }, 'Hanteo API Request');
        return request;
      },
      (error) => {
        logger.error({ error }, 'Hanteo API Request Error');
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging
    this.axiosInstance.interceptors.response.use(
      (response) => {
        logger.debug({
          status: response.status,
          headers: response.headers,
          data: response.data,
        }, 'Hanteo API Response');
        return response;
      },
      (error) => {
        logger.error({
          error: error.message,
          response: error.response?.data,
          status: error.response?.status,
        }, 'Hanteo API Response Error');
        return Promise.reject(error);
      }
    );
  }

  /**
   * Authenticate and get access token from Hanteo
   */
  async authenticate(): Promise<void> {
    logger.info('Authenticating with Hanteo API');

    try {
      const response = await this.axiosInstance.post<HanteoTokenResponse>(
        `${hanteoConfig.endpoints.token}?grant_type=${hanteoConfig.tokenGrantType}`,
        null,
        {
          headers: {
            Authorization: `Basic ${config.hanteo.clientKey}`,
          },
        }
      );

      const { code, message, resultData } = response.data;

      if (code !== HANTEO_RESPONSE_CODES.SUCCESS || !resultData) {
        throw new AuthenticationError(`Authentication failed: ${message || 'Unknown error'}`);
      }

      // Store token with expiration
      this.token = {
        accessToken: resultData.access_token,
        tokenType: resultData.token_type,
        expiresAt: new Date(Date.now() + resultData.expires_in * 1000),
      };

      logger.info({
        expiresIn: resultData.expires_in,
        expiresAt: this.token.expiresAt,
      }, 'Authentication successful');

    } catch (error) {
      logger.error({ error }, 'Authentication failed');
      throw new HanteoError('Authentication failed', undefined, error);
    }
  }

  /**
   * Check if token is valid and not expired
   */
  private isTokenValid(): boolean {
    if (!this.token) return false;
    
    // Check if token expires in the next 5 minutes
    const expiryBuffer = 5 * 60 * 1000; // 5 minutes
    return new Date(Date.now() + expiryBuffer) < this.token.expiresAt;
  }

  /**
   * Ensure we have a valid token
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.isTokenValid()) {
      await this.authenticate();
    }
  }

  /**
   * Send sales data to Hanteo
   */
  async sendSalesData(transactions: SalesTransaction[]): Promise<HanteoSalesResponse> {
    await this.ensureAuthenticated();

    if (transactions.length === 0) {
      logger.warn('No transactions to send');
      return {
        code: HANTEO_RESPONSE_CODES.SUCCESS,
        message: 'No data to send',
        resultData: {
          requestCount: 0,
          successCount: 0,
          failCount: 0,
        },
      };
    }

    // Convert transactions to Hanteo format
    const salesData = transactions.map((tx) => this.convertToHanteoFormat(tx));

    // Validate batch size
    if (salesData.length > hanteoConfig.maxBatchSize) {
      throw new HanteoError(
        `Batch size ${salesData.length} exceeds maximum ${hanteoConfig.maxBatchSize}`,
        HANTEO_RESPONSE_CODES.INVALID_DATA
      );
    }

    logger.info({ count: salesData.length }, 'Sending sales data to Hanteo');

    try {
      const response = await retryWithBackoff(
        () => this.axiosInstance.post<HanteoSalesResponse>(
          hanteoConfig.endpoints.salesData,
          salesData,
          {
            headers: {
              Authorization: `Bearer ${this.token!.accessToken}`,
            },
          }
        ),
        {
          maxRetries: hanteoConfig.retryAttempts,
          initialDelay: hanteoConfig.retryDelay,
          onRetry: (error, attempt) => {
            logger.warn({ error: error.message, attempt }, 'Retrying Hanteo sales data submission');
          },
        }
      );

      const result = response.data;

      // Log results
      if (result.resultData) {
        logger.info({
          requested: result.resultData.requestCount,
          success: result.resultData.successCount,
          failed: result.resultData.failCount,
        }, 'Sales data submission completed');

        if (result.resultData.failData) {
          logger.error({ failData: result.resultData.failData }, 'Failed sales records');
        }
      }

      // Handle partial success
      if (result.code === HANTEO_RESPONSE_CODES.PARTIAL_SUCCESS && result.resultData?.failData) {
        throw new HanteoError(
          'Partial success - some records failed',
          result.code,
          result,
          result.resultData.failData
        );
      }

      // Handle complete failure
      if (result.code !== HANTEO_RESPONSE_CODES.SUCCESS && 
          result.code !== HANTEO_RESPONSE_CODES.PARTIAL_SUCCESS) {
        throw new HanteoError(
          result.message || 'Sales data submission failed',
          result.code,
          result
        );
      }

      return result;

    } catch (error: any) {
      // Handle token expiration
      if (error.response?.status === 401 || 
          error.response?.data?.code === HANTEO_RESPONSE_CODES.INVALID_TOKEN ||
          error.response?.data?.code === HANTEO_RESPONSE_CODES.TOKEN_EXPIRED) {
        logger.warn('Token expired, re-authenticating');
        this.token = null;
        await this.authenticate();
        
        // Retry once after re-authentication
        return this.sendSalesData(transactions);
      }

      throw error;
    }
  }

  /**
   * Send sales data in batches
   */
  async sendSalesDataInBatches(
    transactions: SalesTransaction[],
    options: { batchSize?: number; delayBetweenBatches?: number } = {}
  ): Promise<{
    totalSent: number;
    totalSuccess: number;
    totalFailed: number;
    batchResults: HanteoSalesResponse[];
    failedTransactions: Array<{ transaction: SalesTransaction; error: string }>;
  }> {
    const { batchSize = hanteoConfig.maxBatchSize, delayBetweenBatches = 1000 } = options;
    
    const results = {
      totalSent: 0,
      totalSuccess: 0,
      totalFailed: 0,
      batchResults: [] as HanteoSalesResponse[],
      failedTransactions: [] as Array<{ transaction: SalesTransaction; error: string }>,
    };

    // Process in batches
    for (let i = 0; i < transactions.length; i += batchSize) {
      const batch = transactions.slice(i, i + batchSize);
      
      logger.info({
        batchNumber: Math.floor(i / batchSize) + 1,
        totalBatches: Math.ceil(transactions.length / batchSize),
        batchSize: batch.length,
      }, 'Processing batch');

      try {
        const response = await this.sendSalesData(batch);
        results.batchResults.push(response);

        if (response.resultData) {
          results.totalSent += response.resultData.requestCount;
          results.totalSuccess += response.resultData.successCount;
          results.totalFailed += response.resultData.failCount;

          // Track failed transactions
          if (response.resultData.failData) {
            for (const [opVal, errorCode] of Object.entries(response.resultData.failData)) {
              const failedTx = batch.find(tx => 
                generateOpVal(tx.orderId, tx.lineItemId) === opVal
              );
              if (failedTx) {
                results.failedTransactions.push({
                  transaction: failedTx,
                  error: errorCode,
                });
              }
            }
          }
        }

        // Delay between batches to avoid rate limiting
        if (i + batchSize < transactions.length) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }

      } catch (error) {
        logger.error({ error, batchIndex: i }, 'Batch processing failed');
        
        // Track all transactions in failed batch
        batch.forEach(tx => {
          results.failedTransactions.push({
            transaction: tx,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
        
        results.totalFailed += batch.length;
      }
    }

    logger.info({
      totalSent: results.totalSent,
      totalSuccess: results.totalSuccess,
      totalFailed: results.totalFailed,
      batchCount: results.batchResults.length,
    }, 'Batch processing completed');

    return results;
  }

  /**
   * Convert transaction to Hanteo sales data format
   */
  private convertToHanteoFormat(transaction: SalesTransaction): HanteoSalesData {
    // Validate transaction date
    if (!isValidTransactionDate(transaction.transactionTime)) {
      logger.warn({
        orderId: transaction.orderId,
        transactionTime: transaction.transactionTime,
      }, 'Transaction date is not today (KST)');
    }

    return {
      familyCode: config.hanteo.familyCode,
      branchCode: config.hanteo.branchCode,
      barcode: transaction.barcode,
      albumName: transaction.albumName,
      salesVolume: transaction.quantity,
      nation: transaction.shippingInfo?.countryCode,
      addrTop: transaction.shippingInfo?.city,
      swsSex: convertGender(transaction.customerInfo?.gender),
      swsBirth: transaction.customerInfo?.birthYear,
      spCode: transaction.customerInfo?.id,
      realTime: Math.floor(transaction.transactionTime.getTime() / 1000), // Unix timestamp
      opVal: generateOpVal(transaction.orderId, transaction.lineItemId),
    };
  }

  /**
   * Validate Hanteo configuration
   */
  async validateConfiguration(): Promise<boolean> {
    try {
      await this.authenticate();
      logger.info('Hanteo configuration validated successfully');
      return true;
    } catch (error) {
      logger.error({ error }, 'Hanteo configuration validation failed');
      return false;
    }
  }

  /**
   * Get country code from country name
   */
  static getCountryCode(countryName: string): string {
    return COUNTRY_CODE_MAP[countryName] || COUNTRY_CODE_MAP.default;
  }
}

// Export singleton instance
export const hanteoService = new HanteoService();