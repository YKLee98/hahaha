#!/bin/bash

echo "🔍 Checking system requirements..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Node.js
echo -n "Node.js: "
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_MAJOR" -ge 18 ]; then
        echo -e "${GREEN}✓ $NODE_VERSION${NC}"
    else
        echo -e "${RED}✗ $NODE_VERSION (requires v18+)${NC}"
    fi
else
    echo -e "${RED}✗ Not installed${NC}"
fi

# Check npm
echo -n "npm: "
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    echo -e "${GREEN}✓ v$NPM_VERSION${NC}"
else
    echo -e "${RED}✗ Not installed${NC}"
fi

# Check Git
echo -n "Git: "
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version | cut -d' ' -f3)
    echo -e "${GREEN}✓ v$GIT_VERSION${NC}"
else
    echo -e "${YELLOW}⚠ Not installed (optional)${NC}"
fi

# Check Docker
echo -n "Docker: "
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | sed 's/,//')
    echo -e "${GREEN}✓ v$DOCKER_VERSION${NC}"
else
    echo -e "${YELLOW}⚠ Not installed (optional)${NC}"
fi

# Check Redis
echo -n "Redis: "
if command -v redis-cli &> /dev/null; then
    REDIS_VERSION=$(redis-cli --version | cut -d' ' -f2)
    echo -e "${GREEN}✓ v$REDIS_VERSION${NC}"
else
    echo -e "${YELLOW}⚠ Not installed (optional)${NC}"
fi

echo ""

# Check ports
echo "📡 Checking ports..."
echo -n "Port 3000: "
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${YELLOW}⚠ In use${NC}"
else
    echo -e "${GREEN}✓ Available${NC}"
fi

echo -n "Port 6379 (Redis): "
if lsof -Pi :6379 -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${GREEN}✓ Redis running${NC}"
else
    echo -e "${YELLOW}⚠ Not running${NC}"
fi

echo ""

# Check environment file
echo "📄 Checking configuration..."
echo -n ".env file: "
if [ -f .env ]; then
    echo -e "${GREEN}✓ Exists${NC}"
    
    # Check required variables
    echo ""
    echo "Required environment variables:"
    
    REQUIRED_VARS=(
        "SHOPIFY_STORE_DOMAIN"
        "SHOPIFY_ADMIN_ACCESS_TOKEN"
        "SHOPIFY_API_VERSION"
        "HANTEO_ENV"
        "HANTEO_FAMILY_CODE"
        "HANTEO_BRANCH_CODE"
    )
    
    for var in "${REQUIRED_VARS[@]}"; do
        echo -n "  $var: "
        if grep -q "^$var=" .env; then
            echo -e "${GREEN}✓${NC}"
        else
            echo -e "${RED}✗ Missing${NC}"
        fi
    done
else
    echo -e "${RED}✗ Not found${NC}"
    echo "  Run: cp .env.example .env"
fi

echo ""

# Check TypeScript build
echo -n "TypeScript build: "
if [ -d "dist" ]; then
    echo -e "${GREEN}✓ Built${NC}"
else
    echo -e "${YELLOW}⚠ Not built (run: npm run build)${NC}"
fi

echo ""
echo "✅ Requirements check complete!"