import axios from 'axios';
import { HanteoService } from '../../src/services/hanteo.service';
import { config } from '../../src/config';
import { HANTEO_RESPONSE_CODES } from '../../src/config/hanteo.config';
import { HanteoError, AuthenticationError } from '../../src/utils/error-handler';
import { SalesTransaction } from '../../src/models/sales.model';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HanteoService', () => {
  let hanteoService: HanteoService;
  let mockAxiosInstance: any;

  beforeEach(() => {
    // Mock axios instance
    mockAxiosInstance = {
      post: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    // Create service instance
    hanteoService = new HanteoService();
  });

  describe('authenticate', () => {
    it('should successfully authenticate and store token', async () => {
      const mockTokenResponse = {
        data: {
          code: 100,
          message: 'Success',
          resultData: {
            access_token: 'test-token-123',
            token_type: 'bearer',
            expires_in: 3600,
            scope: 'sales',
            jti: 'jwt-id-123',
          },
        },
      };

      mockAxiosInstance.post.mockResolvedValueOnce(mockTokenResponse);

      await hanteoService.authenticate();

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        expect.stringContaining('/oauth/token'),
        null,
        expect.objectContaining({
          headers: {
            Authorization: `Basic ${config.hanteo.clientKey}`,
          },
        })
      );

      // Check token is stored (we can't directly access private property)
      // So we'll test it indirectly by calling sendSalesData
    });

    it('should throw AuthenticationError on failed authentication', async () => {
      const mockErrorResponse = {
        data: {
          code: 821,
          message: 'Invalid credentials',
          resultData: null,
        },
      };

      mockAxiosInstance.post.mockResolvedValueOnce(mockErrorResponse);

      await expect(hanteoService.authenticate()).rejects.toThrow(AuthenticationError);
    });

    it('should handle network errors during authentication', async () => {
      mockAxiosInstance.post.mockRejectedValueOnce(new Error('Network error'));

      await expect(hanteoService.authenticate()).rejects.toThrow(HanteoError);
    });
  });

  describe('sendSalesData', () => {
    const mockTransaction: SalesTransaction = {
      orderId: '12345',
      orderName: '#1001',
      fulfillmentId: '67890',
      lineItemId: '11111',
      productId: '22222',
      variantId: '33333',
      barcode: '8809633189505',
      albumName: 'Test Album - CD Version',
      quantity: 2,
      customerInfo: {
        id: '44444',
        email: 'test@example.com',
        gender: 'M',
        birthYear: '1990',
      },
      shippingInfo: {
        country: 'South Korea',
        countryCode: 'KR',
        city: 'Seoul',
        province: 'Seoul',
      },
      transactionTime: new Date('2025-06-12T10:00:00+09:00'),
      trackingNumber: 'KR1234567890',
      status: 'pending',
    };

    beforeEach(async () => {
      // Mock successful authentication
      const mockTokenResponse = {
        data: {
          code: 100,
          message: 'Success',
          resultData: {
            access_token: 'test-token-123',
            token_type: 'bearer',
            expires_in: 3600,
          },
        },
      };
      mockAxiosInstance.post.mockResolvedValueOnce(mockTokenResponse);
      await hanteoService.authenticate();
    });

    it('should successfully send sales data', async () => {
      const mockSalesResponse = {
        data: {
          code: 100,
          message: 'Success',
          resultData: {
            requestCount: 1,
            successCount: 1,
            failCount: 0,
            successData: {},
            failData: {},
          },
        },
      };

      mockAxiosInstance.post.mockResolvedValueOnce(mockSalesResponse);

      const result = await hanteoService.sendSalesData([mockTransaction]);

      expect(result).toEqual(mockSalesResponse.data);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        expect.stringContaining('/v4/collect/realtimedata/ALBUM'),
        expect.arrayContaining([
          expect.objectContaining({
            familyCode: config.hanteo.familyCode,
            branchCode: config.hanteo.branchCode,
            barcode: mockTransaction.barcode,
            albumName: mockTransaction.albumName,
            salesVolume: mockTransaction.quantity,
            nation: 'KR',
            addrTop: 'Seoul',
            swsSex: 'M',
            swsBirth: '1990',
            spCode: '44444',
            realTime: expect.any(Number),
            opVal: expect.stringMatching(/^12345-11111-\d+$/),
          }),
        ]),
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test-token-123',
          },
        })
      );
    });

    it('should handle partial success', async () => {
      const mockPartialResponse = {
        data: {
          code: 101,
          message: 'Partial success',
          resultData: {
            requestCount: 2,
            successCount: 1,
            failCount: 1,
            successData: {},
            failData: {
              'order1-item1-123': '404_UC',
            },
          },
        },
      };

      mockAxiosInstance.post.mockResolvedValueOnce(mockPartialResponse);

      await expect(hanteoService.sendSalesData([mockTransaction]))
        .rejects.toThrow(HanteoError);
    });

    it('should handle empty transactions array', async () => {
      const result = await hanteoService.sendSalesData([]);

      expect(result.code).toBe(HANTEO_RESPONSE_CODES.SUCCESS);
      expect(result.resultData?.requestCount).toBe(0);
      expect(mockAxiosInstance.post).not.toHaveBeenCalledWith(
        expect.stringContaining('/v4/collect/realtimedata/ALBUM'),
        expect.anything(),
        expect.anything()
      );
    });

    it('should re-authenticate on token expiration', async () => {
      // First call fails with 401
      mockAxiosInstance.post.mockRejectedValueOnce({
        response: { status: 401 },
      });

      // Re-authentication succeeds
      const mockNewTokenResponse = {
        data: {
          code: 100,
          message: 'Success',
          resultData: {
            access_token: 'new-token-456',
            token_type: 'bearer',
            expires_in: 3600,
          },
        },
      };
      mockAxiosInstance.post.mockResolvedValueOnce(mockNewTokenResponse);

      // Retry succeeds
      const mockSalesResponse = {
        data: {
          code: 100,
          message: 'Success',
          resultData: {
            requestCount: 1,
            successCount: 1,
            failCount: 0,
          },
        },
      };
      mockAxiosInstance.post.mockResolvedValueOnce(mockSalesResponse);

      const result = await hanteoService.sendSalesData([mockTransaction]);

      expect(result).toEqual(mockSalesResponse.data);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3); // Initial fail + re-auth + retry
    });

    it('should throw error when batch size exceeds limit', async () => {
      const tooManyTransactions = Array(101).fill(mockTransaction);

      await expect(hanteoService.sendSalesData(tooManyTransactions))
        .rejects.toThrow(HanteoError);
    });
  });

  describe('sendSalesDataInBatches', () => {
    const createMockTransactions = (count: number): SalesTransaction[] => {
      return Array(count).fill(null).map((_, index) => ({
        orderId: `order-${index}`,
        orderName: `#${1000 + index}`,
        lineItemId: `item-${index}`,
        productId: '12345',
        variantId: '67890',
        barcode: '8809633189505',
        albumName: 'Test Album',
        quantity: 1,
        transactionTime: new Date(),
        status: 'pending' as const,
      }));
    };

    beforeEach(async () => {
      // Mock authentication
      const mockTokenResponse = {
        data: {
          code: 100,
          resultData: {
            access_token: 'test-token',
            token_type: 'bearer',
            expires_in: 3600,
          },
        },
      };
      mockAxiosInstance.post.mockResolvedValueOnce(mockTokenResponse);
      await hanteoService.authenticate();
    });

    it('should process transactions in batches', async () => {
      const transactions = createMockTransactions(250);
      
      // Mock successful responses for each batch
      const mockSuccessResponse = {
        data: {
          code: 100,
          message: 'Success',
          resultData: {
            requestCount: 100,
            successCount: 100,
            failCount: 0,
            successData: {},
            failData: {},
          },
        },
      };

      // Expect 3 batches (100 + 100 + 50)
      mockAxiosInstance.post
        .mockResolvedValueOnce(mockSuccessResponse)
        .mockResolvedValueOnce(mockSuccessResponse)
        .mockResolvedValueOnce({
          data: {
            ...mockSuccessResponse.data,
            resultData: {
              ...mockSuccessResponse.data.resultData,
              requestCount: 50,
              successCount: 50,
            },
          },
        });

      const result = await hanteoService.sendSalesDataInBatches(transactions, {
        batchSize: 100,
        delayBetweenBatches: 10,
      });

      expect(result.totalSent).toBe(250);
      expect(result.totalSuccess).toBe(250);
      expect(result.totalFailed).toBe(0);
      expect(result.batchResults).toHaveLength(3);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
    });

    it('should handle batch failures gracefully', async () => {
      const transactions = createMockTransactions(200);

      // First batch succeeds
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          code: 100,
          resultData: {
            requestCount: 100,
            successCount: 100,
            failCount: 0,
          },
        },
      });

      // Second batch fails
      mockAxiosInstance.post.mockRejectedValueOnce(new Error('Network error'));

      const result = await hanteoService.sendSalesDataInBatches(transactions, {
        batchSize: 100,
      });

      expect(result.totalSuccess).toBe(100);
      expect(result.totalFailed).toBe(100);
      expect(result.failedTransactions).toHaveLength(100);
      expect(result.batchResults).toHaveLength(1);
    });
  });

  describe('validateConfiguration', () => {
    it('should return true for valid configuration', async () => {
      const mockTokenResponse = {
        data: {
          code: 100,
          resultData: {
            access_token: 'test-token',
            token_type: 'bearer',
            expires_in: 3600,
          },
        },
      };

      mockAxiosInstance.post.mockResolvedValueOnce(mockTokenResponse);

      const isValid = await hanteoService.validateConfiguration();
      expect(isValid).toBe(true);
    });

    it('should return false for invalid configuration', async () => {
      mockAxiosInstance.post.mockRejectedValueOnce(new Error('Auth failed'));

      const isValid = await hanteoService.validateConfiguration();
      expect(isValid).toBe(false);
    });
  });

  describe('getCountryCode', () => {
    it('should return correct country codes', () => {
      expect(HanteoService.getCountryCode('United States')).toBe('US');
      expect(HanteoService.getCountryCode('South Korea')).toBe('KR');
      expect(HanteoService.getCountryCode('Japan')).toBe('JP');
      expect(HanteoService.getCountryCode('Unknown Country')).toBe('XX');
    });
  });
});