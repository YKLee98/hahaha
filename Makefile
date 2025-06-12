.PHONY: help setup install build test lint clean docker-build docker-run deploy-staging deploy-production

# Default target
help:
	@echo "Shopify-Hanteo Integration - Available Commands:"
	@echo ""
	@echo "Development:"
	@echo "  make setup          - Initial project setup"
	@echo "  make install        - Install dependencies"
	@echo "  make dev           - Run in development mode"
	@echo "  make build         - Build TypeScript"
	@echo "  make clean-build   - Clean and rebuild project"
	@echo "  make fix-build     - Fix build errors"
	@echo "  make test          - Run tests"
	@echo "  make test-watch    - Run tests in watch mode"
	@echo "  make lint          - Run linter"
	@echo "  make lint-fix      - Fix linting issues"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-build  - Build Docker image"
	@echo "  make docker-run    - Run with Docker Compose"
	@echo "  make docker-stop   - Stop Docker containers"
	@echo "  make docker-clean  - Remove Docker containers and volumes"
	@echo ""
	@echo "Production:"
	@echo "  make sync-products - Sync album products"
	@echo "  make setup-webhooks - Setup Shopify webhooks"
	@echo "  make deploy-staging - Deploy to staging"
	@echo "  make deploy-production - Deploy to production"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean         - Clean build artifacts"
	@echo "  make check         - Check system requirements"
	@echo "  make logs          - Show application logs"
	@echo "  make shell         - Enter Docker container shell"

# Development targets
setup:
	@chmod +x scripts/setup.sh
	@chmod +x scripts/clean-build.sh
	@chmod +x scripts/fix-build.sh
	@./scripts/setup.sh

install:
	npm ci

dev:
	npm run dev

build:
	npm run build

clean-build:
	@chmod +x scripts/clean-build.sh
	@./scripts/clean-build.sh

fix-build:
	@chmod +x scripts/fix-build.sh
	@./scripts/fix-build.sh

test:
	npm test

test-watch:
	npm run test:watch

test-coverage:
	npm run test:coverage

lint:
	npm run lint

lint-fix:
	npm run lint:fix

# Docker targets
docker-build:
	docker build -t shopify-hanteo-integration:latest .

docker-run:
	docker-compose up -d

docker-stop:
	docker-compose down

docker-clean:
	docker-compose down -v
	docker rmi shopify-hanteo-integration:latest || true

docker-logs:
	docker-compose logs -f app

# Production targets
sync-products:
	npm run sync:products

setup-webhooks:
	npm run webhook:setup

deploy-staging:
	@echo "Deploying to staging..."
	kubectl apply -f kubernetes/deployment.yaml -n staging
	kubectl set image deployment/shopify-hanteo-integration app=ghcr.io/your-org/shopify-hanteo-integration:develop -n staging
	kubectl rollout status deployment/shopify-hanteo-integration -n staging

deploy-production:
	@echo "Deploying to production..."
	@read -p "Are you sure you want to deploy to production? (y/N) " confirm && \
	if [ "$$confirm" = "y" ]; then \
		kubectl apply -f kubernetes/deployment.yaml -n production; \
		kubectl set image deployment/shopify-hanteo-integration app=ghcr.io/your-org/shopify-hanteo-integration:latest -n production; \
		kubectl rollout status deployment/shopify-hanteo-integration -n production; \
	else \
		echo "Deployment cancelled."; \
	fi

# Utility targets
clean:
	rm -rf dist/
	rm -rf node_modules/
	rm -rf coverage/
	rm -rf logs/

check:
	@chmod +x scripts/check-requirements.sh
	@./scripts/check-requirements.sh

logs:
	tail -f logs/*.log

shell:
	docker exec -it shopify-hanteo-integration /bin/sh

# Database targets
redis-cli:
	docker exec -it shopify-hanteo-redis redis-cli

# Monitoring targets
metrics:
	curl -s localhost:3000/metrics | grep -E '^(shopify|hanteo|sales|albums)'

health:
	curl -s localhost:3000/health | jq .

# Git targets
tag-release:
	@read -p "Enter version number (e.g., 1.0.0): " version && \
	git tag -a v$$version -m "Release v$$version" && \
	git push origin v$$version

# Environment targets
env-check:
	@echo "Checking environment variables..."
	@[ -f .env ] || (echo "❌ .env file not found" && exit 1)
	@grep -q "SHOPIFY_ADMIN_ACCESS_TOKEN" .env || echo "⚠️  Warning: SHOPIFY_ADMIN_ACCESS_TOKEN not set"
	@grep -q "HANTEO_.*_CLIENT_KEY" .env || echo "⚠️  Warning: HANTEO_CLIENT_KEY not set"
	@echo "✅ Environment check complete"