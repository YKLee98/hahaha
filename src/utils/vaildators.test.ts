import {
  isValidBarcode,
  hasAlbumTag,
  validateAlbumProduct,
  validateSalesTransaction,
  isValidTransactionDate,
  generateOpVal,
  convertGender,
  extractBirthYear,
  validateSalesBatch,
} from '../../src/utils/validators';
import { ValidationError } from '../../src/utils/error-handler';

describe('Validators', () => {
  describe('isValidBarcode', () => {
    it('should validate correct barcode formats', () => {
      // Valid barcodes
      expect(isValidBarcode('8809633189505')).toBe(true); // EAN13
      expect(isValidBarcode('12345678')).toBe(true); // EAN8
      expect(isValidBarcode('123456789012')).toBe(true); // UPC
      expect(isValidBarcode('123456789X')).toBe(true); // ISBN10
      expect(isValidBarcode('9781234567890')).toBe(true); // ISBN13
    });

    it('should reject invalid barcodes', () => {
      expect(isValidBarcode('')).toBe(false);
      expect(isValidBarcode(' ')).toBe(false);
      expect(isValidBarcode('123')).toBe(false); // Too short
      expect(isValidBarcode('12345678901234')).toBe(false); // Too long
      expect(isValidBarcode('ABC123456789')).toBe(false); // Contains letters
      expect(isValidBarcode(null as any)).toBe(false);
      expect(isValidBarcode(undefined as any)).toBe(false);
    });

    it('should handle whitespace correctly', () => {
      expect(isValidBarcode(' 8809633189505 ')).toBe(true); // Should trim
      expect(isValidBarcode('8809633 189505')).toBe(false); // Space in middle
    });
  });

  describe('hasAlbumTag', () => {
    it('should detect album tags', () => {
      expect(hasAlbumTag('album,k-pop,new')).toBe(true);
      expect(hasAlbumTag('Album,K-POP')).toBe(true);
      expect(hasAlbumTag('music,ALBUM,2025')).toBe(true);
      expect(hasAlbumTag('new,albums,release')).toBe(true);
    });

    it('should return false for non-album tags', () => {
      expect(hasAlbumTag('merchandise,t-shirt')).toBe(false);
      expect(hasAlbumTag('book,photocard')).toBe(false);
      expect(hasAlbumTag('')).toBe(false);
      expect(hasAlbumTag(null as any)).toBe(false);
    });

    it('should handle tag formatting correctly', () => {
      expect(hasAlbumTag(' album , k-pop ')).toBe(true); // With spaces
      expect(hasAlbumTag('pre-order,album,limited')).toBe(true);
    });
  });

  describe('validateAlbumProduct', () => {
    const validProduct = {
      productId: 123456,
      variantId: 789012,
      title: 'Test Album',
      variantTitle: 'CD Version',
      vendor: 'Test Artist',
      sku: 'ALB-001',
      barcode: '8809633189505',
      price: '25.00',
      tags: ['album', 'k-pop'],
    };

    it('should validate correct album product', () => {
      const result = validateAlbumProduct(validProduct);
      expect(result).toEqual(validProduct);
    });

    it('should reject product with invalid barcode', () => {
      const invalidProduct = { ...validProduct, barcode: '123' };
      const result = validateAlbumProduct(invalidProduct);
      expect(result).toBeNull();
    });

    it('should reject product with missing required fields', () => {
      const missingFields = { ...validProduct };
      delete (missingFields as any).title;
      const result = validateAlbumProduct(missingFields);
      expect(result).toBeNull();
    });

    it('should allow empty variant title and sku', () => {
      const product = { ...validProduct, variantTitle: '', sku: '' };
      const result = validateAlbumProduct(product);
      expect(result).toEqual(product);
    });

    it('should trim barcode whitespace', () => {
      const product = { ...validProduct, barcode: ' 8809633189505 ' };
      const result = validateAlbumProduct(product);
      expect(result?.barcode).toBe('8809633189505');
    });
  });

  describe('validateSalesTransaction', () => {
    const validTransaction = {
      orderId: '12345',
      orderName: '#1001',
      fulfillmentId: '67890',
      lineItemId: '11111',
      productId: '22222',
      variantId: '33333',
      barcode: '8809633189505',
      albumName: 'Test Album',
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
      transactionTime: new Date(),
      trackingNumber: 'KR1234567890',
      status: 'pending' as const,
    };

    it('should validate correct sales transaction', () => {
      const result = validateSalesTransaction(validTransaction);
      expect(result).toEqual(validTransaction);
    });

    it('should throw ValidationError for invalid data', () => {
      const invalidTransaction = { ...validTransaction, quantity: -1 };
      expect(() => validateSalesTransaction(invalidTransaction))
        .toThrow(ValidationError);
    });

    it('should validate gender values', () => {
      const transactionM = {
        ...validTransaction,
        customerInfo: { ...validTransaction.customerInfo, gender: 'M' },
      };
      const transactionW = {
        ...validTransaction,
        customerInfo: { ...validTransaction.customerInfo, gender: 'W' },
      };
      
      expect(validateSalesTransaction(transactionM).customerInfo?.gender).toBe('M');
      expect(validateSalesTransaction(transactionW).customerInfo?.gender).toBe('W');

      const invalidGender = {
        ...validTransaction,
        customerInfo: { ...validTransaction.customerInfo, gender: 'X' },
      };
      expect(() => validateSalesTransaction(invalidGender)).toThrow(ValidationError);
    });

    it('should validate birth year format', () => {
      const invalidYear = {
        ...validTransaction,
        customerInfo: { ...validTransaction.customerInfo, birthYear: '90' },
      };
      expect(() => validateSalesTransaction(invalidYear)).toThrow(ValidationError);
    });

    it('should validate country code format', () => {
      const invalidCountryCode = {
        ...validTransaction,
        shippingInfo: { ...validTransaction.shippingInfo!, countryCode: 'KOR' },
      };
      expect(() => validateSalesTransaction(invalidCountryCode)).toThrow(ValidationError);
    });

    it('should allow optional fields to be omitted', () => {
      const minimalTransaction = {
        orderId: '12345',
        orderName: '#1001',
        lineItemId: '11111',
        productId: '22222',
        variantId: '33333',
        barcode: '8809633189505',
        albumName: 'Test Album',
        quantity: 1,
        transactionTime: new Date(),
        status: 'pending' as const,
      };
      
      const result = validateSalesTransaction(minimalTransaction);
      expect(result).toEqual(minimalTransaction);
    });
  });

  describe('isValidTransactionDate', () => {
    it('should validate same day transactions in KST', () => {
      const now = new Date();
      expect(isValidTransactionDate(now)).toBe(true);
    });

    it('should reject past date transactions', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(isValidTransactionDate(yesterday)).toBe(false);
    });

    it('should reject future date transactions', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(isValidTransactionDate(tomorrow)).toBe(false);
    });
  });

  describe('generateOpVal', () => {
    it('should generate unique operation values', () => {
      const opVal1 = generateOpVal('order123', 'item456');
      const opVal2 = generateOpVal('order123', 'item456');
      
      expect(opVal1).toMatch(/^order123-item456-\d+$/);
      expect(opVal2).toMatch(/^order123-item456-\d+$/);
      expect(opVal1).not.toBe(opVal2); // Should be unique due to timestamp
    });
  });

  describe('convertGender', () => {
    it('should convert various male formats to M', () => {
      expect(convertGender('M')).toBe('M');
      expect(convertGender('m')).toBe('M');
      expect(convertGender('MALE')).toBe('M');
      expect(convertGender('male')).toBe('M');
      expect(convertGender('1')).toBe('M');
    });

    it('should convert various female formats to W', () => {
      expect(convertGender('W')).toBe('W');
      expect(convertGender('w')).toBe('W');
      expect(convertGender('F')).toBe('W');
      expect(convertGender('f')).toBe('W');
      expect(convertGender('FEMALE')).toBe('W');
      expect(convertGender('female')).toBe('W');
      expect(convertGender('2')).toBe('W');
    });

    it('should return undefined for invalid or missing values', () => {
      expect(convertGender()).toBeUndefined();
      expect(convertGender('')).toBeUndefined();
      expect(convertGender('X')).toBeUndefined();
      expect(convertGender('other')).toBeUndefined();
    });
  });

  describe('extractBirthYear', () => {
    it('should extract year from various date formats', () => {
      expect(extractBirthYear('1990-01-01')).toBe('1990');
      expect(extractBirthYear('01/01/1990')).toBe('1990');
      expect(extractBirthYear('1990/01/01')).toBe('1990');
      expect(extractBirthYear('January 1, 1990')).toBe('1990');
      expect(extractBirthYear('1990')).toBe('1990');
    });

    it('should validate year range', () => {
      expect(extractBirthYear('1899')).toBeUndefined(); // Too old
      expect(extractBirthYear('2030')).toBeUndefined(); // Future year
      expect(extractBirthYear('2020')).toBe('2020'); // Valid recent year
    });

    it('should handle invalid inputs', () => {
      expect(extractBirthYear()).toBeUndefined();
      expect(extractBirthYear('')).toBeUndefined();
      expect(extractBirthYear('invalid')).toBeUndefined();
      expect(extractBirthYear('90')).toBeUndefined(); // Too short
    });
  });

  describe('validateSalesBatch', () => {
    it('should separate valid and invalid records', () => {
      const records = [
        {
          orderId: '1',
          orderName: '#1001',
          lineItemId: '1',
          productId: '1',
          variantId: '1',
          barcode: '8809633189505',
          albumName: 'Album 1',
          quantity: 1,
          transactionTime: new Date(),
          status: 'pending',
        },
        {
          orderId: '2',
          orderName: '#1002',
          lineItemId: '2',
          productId: '2',
          variantId: '2',
          barcode: 'invalid',
          albumName: 'Album 2',
          quantity: 1,
          transactionTime: new Date(),
          status: 'pending',
        },
        {
          orderId: '3',
          orderName: '#1003',
          lineItemId: '3',
          productId: '3',
          variantId: '3',
          barcode: '8809633189506',
          albumName: 'Album 3',
          quantity: -1, // Invalid quantity
          transactionTime: new Date(),
          status: 'pending',
        },
      ];

      const result = validateSalesBatch(records);

      expect(result.valid).toHaveLength(1);
      expect(result.invalid).toHaveLength(2);
      expect(result.valid[0].orderId).toBe('1');
      expect(result.invalid[0].record.orderId).toBe('2');
      expect(result.invalid[1].record.orderId).toBe('3');
    });

    it('should handle empty batch', () => {
      const result = validateSalesBatch([]);
      expect(result.valid).toHaveLength(0);
      expect(result.invalid).toHaveLength(0);
    });
  });
});