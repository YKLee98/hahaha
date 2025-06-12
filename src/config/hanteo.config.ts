export const hanteoConfig = {
  endpoints: {
    token: '/oauth/token',
    salesData: '/v4/collect/realtimedata/ALBUM',
  },
  headers: {
    'Content-Type': 'application/json;charset=utf8',
  },
  tokenGrantType: 'client_credentials',
  maxBatchSize: 100, // Maximum 100 records per batch as per documentation
  retryAttempts: 3,
  retryDelay: 1000, // 1 second
  timeout: 30000, // 30 seconds
};

// Response codes from Hanteo API
export const HANTEO_RESPONSE_CODES = {
  SUCCESS: 100,
  PARTIAL_SUCCESS: 101,
  NO_DATA: 601,
  MISSING_REQUIRED_DATA: 602,
  INVALID_DATA_FORMAT: 603,
  INVALID_DATA: 604,
  DUPLICATE_DATA: 404,
  ALREADY_VERIFIED: 902,
  NETWORK_ERROR: 702,
  SERVER_ERROR: 703,
  INVALID_TOKEN: 821,
  TOKEN_EXPIRED: 822,
};

// Status codes for sales data validation
export const HANTEO_STATUS_CODES = {
  UC: 'Unregistered Barcode',
  UB: 'Unregistered BranchCode',
  CC: 'Cannot Collect',
  MB: 'Missing BranchCode',
  BS: 'Before Saledate',
  SB: 'Space Barcode',
  NA: 'Notuse Album',
  NT: 'Not Today Data',
};

// ISO 3166-1 alpha-2 country codes mapping
export const COUNTRY_CODE_MAP: Record<string, string> = {
  'United States': 'US',
  'Canada': 'CA',
  'United Kingdom': 'GB',
  'Australia': 'AU',
  'Japan': 'JP',
  'South Korea': 'KR',
  'China': 'CN',
  'Germany': 'DE',
  'France': 'FR',
  'Brazil': 'BR',
  'Mexico': 'MX',
  'Singapore': 'SG',
  'Malaysia': 'MY',
  'Thailand': 'TH',
  'Philippines': 'PH',
  'Indonesia': 'ID',
  'Vietnam': 'VN',
  'India': 'IN',
  'Netherlands': 'NL',
  'Spain': 'ES',
  'Italy': 'IT',
  'Poland': 'PL',
  'Sweden': 'SE',
  'Norway': 'NO',
  'Denmark': 'DK',
  'Finland': 'FI',
  'Belgium': 'BE',
  'Switzerland': 'CH',
  'Austria': 'AT',
  'New Zealand': 'NZ',
  'Argentina': 'AR',
  'Chile': 'CL',
  'Colombia': 'CO',
  'Peru': 'PE',
  'South Africa': 'ZA',
  'United Arab Emirates': 'AE',
  'Saudi Arabia': 'SA',
  'Israel': 'IL',
  'Turkey': 'TR',
  'Russia': 'RU',
  'Ukraine': 'UA',
  'Czech Republic': 'CZ',
  'Hungary': 'HU',
  'Portugal': 'PT',
  'Greece': 'GR',
  'Romania': 'RO',
  'Ireland': 'IE',
  'default': 'XX', // For unmapped countries
};