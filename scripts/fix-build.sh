#!/bin/bash

echo "🔧 Fixing TypeScript build errors..."

# Clean previous build
echo "🧹 Cleaning previous build..."
rm -rf dist/
rm -rf node_modules/@types/shopify*

# Clear TypeScript cache
echo "🗑️ Clearing TypeScript cache..."
rm -f tsconfig.tsbuildinfo

# Reinstall specific Shopify types if needed
echo "📦 Ensuring correct dependencies..."
npm install --save-dev @types/node@latest

# Build again
echo "🔨 Building TypeScript..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
else
    echo "❌ Build still failing. Trying alternative fix..."
    
    # Alternative: Install exact version
    echo "📦 Installing exact Shopify API version..."
    npm uninstall @shopify/shopify-api
    npm install @shopify/shopify-api@11.2.0
    
    echo "🔨 Rebuilding..."
    npm run build
fi

echo "🏁 Fix complete!"