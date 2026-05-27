# apps/_template — reference scaffold

Files you copy into a new app on first scaffold. They encode the production patterns this platform discovered the hard way.

## What's here

| File | Purpose |
|---|---|
| `next.config.ts` | Security headers + Server Actions `allowedOrigins` (read from `ALLOWED_ORIGINS` env at build time) |
| `auth.config.ts` | Edge-safe NextAuth config for middleware (no DB calls) |
| `middleware.ts` | Auth-only middleware that reads `auth.config.ts`. Add role-aware redirects in your app. |
| `components/SignOutButton.tsx` | Client component that calls `signOut` from `next-auth/react`. Use this instead of a server-action form. |

## Why these specific patterns

Each one fixes a bug we hit in production on the AWS serverless deploy. See `docs/DEPLOY.md` for the gotcha details.

- `allowedOrigins` from env → fixes "Invalid Server Actions request" when CloudFront forwards to Lambda
- `auth.config.ts` separate from `auth.ts` → required because middleware runs on Edge runtime and can't import DB client
- Client-side `SignOutButton` → server-side `signOut` Server Action doesn't clear cookies through OpenNext's Lambda streaming

## How to use

When scaffolding a new app:

```bash
# 1. Create the Next.js app shell
npx create-next-app@latest apps/web --typescript --tailwind --app --eslint

# 2. Overlay these reference files
cp <platform>/apps/_template/next.config.ts apps/web/
cp <platform>/apps/_template/auth.config.ts apps/web/
cp <platform>/apps/_template/middleware.ts apps/web/
mkdir -p apps/web/components
cp <platform>/apps/_template/components/SignOutButton.tsx apps/web/components/

# 3. Install Auth.js
cd apps/web
npm install next-auth@beta
```

Then write your own `auth.ts` that imports `auth.config.ts` and adds the provider (Credentials, OAuth, whatever fits).

## What this template does NOT include

- Auth providers (Credentials, OAuth) — your app picks
- Database schema or ORM — your app picks
- UI components beyond `SignOutButton` — your app picks
- Page layouts, routes — your app picks

This is the minimal shell. Everything else is product code.
