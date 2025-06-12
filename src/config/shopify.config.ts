import '@shopify/shopify-api/adapters/node';
import { shopifyApi } from '@shopify/shopify-api';
import { config } from './index';

export const shopify = shopifyApi({
  apiKey: 'dummy', // Not needed for private apps
  apiSecretKey: 'dummy', // Not needed for private apps
  scopes: [],
  hostName: 'localhost',
  apiVersion: config.shopify.apiVersion,
  isEmbeddedApp: false,
  isCustomStoreApp: false, // Added for private apps
  adminApiAccessToken: config.shopify.adminAccessToken, // Direct token for private apps
  privateAppStorefrontAccessToken: '', // Not needed for admin API
  customShopDomains: [config.shopify.storeDomain],
});

export const createShopifyClient = () => {
  return new shopify.clients.Rest({
    session: {
      shop: config.shopify.storeDomain,
      accessToken: config.shopify.adminAccessToken,
    } as any,
  });
};

export const createGraphQLClient = () => {
  return new shopify.clients.Graphql({
    session: {
      shop: config.shopify.storeDomain,
      accessToken: config.shopify.adminAccessToken,
    } as any,
  });
};

// Webhook topics we're interested in
export const WEBHOOK_TOPICS = {
  ORDERS_FULFILLED: 'ORDERS_FULFILLED',
  ORDERS_UPDATED: 'ORDERS_UPDATED',
  FULFILLMENTS_CREATE: 'FULFILLMENTS_CREATE',
  FULFILLMENTS_UPDATE: 'FULFILLMENTS_UPDATE',
};

// Product query parameters
export const PRODUCT_PARAMS = {
  limit: 250,
  fields: 'id,title,vendor,product_type,tags,variants',
  status: 'active',
};

// Order query parameters
export const ORDER_PARAMS = {
  limit: 250,
  status: 'any',
  fulfillment_status: 'shipped',
  fields: 'id,name,email,created_at,updated_at,fulfillment_status,line_items,shipping_address,customer',
};