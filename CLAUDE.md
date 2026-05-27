# Platform template, Claude Code conventions

This repo is a platform-layer template for Next.js apps on AWS serverless. When working in repos cloned from it, follow these rules.

## Structure

```
apps/
├── _template/                       # Overlay files for an app scaffolded with create-next-app
│   ├── next.config.ts               # Security headers + Server Actions allowedOrigins
│   ├── auth.config.ts               # Edge-safe NextAuth config
│   ├── middleware.ts                # Route protection
│   └── components/SignOutButton.tsx # Client signout
└── web/                             # Working demo app. Replace with your app on clone.
                                     # CI builds this and uses it to test the construct.

infra/
├── cdk/_template/                   # Full CDK package. Copy and rename per app.
│   ├── bin/app.ts
│   ├── lib/web-stack.ts
│   ├── lib/constructs/NextjsServerless.ts   # The reusable construct
│   ├── package.json, tsconfig.json, cdk.json
│   └── README.md
└── iam/cdk-deploy-policy.json       # Least-privilege IAM policy

scripts/verify-deploy.sh             # Post-deploy smoke test (9 checks)

.github/workflows/
├── ci.yml                           # typecheck, lint, demo build + open-next + cdk synth
├── security.yml                     # CodeQL, gitleaks, npm audit
└── deploy.yml                       # OIDC, build, deploy, smoke test
```

## What belongs in this template

Only the cross-cutting platform layer:

- CI/CD workflows
- Reusable CDK construct + CDK package scaffold (`infra/cdk/_template/`)
- IAM policy JSON
- Reference overlay files (`apps/_template/`)
- Working demo app (`apps/web/`) for self-test
- Smoke-test script
- Base TS/ESLint/Prettier/Commitlint configs
- Security policy, SSDLC docs, deploy runbook
- Dependabot, CODEOWNERS, PR template

## What does NOT belong

- Real app business logic (use a separate repo cloned from this template)
- Per-product config, secrets, or env files
- Speculative variants for stacks no real app uses

The demo app at `apps/web/` exists to test the construct, not to ship features. Keep it minimal.

## Stack conventions

- Next.js (App Router) + TypeScript strict
- Node 20+
- Postgres (Neon for serverless connection pooling)
- AWS Lambda + S3 + CloudFront via OpenNext
- AWS CDK for IaC
- GitHub Actions for CI/CD
- Auth.js v5 with JWT sessions
- Zod for input validation at server-action boundaries
- Conventional Commits

## Style

- No em dashes anywhere (chat, code, docs, UI strings). Use comma, period, parens, or colon.
- No emojis in code or docs unless explicitly requested.
- Keep README and docs short. Lead with the answer.

## Security defaults

- Never commit secrets. `.env.local` is gitignored, production secrets live in GitHub Actions secrets and Lambda env vars.
- Security headers configured in `apps/_template/next.config.ts` (and apps/web/next.config.ts).
- Input validation via Zod on every server action.
- Dependabot enabled, weekly cadence.
- The IAM policy in `infra/iam/cdk-deploy-policy.json` is the least-privilege baseline for the deploy user. Use it instead of `AdministratorAccess`.

## Known production gotchas (do not relearn)

All documented in `docs/DEPLOY.md`. Don't undo the fixes:

1. **Server Actions need `allowedOrigins`** with both CloudFront domain and Lambda Function URL host. Read from `ALLOWED_ORIGINS` env at build time.
2. **`AUTH_URL` env var must be set** to the canonical public URL or NextAuth redirects to the raw Lambda URL.
3. **Sign-out must use the client-side `signOut` from `next-auth/react`**, not a server-action form.
4. **`open-next build` must run before `cdk bootstrap`/`deploy`** because the construct references `.open-next/` paths.
5. **CDK env vars are baked at synth time**, not deploy time.
6. **OpenNext image-opt function fails to install its deps on Windows**. Build on Linux/macOS/WSL.
7. **First deploy needs two passes** (or use `customDomain` prop on the construct).
8. **Refactoring resources into a construct changes logical IDs.** Use `logicalIdOverrides` for in-place upgrades.
9. **CloudFront deletes take 10-15 minutes.** Not a bug.

## When adding a new app to a cloned repo

1. Replace `apps/web/` with your real Next.js app (or grow the demo)
2. If scaffolding with `create-next-app`, overlay files from `apps/_template/`
3. Rename `infra/cdk/_template/` to `infra/cdk/<your-app>/`, edit `bin/app.ts` stack id
4. Configure GitHub secrets/vars per `docs/DEPLOY.md`, push, verify smoke test passes
