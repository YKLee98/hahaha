// Custom type definitions

// Shopify API types for v11
declare module '@shopify/shopify-api' {
  export interface RestClientResponse<T = any> {
    body: T;
    headers: Record<string, string>;
  }

  export interface GraphQLClientResponse<T = any> {
    body: {
      data: T;
      extensions?: any;
    };
    headers: Record<string, string>;
  }
}

// Express request extension for raw body
declare namespace Express {
  export interface Request {
    rawBody?: string;
  }
}

// Global test utilities
declare global {
  var testUtils: {
    mockShopifyProduct: (overrides?: any) => any;
    mockShopifyOrder: (overrides?: any) => any;
    mockHanteoResponse: (overrides?: any) => any;
  };
}

// Ensure this is treated as a module
export {};