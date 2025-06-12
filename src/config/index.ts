import dotenv from 'dotenv';
import Joi from 'joi';

dotenv.config();

const envSchema = Joi.object({
  // Shopify
  SHOPIFY_STORE_DOMAIN: Joi.string().required(),
  SHOPIFY_ADMIN_ACCESS_TOKEN: Joi.string().required(),
  SHOPIFY_API_VERSION: Joi.string().required(),
  SHOPIFY_WEBHOOK_SECRET: Joi.string().optional(),

  // Hanteo
  HANTEO_ENV: Joi.string().valid('test', 'production').default('test'),
  HANTEO_TEST_URL: Joi.string().uri().required(),
  HANTEO_PROD_URL: Joi.string().uri().required(),
  HANTEO_TEST_CLIENT_KEY: Joi.string().required(),
  HANTEO_PROD_CLIENT_KEY: Joi.string().required(),
  HANTEO_FAMILY_CODE: Joi.string().required(),
  HANTEO_BRANCH_CODE: Joi.string().required(),

  // Application
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  LOG_LEVEL: Joi.string().valid('trace', 'debug', 'info', 'warn', 'error', 'fatal').default('info'),
  TZ: Joi.string().default('Asia/Seoul'),

  // Optional
  REDIS_URL: Joi.string().uri().optional(),
  SENTRY_DSN: Joi.string().optional(),
  NEW_RELIC_LICENSE_KEY: Joi.string().optional(),
}).unknown();

const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export const config = {
  shopify: {
    storeDomain: envVars.SHOPIFY_STORE_DOMAIN,
    adminAccessToken: envVars.SHOPIFY_ADMIN_ACCESS_TOKEN,
    apiVersion: envVars.SHOPIFY_API_VERSION,
    webhookSecret: envVars.SHOPIFY_WEBHOOK_SECRET,
  },
  hanteo: {
    env: envVars.HANTEO_ENV,
    baseUrl: envVars.HANTEO_ENV === 'production' ? envVars.HANTEO_PROD_URL : envVars.HANTEO_TEST_URL,
    clientKey: envVars.HANTEO_ENV === 'production' ? envVars.HANTEO_PROD_CLIENT_KEY : envVars.HANTEO_TEST_CLIENT_KEY,
    familyCode: envVars.HANTEO_FAMILY_CODE,
    branchCode: envVars.HANTEO_BRANCH_CODE,
  },
  app: {
    env: envVars.NODE_ENV,
    port: envVars.PORT,
    logLevel: envVars.LOG_LEVEL,
    timezone: envVars.TZ,
  },
  redis: {
    url: envVars.REDIS_URL,
  },
  monitoring: {
    sentryDsn: envVars.SENTRY_DSN,
    newRelicKey: envVars.NEW_RELIC_LICENSE_KEY,
  },
};

export default config;