# MindTwin AI — Pre-Launch Checklist

> Work through this checklist top-to-bottom before going live.
> Every item must be checked before the app is submitted to the stores.

---

## 🔐 Security

- [ ] All environment variables moved to `.env.prod` (not committed to git — verify with `git log --all -- .env.prod`)
- [ ] JWT secrets are 256-bit random values (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- [ ] HTTPS enforced on all endpoints (host NGINX redirects HTTP → HTTPS)
- [ ] Rate limiting active on all routes (verify with `scripts/load_test.sh`)
- [ ] Account lockout working — 5 failed logins → 429 for 15 minutes
- [ ] SQL injection audit complete — all queries use `$1, $2` parameterized syntax
- [ ] Input sanitization active on all services (`sanitizeBody` middleware applied)
- [ ] CORS restricted to production domains only (`NODE_ENV=production` in `.env.prod`)
- [ ] Pre-commit hook installed (`make install-hooks`)
- [ ] `google-play-service-account.json` is in `.gitignore` and not committed
- [ ] No `.pem` or `.key` files committed to git

---

## 🖥️ Backend

- [ ] All 8 microservices healthy — run `bash scripts/verify.sh` and confirm all pass
- [ ] Database migrations run on production (`docker-compose -f docker-compose.prod.yml run --rm auth-service node database/run_migrations.js`)
- [ ] Indexes created (migration 019 — check with `\d students` in psql)
- [ ] Redis connection stable — `redis-cli -h <elasticache-endpoint> ping` returns PONG
- [ ] Firebase FCM credentials configured — `FIREBASE_SERVICE_ACCOUNT` in `.env.prod`
- [ ] Email SMTP configured and tested — send a test OTP email manually
- [ ] Cron jobs scheduled and running — check `GET /api/ai/cron/status`
- [ ] Prometheus scraping all services — open Grafana → Explore → check all targets are UP
- [ ] Grafana dashboards loading — verify all panels show data, no "No data" panels

---

## 🤖 AI Engine

- [ ] Stress LSTM model trained and saved — check `ai-engine/models/saved/` has `.pt` files
- [ ] Digital Twin engine initialized — `GET /api/ai/twin/status` returns 200
- [ ] Knowledge graphs loaded for all subjects — `GET /api/ai/knowledge-graph/subjects` returns full list
- [ ] IRT question bank seeded with questions — at least 50 questions per subject
- [ ] All AI endpoints responding < 500ms — check Grafana `http_request_duration_ms` histogram

---

## 📱 Frontend

- [ ] Web app deployed to CloudFront — `https://app.mindtwin.ai` loads correctly
- [ ] Mobile app submitted to App Store (TestFlight internal review)
- [ ] Mobile app submitted to Google Play (Internal testing track)
- [ ] Push notifications tested on real device (iOS + Android) — receive a test notification
- [ ] Offline mode tested (airplane mode) — app shows graceful error, doesn't crash
- [ ] All screens tested on small device (iPhone SE 3rd gen / Samsung Galaxy A series)
- [ ] Dark mode renders correctly on all screens
- [ ] Accessibility: all interactive elements have `accessibilityLabel` set
- [ ] Deep links work: `mindtwin://` scheme opens the app correctly

---

## 📋 App Store Submission

- [ ] `app.json` has correct `bundleIdentifier` (`ai.mindtwin.app`) and `versionCode`
- [ ] `eas.json` has correct Apple ID, ASC App ID, and Team ID filled in
- [ ] App Store screenshots prepared — 6.7" iPhone (required) + 6.5" iPhone (required)
- [ ] Google Play screenshots prepared — phone + optional tablet
- [ ] App icon (1024×1024 px) uploaded to App Store Connect
- [ ] Privacy policy published at `https://mindtwin.ai/privacy`
- [ ] Terms of service published at `https://mindtwin.ai/terms`
- [ ] Support email configured (`support@mindtwin.ai` receives messages)
- [ ] Age rating questionnaire completed (4+ / Everyone)
- [ ] Test account credentials added to App Store review notes

---

## 💼 Business

- [ ] Domain `mindtwin.ai` pointing to correct DNS records (Route 53)
- [ ] SSL certificate valid and auto-renewing (ACM + Let's Encrypt)
- [ ] Support email `support@mindtwin.ai` configured and monitored
- [ ] Privacy policy covers: data collected, how it's used, retention, deletion rights
- [ ] Terms of service covers: age restrictions (13+), acceptable use, liability

---

## 📊 Monitoring

- [ ] CloudWatch alarms set — CPU > 80%, memory > 85%, disk > 80%, billing > $80
- [ ] Uptime monitoring configured — UptimeRobot (free) or Better Uptime pinging `https://api.mindtwin.ai/health` every 5 minutes
- [ ] Error rate alert: if 5xx errors > 1% in 5 minutes → SNS email to team
- [ ] Grafana alert: if any service goes down → notification

---

## 🧪 Testing

- [ ] Full E2E test run — `node scripts/test_onboarding.js` and `node scripts/test_phase3.js` pass
- [ ] Load test: 100 concurrent users — `bash scripts/load_test.sh https://api.mindtwin.ai 100`
- [ ] Stress test: rapid quiz submissions don't break IRT service
- [ ] Onboarding flow tested by 5 real students (beta testers) — collect feedback
- [ ] Guardian linking flow tested end-to-end (student + guardian on separate devices)
- [ ] All CI checks green on `main` branch before deploy

---

## 🚀 Go-Live Steps (in order)

1. `make prod-build` — build all Docker images
2. Push images to ECR via CI/CD (`git push origin main`)
3. Approve deploy in GitHub Actions (production environment gate)
4. Verify `https://api.mindtwin.ai/health` returns 200
5. Run smoke tests: `bash scripts/load_test.sh https://api.mindtwin.ai 10`
6. Submit mobile app to TestFlight: `cd frontend/mobile && npm run submit:ios`
7. Submit mobile app to Google Play: `cd frontend/mobile && npm run submit:android`
8. Announce to beta testers
9. Monitor Grafana for 24 hours before public launch
