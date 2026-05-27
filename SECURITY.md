# Security Policy

## Reporting a vulnerability

Report security issues by email to: lskpes10@gmail.com

Do not open public GitHub issues for security problems.

Expected response time: 72 hours.

## Supported versions

Latest `main` only.

## Scope

This template provides platform-layer security defaults:

- Dependency scanning via Dependabot
- Code scanning via GitHub CodeQL
- Secret scanning via GitHub native
- Security headers via Helmet-equivalent middleware
- Rate limiting on sensitive routes
- Input validation via Zod
- Secrets managed via AWS Secrets Manager (not env files in prod)

Apps built on this template are expected to maintain these defaults and add app-specific controls as needed.

See `docs/SSDLC.md` for the secure development lifecycle this template assumes.
