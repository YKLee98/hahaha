// Test setup file for Jest
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Declare global test utilities type
declare global {
  namespace NodeJS {
    interface Global {
      testUtils: {
        mockShopifyProduct: (overrides?: any) => any;
        mockShopifyOrder: (overrides?: any) => any;
        mockHanteoResponse: (overrides?: any) => any;
      };
    }
  }
  
  namespace jest {
    interface Matchers<R> {
      toBeValidBarcode(): R;
    }
  }
}

// Mock logger to reduce noise in tests
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
  loggers: {
    shopify: {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    hanteo: {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    webhook: {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    sync: {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    api: {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  },
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Set test timeout
jest.setTimeout(30000);

// Global test utilities
global.testUtils = {
  // Generate mock Shopify product
  mockShopifyProduct: (overrides = {}) => ({
    id: 1234567890,
    title: 'Test Album',
    vendor: 'Test Artist',
    product_type: 'Music',
    tags: 'album,k-pop',
    status: 'active',
    variants: [
      {
        id: 9876543210,
        product_id: 1234567890,
        title: 'Default Title',
        price: '25.00',
        sku: 'TEST-001',
        barcode: '8809633189505',
        inventory_quantity: 100,
      },
    ],
    ...overrides,
  }),

  // Generate mock Shopify order
  mockShopifyOrder: (overrides = {}) => ({
    id: 5555555555,
    name: '#1001',
    email: 'test@example.com',
    created_at: '2025-06-12T10:00:00+09:00',
    updated_at: '2025-06-12T11:00:00+09:00',
    fulfillment_status: 'fulfilled',
    financial_status: 'paid',
    customer: {
      id: 1111111111,
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'Customer',
    },
    shipping_address: {
      first_name: 'Test',
      last_name: 'Customer',
      address1: '123 Test St',
      city: 'Seoul',
      province: 'Seoul',
      country: 'South Korea',
      zip: '12345',
      country_code: 'KR',
      country_name: 'South Korea',
    },
    line_items: [
      {
        id: 7777777777,
        variant_id: 9876543210,
        product_id: 1234567890,
        title: 'Test Album - Default Title',
        quantity: 1,
        price: '25.00',
        sku: 'TEST-001',
        variant_title: 'Default Title',
        vendor: 'Test Artist',
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
      },
    ],
    ...overrides,
  }),

  // Generate mock Hanteo response
  mockHanteoResponse: (overrides = {}) => ({
    code: 100,
    message: 'Success',
    resultData: {
      requestCount: 1,
      successCount: 1,
      failCount: 0,
      successData: {},
      failData: {},
    },
    ...overrides,
  }),
};

// Extend Jest matchers if needed
expect.extend({
  toBeValidBarcode(received: string) {
    const barcodePatterns = [
      /^[0-9]{13}$/, // EAN13
      /^[0-9]{8}$/,  // EAN8
      /^[0-9]{12}$/, // UPC
    ];
    
    const pass = barcodePatterns.some(pattern => pattern.test(received));
    
    return {
      message: () => `expected ${received} to ${pass ? 'not ' : ''}be a valid barcode`,
      pass,
    };
  },
});

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});