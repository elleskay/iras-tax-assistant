# platform

TypeScript platform template for shipping Next.js apps to AWS serverless. CI/CD, IaC, security, governance, pre-canned IAM, a verified deploy workflow, and a working demo app that proves the patterns end to end.

Designed to be cloned per-app, not vendored as a dependency.

## What's inside

| Area | Where |
|---|---|
| CI (typecheck, lint, demo build, CDK synth) | `.github/workflows/ci.yml` |
| Security scanning (CodeQL, secrets, npm audit) | `.github/workflows/security.yml` |
| Deploy pipeline (build OpenNext, CDK deploy, smoke test) | `.github/workflows/deploy.yml` |
| Reusable CDK construct (Lambda + S3 + CloudFront + optional custom domain) | `infra/cdk/_template/lib/constructs/NextjsServerless.ts` |
| Full CDK package scaffold (copy and rename per app) | `infra/cdk/_template/` |
| Pre-canned IAM policy for the deploy user/role | `infra/iam/cdk-deploy-policy.json` |
| Reference overlay files (next.config, auth.config, middleware, SignOutButton) | `apps/_template/` |
| **Working demo app** (proves the construct + patterns end to end) | `apps/web/` |
| Smoke-test script (9 checks, catches real production failures) | `scripts/verify-deploy.sh` |
| Stack and security guidance | `docs/` |
| TS/ESLint/Prettier base configs | root |
| Conventional commits + commitlint | `commitlint.config.mjs` |

## How to use

1. Create your app repo from this template:
   ```bash
   gh repo create my-app --template elleskay/platform --clone --private
   cd my-app
   ```
2. Replace `apps/web/` with your own Next.js app (or keep the demo and grow it). Overlay the reference files from `apps/_template/` if you scaffolded with `create-next-app` and need to add the patterns.
3. Rename `infra/cdk/_template/` to `infra/cdk/<your-app>/`. Edit `bin/app.ts` to match the stack id you want.
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
