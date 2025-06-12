#!/bin/bash

echo "🔧 Shopify API Auto-Fix Script"
echo "==============================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found!${NC}"
    echo "Creating from example..."
    cp .env.example .env
fi

# Backup current .env
cp .env .env.backup
echo "✅ Backed up .env to .env.backup"

# Extract current values
CURRENT_DOMAIN=$(grep "^SHOPIFY_STORE_DOMAIN=" .env | cut -d '=' -f2)
CURRENT_TOKEN=$(grep "^SHOPIFY_ADMIN_ACCESS_TOKEN=" .env | cut -d '=' -f2)
CURRENT_VERSION=$(grep "^SHOPIFY_API_VERSION=" .env | cut -d '=' -f2)

echo ""
echo "📋 Current Configuration:"
echo "   Domain: $CURRENT_DOMAIN"
echo "   Token: ${CURRENT_TOKEN:0:10}..."
echo "   API Version: $CURRENT_VERSION"
echo ""

# API versions to try
API_VERSIONS=("2024-10" "2024-07" "2024-04" "2024-01" "2023-10")

echo "🔍 Testing API versions..."
echo ""

WORKING_VERSION=""

for VERSION in "${API_VERSIONS[@]}"; do
    echo -n "Testing $VERSION... "
    
    # Update .env with new version
    sed -i.tmp "s/SHOPIFY_API_VERSION=.*/SHOPIFY_API_VERSION=$VERSION/" .env
    
    # Test the connection
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
        "https://$CURRENT_DOMAIN/admin/api/$VERSION/shop.json" \
        -H "X-Shopify-Access-Token: $CURRENT_TOKEN" \
        -H "Accept: application/json")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✅ Success!${NC}"
        WORKING_VERSION=$VERSION
        break
    elif [ "$HTTP_CODE" = "401" ]; then
        echo -e "${RED}❌ Authentication failed (check token)${NC}"
    elif [ "$HTTP_CODE" = "404" ]; then
        echo -e "${YELLOW}⚠️  Not found (version not supported)${NC}"
    else
        echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
    fi
done

echo ""

if [ -n "$WORKING_VERSION" ]; then
    echo -e "${GREEN}✅ Found working API version: $WORKING_VERSION${NC}"
    echo ""
    echo "📝 Updated .env file with working version"
    echo ""
    echo "🚀 Next steps:"
    echo "   1. Restart the server: npm run dev"
    echo "   2. Check health: curl http://localhost:3000/health"
    echo ""
    
    # Test GraphQL as well
    echo "🔍 Testing GraphQL endpoint..."
    GRAPHQL_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        "https://$CURRENT_DOMAIN/admin/api/$WORKING_VERSION/graphql.json" \
        -H "X-Shopify-Access-Token: $CURRENT_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"query": "{ shop { name } }"}')
    
    GRAPHQL_CODE=$(echo "$GRAPHQL_RESPONSE" | tail -n1)
    
    if [ "$GRAPHQL_CODE" = "200" ]; then
        echo -e "${GREEN}✅ GraphQL endpoint working!${NC}"
    else
        echo -e "${YELLOW}⚠️  GraphQL endpoint not working (HTTP $GRAPHQL_CODE)${NC}"
        echo "   This might be a permissions issue"
    fi
else
    echo -e "${RED}❌ No working API version found!${NC}"
    echo ""
    echo "Possible issues:"
    echo "1. Invalid store domain: $CURRENT_DOMAIN"
    echo "2. Invalid access token"
    echo "3. Network connectivity issues"
    echo "4. Store might be on a legacy plan"
    echo ""
    echo "💡 Try:"
    echo "1. Verify your store domain (should be: yourstore.myshopify.com)"
    echo "2. Regenerate your access token in Shopify Admin"
    echo "3. Check if your store has API access enabled"
    
    # Restore original .env
    mv .env.backup .env
    echo ""
    echo "⚠️  Restored original .env file"
fi

# Cleanup
rm -f .env.tmp

echo ""
echo "✅ Auto-fix script complete!"