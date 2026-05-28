# Platform template, Claude Code conventions

This repo is a platform-layer template for Next.js apps on AWS serverless. When working in repos cloned from it, follow these rules.

## Structure

```
apps/
├── _template/                       # Overlay files for an app scaffolded with create-next-app
│   ├── next.config.ts               # Security headers + Server Actions allowedOrigins
│   ├── auth.config.ts               # Edge-safe NextAuth config
│   ├── middleware.ts                # Route protection
│   ├── sentry.{client,server,edge}.config.ts + instrumentation.ts
│   ├── lib/email.ts                 # Resend helper (no-ops without key)
│   ├── lib/rate-limit.ts            # Upstash helper (no-ops without keys)
│   └── components/
│       ├── SignOutButton.tsx        # Client signout
│       ├── PostHogProvider.tsx      # Analytics + flags (no-ops without key)
│       ├── Toaster.tsx              # Sonner toast root
│       └── forms-README.md          # Documents RHF vs server-action forms
└── _demo/                           # Working demo app. Platform CI builds this and synths
                                     # the CDK construct against it.

infra/
├── cdk/_template/                   # Full CDK package. Copy and rename per app.
│   ├── bin/app.ts
│   ├── lib/web-stack.ts
│   ├── lib/constructs/NextjsServerless.ts   # The reusable construct
│   ├── package.json, tsconfig.json, cdk.json
│   └── README.md
├── cdk/_setup/                      # One-time stack: GitHub OIDC + IAM role
└── iam/cdk-deploy-policy.json       # Least-privilege IAM policy

scripts/verify-deploy.sh             # Post-deploy smoke test (9 checks)

.github/workflows/
├── ci.yml                           # actionlint, typecheck, lint, demo build, cdk synth
├── security.yml                     # CodeQL, gitleaks, npm audit
└── deploy.yml                       # OIDC, preflight gate, build, deploy, smoke test
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
5. Copy `apps/_template/specs/`, `apps/_template/tests/`, `apps/_template/vitest.config.ts`, `apps/_template/playwright.config.ts`, and `apps/_template/.github/workflows/test.yml` into the new app. Wire the spec-test ESLint rule into the app's flat config. See `docs/TESTING.md`.

## Spec-driven build protocol (mandatory)

Every app on this platform is built from a spec and tested against that spec. The full system is documented in `docs/TESTING.md`. The agent protocol below is mandatory whenever you are building or extending an app.

**When the user gives you a brief for a new app:**

1. First artifact you produce is `specs/<app>.yml`. Translate the brief into requirements, each with a unique ID (`<APP>-<DOMAIN>-<NNN>`), category, severity, given/when/then. Do not write any application code yet. If the user wants to correct interpretation, they say so before code is written.
2. After the spec, for each requirement, write the `specTest('<ID>', ...)` and the implementation **in the same turn**. Tests use `@platform/spec-test/playwright` for ui/functional/security/a11y and `@platform/spec-test/vitest` for data.
3. Run `npm run test:spec` continuously. The build is not "done" until the gate exits 0 (100% coverage, no failing tests, no category mismatches, lint passing).
4. Never claim "the app works" without a green `test:spec`. The user should not have to ask. If the gate is red, the work is incomplete.

**When the user gives you a brief for a new feature inside an existing app:**

1. Add the new requirements to the app's `specs/<app>.yml` first. Do not extend code without a spec entry to point at.
2. Write `specTest()` and implementation in the same turn, as above.
3. **If the feature is user-facing**, write at least one journey-level e2e that traverses the full path (admin-creates → officer-uses → admin-sees-result), not only isolated component-level assertions. This catches the decomposed-journey trap (see "What this does NOT prevent" below) where individual pieces are green but the chain is broken.
4. Re-run `test:spec`. Ship when green.

**When the user gives you a brief for a bug fix:**

1. If the bug points to a missing or wrong requirement in the spec, fix the spec first (or add the missing requirement).
2. Write a failing `specTest()` that captures the bug. Confirm it fails on current code.
3. Fix the code. Confirm `specTest()` passes.
4. Coverage gate stays green.

**For apps built before this protocol existed (armoury, scamshield):**

Treat backfilling as a separate task. Reverse-engineer requirements from the running app + the original brief into `specs/<app>.yml`. Write `specTest()` per requirement. Where a test reveals a real bug, fix the code in the same PR. Land the spec + tests + fixes together. Enable the gate in CI once coverage hits 100%.

**What this prevents:**

- Shipping an app and only finding out at verification time that flows are broken (the dropdown-rendered-as-text-input class of bug). The gate refuses to deploy if any requirement is uncovered or its test is red.
- "I'll write tests later." There is no later. Tests and code ship together or not at all.
- Test-as-checkbox without assertions. The ESLint rule fails lint on any `specTest()` body that contains zero `expect()` calls.

**What this does NOT prevent:**

- A wrong spec (e.g. requirement says scoring formula is wrong, test agrees with the wrong formula). The spec correctness is on the human reviewer.
- New behavior that nobody added a spec entry for. Code review catches that.
- **Decomposed-journey gaps.** A feature whose spec is split across multiple IDs can hit 100% coverage while one link in the user chain is broken (e.g. ARM-PHOTO-001..003 covered the officer submit page, response storage, and PDF render; nothing covered the admin builder's item-kind dropdown, which silently omitted Photo → feature unreachable). Mitigation: for every user-facing feature, ship at least one journey-level e2e that traverses the full path (admin-creates → officer-uses → admin-sees-result). See `docs/TESTING.md` "Failure modes the gate does NOT catch" for the worked example.
