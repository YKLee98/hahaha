#!/usr/bin/env node

import { syncService } from '../services/sync.service';
import { shopifyService } from '../services/shopify.service';
import { logger } from '../utils/logger';

async function syncProducts() {
  logger.info('Starting product synchronization...');

  try {
    // Sync album products
    await syncService.syncAlbumProducts();
    
    const stats = syncService.getStatistics();
    logger.info({
      albumProducts: stats.albumProductsCount,
      lastUpdate: stats.lastCacheUpdate,
    }, 'Product sync completed');

    // Get sample of synced products
    const products = await shopifyService.getAlbumProducts({ 
      hasBarcode: true, 
      tags: ['album'] 
    });
    
    logger.info('Sample of synced album products:');
    products.slice(0, 5).forEach((product) => {
      logger.info({
        productId: product.productId,
        variantId: product.variantId,
        title: product.title,
        variantTitle: product.variantTitle,
        barcode: product.barcode,
        vendor: product.vendor,
      });
    });

    // Show summary by vendor
    const vendorCounts = products.reduce((acc, product) => {
      acc[product.vendor] = (acc[product.vendor] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    logger.info('Products by vendor:');
    Object.entries(vendorCounts)
      .sort(([, a], [, b]) => b - a)
      .forEach(([vendor, count]) => {
        logger.info({ vendor, count });
      });

  } catch (error) {
    logger.error({ error }, 'Product sync failed');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  syncProducts()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error({ error }, 'Script failed');
      process.exit(1);
    });
}