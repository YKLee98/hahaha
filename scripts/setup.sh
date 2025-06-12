#!/bin/bash

# Shopify-Hanteo Integration Setup Script
# This script helps set up the development environment

set -e

echo "🚀 Setting up Shopify-Hanteo Integration..."

# Check Node.js version
NODE_VERSION=$(node -v)
NODE_MAJOR_VERSION=$(node -v | cut -d'.' -f1 | sed 's/v//')

if [ "$NODE_MAJOR_VERSION" -lt 18 ]; then
    echo "❌ Error: Node.js version 18 or higher is required. Current version: $NODE_VERSION"
    exit 1
fi

echo "✅ Node.js version: $NODE_VERSION"

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📋 Creating .env file from .env.example..."
    cp .env.example .env
    echo "⚠️  Please update .env file with your actual credentials"
else
    echo "✅ .env file already exists"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Run initial build
echo "🔨 Building TypeScript..."
npm run build

# Check Docker installation (optional)
if command -v docker &> /dev/null; then
    echo "✅ Docker is installed"
    
    # Ask if user wants to start Redis
    read -p "Do you want to start Redis using Docker? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🚀 Starting Redis..."
        docker run -d --name shopify-hanteo-redis -p 6379:6379 redis:7-alpine
        echo "✅ Redis started on port 6379"
    fi
else
    echo "⚠️  Docker not found. Redis is optional but recommended for production"
fi

# Create logs directory
mkdir -p logs
echo "✅ Logs directory created"

# Run tests
echo "🧪 Running tests..."
npm test

# Setup webhooks (if in development)
if [ "$NODE_ENV" != "production" ]; then
    echo "📡 Setting up Shopify webhooks..."
    read -p "Do you want to set up Shopify webhooks now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm run webhook:setup
    fi
fi

# Sync products
echo "📚 Syncing album products..."
read -p "Do you want to sync album products now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm run sync:products
fi

echo ""
echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env file with your actual credentials"
echo "2. Configure WEBHOOK_URL in .env for production"
echo "3. Run 'npm run dev' to start in development mode"
echo "4. Run 'npm start' to start in production mode"
echo ""
echo "For more information, see README.md"