export interface ShopifyProduct {
  id: number;
  title: string;
  vendor: string;
  product_type: string;
  created_at: string;
  updated_at: string;
  published_at: string;
  tags: string;
  status: string;
  variants: ShopifyVariant[];
}

export interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  sku: string;
  barcode: string | null;
  inventory_quantity: number;
  weight: number;
  weight_unit: string;
  created_at: string;
  updated_at: string;
}

export interface AlbumProduct {
  productId: number;
  variantId: number;
  title: string;
  variantTitle: string;
  vendor: string;
  sku: string;
  barcode: string;
  price: string;
  tags: string[];
}

export interface ProductFilter {
  tags?: string[];
  hasBarcode?: boolean;
  vendor?: string;
  productType?: string;
  status?: string;
}