// Hanteo API Models

export interface HanteoTokenResponse {
  code: number;
  message: string;
  resultData?: {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope?: string;
    jti?: string;
  };
}

export interface HanteoSalesData {
  familyCode: string;
  branchCode: string;
  barcode: string;
  albumName: string;
  salesVolume: number;
  nation?: string;
  addrTop?: string;
  swsSex?: string;
  swsBirth?: string;
  spCode?: string;
  realTime: number; // Unix timestamp
  opVal: string; // Unique order identifier
}

export interface HanteoSalesRequest {
  salesData: HanteoSalesData[];
}

export interface HanteoSalesResponse {
  code: number;
  message: string;
  resultData?: {
    requestCount: number;
    successCount: number;
    successData?: Record<string, string>;
    failCount: number;
    failData?: Record<string, string>; // opVal -> error code mapping
  };
}

export interface HanteoToken {
  accessToken: string;
  tokenType: string;
  expiresAt: Date;
}

export interface SalesTransaction {
  orderId: string;
  orderName: string;
  fulfillmentId?: string;
  lineItemId: string;
  productId: string;
  variantId: string;
  barcode: string;
  albumName: string;
  quantity: number;
  customerInfo?: {
    id: string;
    email?: string;
    gender?: string;
    birthYear?: string;
  };
  shippingInfo?: {
    country: string;
    countryCode: string;
    city?: string;
    province?: string;
  };
  transactionTime: Date;
  trackingNumber?: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  errorMessage?: string;
  hanteoResponse?: HanteoSalesResponse;
}