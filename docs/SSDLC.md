# Secure Software Development Lifecycle

What this template gives you out of the box, and what each app is expected to maintain.

## What the template provides

| Control | Where |
|---|---|
| Dependency scanning | `.github/dependabot.yml` |
| Code scanning (SAST) | `.github/workflows/security.yml` (CodeQL) |
| Secret scanning | GitHub native + gitleaks workflow |
| `npm audit` on CI | `.github/workflows/security.yml` |
| Branch protection | manual GitHub setting (see SETUP.md) |
| Conventional commits | `commitlint.config.mjs` |
| PR template with security checkbox | `.github/pull_request_template.md` |
| Disclosure policy | `SECURITY.md` |

## What each app must add

| Control | How |
|---|---|
| Security headers | `next.config.ts` `headers()` (see `apps/_template/next.config.ts`) |
| Input validation | Zod schemas at every server-action boundary |
| Auth | Auth.js v5 (or Clerk), never roll your own |
| Authorization | Per-route guards in `middleware.ts`, principle of least privilege |
| Rate limiting | Upstash Redis on auth and sensitive routes |
| CSRF protection | Next.js Server Actions `allowedOrigins` (see `docs/DEPLOY.md` gotcha #1) |
| HTTPS only | Enforced via CloudFront |
| Secrets in prod | AWS Secrets Manager, never env files |
| Error tracking | Sentry (catches unhandled exceptions that may leak info) |
| Logging | Structured JSON logs, no PII, no secrets |
| Database access | Parameterized queries only (ORM enforces this) |

## Threat model basics

For every new feature, ask:

1. What inputs does it accept? Are they validated?
2. Who is allowed to call it? How is that enforced?
3. What does it read or write? Could it leak data?
4. What happens on failure? Does the error response leak info?
5. Is anything cached? Could caching cross user boundaries?

## Incident response

If a vulnerability is found:

1. Acknowledge to reporter within 72 hours
2. Patch in a private branch
3. Rotate any leaked secrets via AWS Secrets Manager
4. Deploy fix
5. Disclose publicly after patch is live

## References

- OWASP Top 10
- OWASP ASVS for verification levels
- AWS Well-Architected, Security Pillar
