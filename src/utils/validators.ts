import Joi from 'joi';
import { AlbumProduct } from '../models/product.model';
import { SalesTransaction } from '../models/sales.model';
import { ValidationError } from './error-handler';

// Barcode validation patterns
const BARCODE_PATTERNS = {
  EAN13: /^[0-9]{13}$/,
  EAN8: /^[0-9]{8}$/,
  UPC: /^[0-9]{12}$/,
  ISBN10: /^[0-9]{9}[0-9X]$/,
  ISBN13: /^97[89][0-9]{10}$/,
};

export const isValidBarcode = (barcode: string): boolean => {
  if (!barcode || typeof barcode !== 'string') {
    return false;
  }

  // Remove any whitespace
  const cleanBarcode = barcode.trim();

  // Check if empty
  if (cleanBarcode.length === 0) {
    return false;
  }

  // Check against known patterns
  return Object.values(BARCODE_PATTERNS).some((pattern) =>
    pattern.test(cleanBarcode)
  );
};

// Check if product has album tag
export const hasAlbumTag = (tags: string): boolean => {
  if (!tags) return false;
  
  const tagList = tags.toLowerCase().split(',').map((tag) => tag.trim());
  return tagList.includes('album') || tagList.includes('albums');
};

// Validate album product
export const validateAlbumProduct = (product: any): AlbumProduct | null => {
  const schema = Joi.object({
    productId: Joi.number().required(),
    variantId: Joi.number().required(),
    title: Joi.string().required(),
    variantTitle: Joi.string().allow(''),
    vendor: Joi.string().required(),
    sku: Joi.string().allow(''),
    barcode: Joi.string().custom((value, helpers) => {
      if (!isValidBarcode(value)) {
        return helpers.error('any.invalid');
      }
      return value.trim();
    }).required(),
    price: Joi.string().required(),
    tags: Joi.array().items(Joi.string()),
  });

  const { error, value } = schema.validate(product);
  
  if (error) {
    return null;
  }

  return value as AlbumProduct;
};

// Validate sales transaction before sending to Hanteo
export const validateSalesTransaction = (transaction: any): SalesTransaction => {
  const schema = Joi.object({
    orderId: Joi.string().required(),
    orderName: Joi.string().required(),
    fulfillmentId: Joi.string().optional(),
    lineItemId: Joi.string().required(),
    productId: Joi.string().required(),
    variantId: Joi.string().required(),
    barcode: Joi.string().custom((value, helpers) => {
      if (!isValidBarcode(value)) {
        return helpers.error('any.invalid');
      }
      return value.trim();
    }).required(),
    albumName: Joi.string().required(),
    quantity: Joi.number().integer().positive().required(),
    customerInfo: Joi.object({
      id: Joi.string().required(),
      email: Joi.string().email().optional(),
      gender: Joi.string().valid('M', 'W').optional(),
      birthYear: Joi.string().pattern(/^[0-9]{4}$/).optional(),
    }).optional(),
    shippingInfo: Joi.object({
      country: Joi.string().required(),
      countryCode: Joi.string().length(2).uppercase().required(),
      city: Joi.string().optional(),
      province: Joi.string().optional(),
    }).optional(),
    transactionTime: Joi.date().required(),
    trackingNumber: Joi.string().optional(),
    status: Joi.string().valid('pending', 'sent', 'failed', 'cancelled').required(),
    errorMessage: Joi.string().optional(),
    hanteoResponse: Joi.object().optional(),
  });

  const { error, value } = schema.validate(transaction);
  
  if (error) {
    throw new ValidationError(error.message, error.details);
  }

  return value as SalesTransaction;
};

// Validate date is within allowed range for Hanteo (same day in KST)
export const isValidTransactionDate = (date: Date): boolean => {
  const kstDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  
  return (
    kstDate.getFullYear() === today.getFullYear() &&
    kstDate.getMonth() === today.getMonth() &&
    kstDate.getDate() === today.getDate()
  );
};

// Generate unique operation value for Hanteo
export const generateOpVal = (orderId: string, lineItemId: string): string => {
  return `${orderId}-${lineItemId}-${Date.now()}`;
};

// Convert gender format for Hanteo
export const convertGender = (gender?: string): string | undefined => {
  if (!gender) return undefined;
  
  const normalized = gender.toUpperCase();
  if (normalized === 'M' || normalized === 'MALE' || normalized === '1') {
    return 'M';
  }
  if (normalized === 'F' || normalized === 'W' || normalized === 'FEMALE' || normalized === '2') {
    return 'W';
  }
  
  return undefined;
};

// Extract birth year from various formats
export const extractBirthYear = (birthDate?: string): string | undefined => {
  if (!birthDate) return undefined;
  
  // Try to parse as date
  const date = new Date(birthDate);
  if (!isNaN(date.getTime())) {
    return date.getFullYear().toString();
  }
  
  // Try to extract 4-digit year
  const yearMatch = birthDate.match(/[0-9]{4}/);
  if (yearMatch) {
    const year = parseInt(yearMatch[0]);
    if (year >= 1900 && year <= new Date().getFullYear()) {
      return year.toString();
    }
  }
  
  return undefined;
};

// Batch validation for multiple sales records
export const validateSalesBatch = (records: any[]): {
  valid: SalesTransaction[];
  invalid: Array<{ record: any; error: string }>;
} => {
  const valid: SalesTransaction[] = [];
  const invalid: Array<{ record: any; error: string }> = [];

  for (const record of records) {
    try {
      const validated = validateSalesTransaction(record);
      valid.push(validated);
    } catch (error) {
      invalid.push({
        record,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      });
    }
  }

  return { valid, invalid };
};