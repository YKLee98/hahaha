#!/bin/bash

echo "🧹 Cleaning build artifacts..."
rm -rf dist/
rm -rf node_modules/
rm -f package-lock.json

echo "📦 Installing fresh dependencies..."
npm install

echo "🔨 Building TypeScript..."
npm run build

echo "✅ Clean build complete!"