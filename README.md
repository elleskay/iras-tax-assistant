# platform

TypeScript platform template for shipping Next.js apps to AWS serverless. CI/CD, IaC, security, governance, pre-canned IAM, a verified deploy workflow, and a working demo app that proves the patterns end to end.

Designed to be cloned per-app, not vendored as a dependency.

## What's inside

| Area | Where |
|---|---|
| CI (actionlint, typecheck, lint, demo build, CDK synth) | `.github/workflows/ci.yml` |
| Security scanning (CodeQL, secrets, npm audit) | `.github/workflows/security.yml` |
| Deploy pipeline (build OpenNext, CDK deploy, smoke test) | `.github/workflows/deploy.yml` |
| Reusable CDK construct (Lambda + S3 + CloudFront + optional custom domain) | `infra/cdk/_template/lib/constructs/NextjsServerless.ts` |
| Full CDK package scaffold (copy and rename per app) | `infra/cdk/_template/` |
| One-time AWS setup stack (OIDC + IAM role) | `infra/cdk/_setup/` |
| Pre-canned IAM policy for the deploy user/role | `infra/iam/cdk-deploy-policy.json` |
| Reference overlay files (next.config, auth.config, middleware, SignOutButton, Sentry, PostHog, Sonner, Resend, Upstash) | `apps/_template/` |
| **Working demo app** (proves the construct + patterns end to end) | `apps/_demo/` |
| Smoke-test script (9 checks, catches real production failures) | `scripts/verify-deploy.sh` |
| **Spec-driven test system** (zod-validated YAML spec, `specTest` runner, 100% coverage gate, ESLint rule) | `packages/spec-test/` |
| Test scaffolding overlay (Vitest, Playwright, sample spec, CI workflow with Postgres service) | `apps/_template/tests/`, `apps/_template/.github/workflows/test.yml` |
| Stack, security, testing guidance | `docs/`, see `docs/TESTING.md` |
| TS/ESLint/Prettier base configs | root |
| Conventional commits + commitlint | `commitlint.config.mjs` |

## How to use

1. Create your app repo from this template:
   ```bash
   gh repo create my-app --template elleskay/platform --clone --private
   cd my-app
   ```
2. Create your real app at `apps/web/` (use `create-next-app` and overlay the reference files from `apps/_template/`, or copy `apps/_demo/` and rename it). The platform's `apps/_demo/` is sacred so CI's self-test keeps working; don't replace it.
3. Rename `infra/cdk/_template/` to `infra/cdk/<your-app>/`. Edit `bin/app.ts` to match the stack id you want.
4. Run the setup CDK to provision the OIDC role: `cd infra/cdk/_setup && npm install && npx cdk deploy -c repo=<owner>/<your-app>`. Copy the output role ARN.
4. Configure AWS (OIDC + the IAM policy from `infra/iam/`), set the GitHub secrets and variables, push. The deploy workflow handles the rest.

Full step-by-step in `docs/SETUP.md` and `docs/DEPLOY.md`. All 9 gotchas the platform has hit in production are documented in `docs/DEPLOY.md`.

## Self-test

The platform's CI builds `apps/web/` (the demo app) and runs `cdk synth` against the construct on every push. If the construct breaks, CI fails before any cloned app picks it up.

## Opinions

The platform makes a few deliberate choices that constrain the happy path:

- **Serverless only.** Lambda + CloudFront + S3 via OpenNext. ~$0-2/month idle. If you need always-on containers, fork.
- **No shared infra base.** Each app is self-contained. Sharing VPCs across portfolio apps is premature optimisation.
- **No NestJS / no mobile / no AI-specific variant docs.** Speculation. Add a variant only when a real app needs one.
- **Constructs are copied, not imported.** Each app pins its version of `NextjsServerless`. Breaking changes don't propagate without explicit action.
- **The platform dogfoods itself.** `apps/web/` is a real Next.js app deployed by the same workflow apps inherit. If the platform's own demo broke, you'd see it.

The smaller the surface area, the fewer wrong-by-default ways apps can diverge.

## License

MIT.
