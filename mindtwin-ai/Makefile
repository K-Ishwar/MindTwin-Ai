.PHONY: up down logs migrate ps \
        prod-up prod-down prod-logs prod-ps prod-build \
        test test-ai lint install-hooks \
        mobile-install mobile-start mobile-build-preview mobile-build-prod mobile-submit \
        infra-setup-ec2 infra-cloudwatch infra-ecr-create \
        load-test

# ── Development ───────────────────────────────────────────────────────────────
up:
	docker-compose up --build

down:
	docker-compose down

logs:
	docker-compose logs -f

migrate:
	npm run migrate

ps:
	docker-compose ps

# ── Production ────────────────────────────────────────────────────────────────
# Requires .env.prod to exist (copy from .env.prod.example and fill in values)
prod-up:
	docker-compose -f docker-compose.prod.yml up -d

prod-build:
	docker-compose -f docker-compose.prod.yml build --no-cache

prod-down:
	docker-compose -f docker-compose.prod.yml down

prod-logs:
	docker-compose -f docker-compose.prod.yml logs -f

prod-ps:
	docker-compose -f docker-compose.prod.yml ps

# ── Testing (local) ───────────────────────────────────────────────────────────
test:
	@for service in auth-service profile-service scheduler-service quiz-service \
	                stress-service reward-service notification-service analytics-service; do \
	  echo "── Testing $$service ──"; \
	  cd backend/$$service && npm test; cd ../..; \
	done

test-ai:
	cd ai-engine && python test_scheduler_local.py

lint:
	cd frontend/web && npm run lint

# ── Git hooks ─────────────────────────────────────────────────────────────────
install-hooks:
	cp .github/hooks/pre-commit .git/hooks/pre-commit
	chmod +x .git/hooks/pre-commit
	@echo "Pre-commit hook installed."

# ── Mobile (EAS) ──────────────────────────────────────────────────────────────
mobile-install:
	cd frontend/mobile && npm install

mobile-start:
	cd frontend/mobile && npx expo start

mobile-build-preview:
	cd frontend/mobile && eas build --profile preview --platform all

mobile-build-prod:
	cd frontend/mobile && eas build --profile production --platform all

mobile-submit:
	cd frontend/mobile && eas submit --platform all --profile production

# ── Load testing ─────────────────────────────────────────────────────────────
load-test:
	bash scripts/load_test.sh $(URL) $(CONCURRENT)

# ── Final E2E ─────────────────────────────────────────────────────────────────
e2e:
	node scripts/final_e2e_test.js $(URL)

e2e-prod:
	node scripts/final_e2e_test.js https://api.mindtwin.ai

# ── Infrastructure ────────────────────────────────────────────────────────────
infra-setup-ec2:
	bash infrastructure/scripts/setup-ec2.sh

infra-cloudwatch:
	@read -p "EC2 Instance ID: " id; \
	read -p "Alert email: " email; \
	bash infrastructure/scripts/setup-cloudwatch.sh $$id $$email

infra-ecr-create:
	@for repo in auth-service profile-service scheduler-service quiz-service \
	             stress-service reward-service notification-service analytics-service \
	             ai-engine web; do \
	  echo "Creating ECR repo: mindtwin-$$repo"; \
	  aws ecr create-repository --repository-name mindtwin-$$repo --region ap-south-1 || true; \
	done
