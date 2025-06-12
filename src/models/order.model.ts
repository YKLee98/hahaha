export interface ShopifyOrder {
  id: number;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
  fulfilled_at?: string;
  fulfillment_status: string;
  financial_status: string;
  total_price: string;
  currency: string;
  customer: ShopifyCustomer;
  line_items: ShopifyLineItem[];
  shipping_address?: ShopifyAddress;
  fulfillments?: ShopifyFulfillment[];
}

export interface ShopifyCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  created_at: string;
  updated_at: string;
  tags?: string;
  note?: string;
}

export interface ShopifyLineItem {
  id: number;
  variant_id: number;
  product_id: number;
  title: string;
  quantity: number;
  price: string;
  sku: string;
  variant_title: string;
  vendor: string;
  fulfillment_service: string;
  product_exists: boolean;
  fulfillable_quantity: number;
  fulfillment_status: string;
  properties?: Array<{ name: string; value: string }>;
}

export interface ShopifyAddress {
  first_name: string;
  last_name: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone?: string;
  name: string;
  province_code: string;
  country_code: string;
  country_name: string;
  latitude?: number;
  longitude?: number;
}

export interface ShopifyFulfillment {
  id: number;
  order_id: number;
  status: string;
  created_at: string;
  updated_at: string;
  tracking_company?: string;
  tracking_number?: string;
  tracking_numbers?: string[];
  tracking_urls?: string[];
  line_items: ShopifyLineItem[];
  notify_customer: boolean;
  shipment_status?: string;
}

export interface OrderFilter {
  status?: string;
  fulfillment_status?: string;
  financial_status?: string;
  created_at_min?: string;
  created_at_max?: string;
  updated_at_min?: string;
  updated_at_max?: string;
  limit?: number;
  page?: number;
}