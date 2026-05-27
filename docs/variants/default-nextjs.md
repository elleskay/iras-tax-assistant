# Next.js + AWS serverless (the only variant)

This is the platform's happy path. Everything in the platform is designed for this.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript strict |
| Styling | Tailwind |
| Database | Postgres (Neon for serverless connection pooling) |
| Auth | Auth.js v5 (Credentials or OAuth, JWT sessions) |
| Validation | Zod on every server action boundary |
| Build adapter | OpenNext (`@opennextjs/aws`) |
| Hosting | AWS Lambda (server) + S3 (static assets) + CloudFront (edge) |
| IaC | AWS CDK |
| CI/CD | GitHub Actions (provided in `.github/workflows/`) |

## Scaffold

```bash
# Create the Next.js app shell
npx create-next-app@latest apps/web --typescript --tailwind --app --eslint --use-npm

# Install Auth.js, OpenNext, and the rest
cd apps/web
npm install next-auth@beta zod
npm install @opennextjs/aws

# Pick your data layer
npm install drizzle-orm pg            # or prisma, or whatever
npm install -D drizzle-kit @types/pg
```

## Overlay the platform's reference patterns

Copy from `apps/_template/` in the platform:

- `next.config.ts` (security headers + Server Actions allowed-origins)
- `auth.config.ts` (edge-safe NextAuth config)
- `middleware.ts` (route protection)
- `components/SignOutButton.tsx` (client-side signout)

See `apps/_template/README.md` for why each one exists.

## CDK setup

```bash
mkdir -p infra/cdk/app/{bin,lib}
cp -r <platform>/infra/cdk/constructs infra/cdk/
```

Write `infra/cdk/app/bin/app.ts` and `infra/cdk/app/lib/web-stack.ts` that instantiate `NextjsServerless`. See `infra/cdk/constructs/README.md` for the exact 5-line usage.

## Deploy

The platform's `.github/workflows/deploy.yml` works as-is once you set these GitHub secrets and vars on the repo:

| Setting | Type | Value |
|---|---|---|
| `AWS_DEPLOY_ROLE_ARN` | secret | OIDC role ARN |
| `DATABASE_URL` | secret | Postgres connection string |
| `AUTH_SECRET` | secret | `openssl rand -base64 32` output |
| `AWS_REGION` | variable | e.g. `ap-southeast-1` |
| `APP_URL` | variable | Your CloudFront URL or custom domain |
| `ALLOWED_ORIGINS` | variable | CloudFront host + Lambda URL host, comma-separated |

The smoke test in `scripts/verify-deploy.sh` runs post-deploy and fails CI if any critical flow regresses.

## Cost

- Lambda Free Tier: 1M req/month, 400k GB-seconds → covers idle + light traffic
- S3 Free Tier: 5GB + 20k GET → covers static assets
- CloudFront Free Tier: 1TB transfer/month
- Realistic idle: $0-2/month

## Why not Fargate?

Fargate (ECS + ALB + RDS + NAT) costs ~$95/month idle. For a portfolio or low-traffic app it's strictly worse. If you have steady high traffic, websockets, or long-running jobs, fork this repo, swap `NextjsServerless` for an equivalent Fargate construct, and reintroduce the VPC + ECR base. That's a deliberate choice; the platform's default doesn't carry that infra by accident.

## Why not Vercel?

Vercel is the obvious choice for serverless Next.js — and if your story is "I ship products on Vercel", use Vercel. This platform exists to show competence with AWS-native deploys (CDK, Lambda, CloudFront, IAM, OIDC) on top of the same Next.js code. Different goal.
