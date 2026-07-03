# Security Policy

## Reporting a vulnerability

Report security issues via either channel (prefer the first if available):

1. **GitHub Private Vulnerability Reporting:** [github.com/elleskay/ai-tax-assistant-platform/security/advisories/new](https://github.com/elleskay/ai-tax-assistant-platform/security/advisories/new). Encrypted, tracked, and lets us coordinate a fix and CVE if needed.
2. **Email:** lskpes10@gmail.com

Do not open public GitHub issues for security problems.

Expected response time: 72 hours.

## Supported versions

Latest `main` only.

## Scope

This template provides platform-layer security defaults:

- Dependency scanning via Dependabot
- Code scanning via GitHub CodeQL
- Secret scanning via GitHub native
- Security headers via Next.js `headers()` in `next.config.ts`
- Rate limiting on sensitive routes
- Input validation via Zod
- Secrets stored in GitHub Actions secrets and injected into Lambda env vars at deploy (never committed; `.env.local` is gitignored)

Apps built on this template are expected to maintain these defaults and add app-specific controls as needed.

See `docs/SSDLC.md` for the secure development lifecycle this template assumes.
