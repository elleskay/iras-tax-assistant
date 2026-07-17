# apps/_template: reference overlay files

Files you copy into a new app on first scaffold. They encode the production patterns this platform discovered the hard way.

## What's here

| File | Purpose |
|---|---|
| `next.config.ts` | Security headers + Server Actions `allowedOrigins` (read from `ALLOWED_ORIGINS` env at build time) |
| `open-next.config.ts` | Streaming Lambda wrapper. The CDK construct pins `RESPONSE_STREAM` invoke mode, so the default buffered wrapper breaks responses |
| `auth.config.ts` | Edge-safe NextAuth config for middleware (no DB calls) |
| `middleware.ts` | Auth-only middleware that reads `auth.config.ts` |
| `components/SignOutButton.tsx` | Client component for signout (server-action signout doesn't clear cookies on OpenNext) |
| `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts` | Sentry wiring. No-ops without `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` |
| `components/PostHogProvider.tsx` | PostHog analytics provider. No-ops without `NEXT_PUBLIC_POSTHOG_KEY` |
| `components/Toaster.tsx` | Sonner toast root. Mount once in layout. |
| `lib/email.ts` | Resend helper. No-ops without `RESEND_API_KEY` |
| `lib/rate-limit.ts` | Upstash Redis rate-limit factory. No-ops without `UPSTASH_REDIS_*` |
| `components/StatCard.tsx` | Generic stat card with lucide icon, value, tone, optional delta |
| `components/EmptyState.tsx` | Generic empty state with lucide icon, title, optional CTA |
| `components/PageHeader.tsx` | Generic page header with title, description, actions |
| `components/ThemeProvider.tsx`, `components/ThemeToggle.tsx` | next-themes wiring + sun/moon/system toggle |
| `components/forms-README.md` | Doc on the two valid form patterns; install RHF per app if you want pattern B |
| `components/theming-README.md` | Doc on picking brand color, icon, layout, dashboard composition per app |
| `specs/`, `tests/`, `vitest.config.ts`, `playwright.config.ts` | Spec-driven test scaffolding (see `docs/TESTING.md`) |
| `.github/workflows/test.yml` | Test workflow to copy to the repo root `.github/workflows/` (workflows only run from there) |

## Why each one exists

Each fixes a bug or removes friction we hit on real deploys. See `docs/DEPLOY.md` for the production gotchas.

- `allowedOrigins` from env: fixes "Invalid Server Actions request" when CloudFront forwards to Lambda
- `auth.config.ts` separate from `auth.ts`: middleware runs on Edge runtime and can't import DB client
- Client-side `SignOutButton`: server-side `signOut` doesn't clear cookies through OpenNext's Lambda streaming
- `open-next.config.ts`: `open-next build` defaults to the buffered `aws-lambda` wrapper; the construct's streaming Function URL needs `aws-lambda-streaming`
- Sentry/PostHog/Sonner/Resend/Upstash: universal enough that pre-wiring saves every app from rebuilding the same plumbing
- Client Sentry lives in `instrumentation-client.ts` (Next 15.3+ loads it natively); a `sentry.client.config.ts` is only picked up by the `withSentryConfig` webpack wrapper, which this platform does not use, so errors would silently never report

## How to use

When scaffolding a new app (paths relative to the repo root):

```bash
# 1. Create the Next.js app shell
npx create-next-app@latest apps/web --typescript --tailwind --app --eslint

# 2. Overlay these reference files (everything in _template except the docs)
cp -r apps/_template/. apps/web/
rm apps/web/README.md apps/web/components/forms-README.md apps/web/components/theming-README.md
# Workflows only execute from the repo root:
mkdir -p .github/workflows && mv apps/web/.github/workflows/test.yml .github/workflows/ && rm -rf apps/web/.github

# 3. Install runtime deps used by the overlay files
cd apps/web
npm install next-auth@beta zod
npm install @opennextjs/aws
npm install @sentry/nextjs posthog-js sonner resend @upstash/ratelimit @upstash/redis
npm install lucide-react next-themes
```

The StatCard/EmptyState/PageHeader/ThemeToggle components also import shadcn/ui
primitives (`@/components/ui/card`, `ui/button`, `ui/dropdown-menu`) and
`@/lib/utils`; run `npx shadcn@latest init` and add those components, or delete
the template components you do not want before the first build.

Then write your own `auth.ts` that imports `auth.config.ts` and adds the provider (Credentials, OAuth, whatever fits).

## What this template does NOT include

- Auth providers: your app picks
- Database schema or ORM: your app picks
- Application UI beyond the generic building blocks listed above: your app picks
- React Hook Form: see `components/forms-README.md` for the trade-off; install per app
- Page layouts and routes: your app picks

This is the minimal shell + universal infrastructure. Everything else is product code.
