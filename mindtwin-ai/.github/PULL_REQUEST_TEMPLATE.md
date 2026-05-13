## Summary
<!-- What does this PR do? Why is it needed? -->


## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / code cleanup
- [ ] Performance improvement
- [ ] Infrastructure / DevOps
- [ ] Documentation

## Related Issue
Closes #<!-- issue number -->

---

## Pre-merge Checklist

### Code Quality
- [ ] All CI checks pass (tests, lint, build)
- [ ] No `console.log` / `print` debug statements left in production code
- [ ] No hardcoded secrets, API keys, or credentials
- [ ] Error cases are handled and return appropriate HTTP status codes

### Database
- [ ] If schema changed — a migration file has been added to `backend/database/migrations/`
- [ ] Migration is backward-compatible (no destructive changes without a rollback plan)
- [ ] New indexes added for any new query patterns

### Environment Variables
- [ ] Any new env vars are documented in `.env.example` and `.env.prod.example`
- [ ] New env vars have sensible defaults or are clearly marked as required

### API Changes
- [ ] If a public API endpoint changed — all consuming services/frontend are updated
- [ ] Breaking changes are versioned or communicated to the team

### Security
- [ ] User input is validated before use
- [ ] No new dependencies with known high/critical vulnerabilities (`npm audit`)
- [ ] Auth/authorization checks are in place for new endpoints

### Testing
- [ ] New logic has corresponding unit tests (or a follow-up issue is filed)
- [ ] Tested manually in local dev environment (`make up`)

---

## Screenshots / Recordings
<!-- For UI changes, attach before/after screenshots or a short screen recording -->

## Notes for Reviewer
<!-- Anything the reviewer should pay special attention to? -->
