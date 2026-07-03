import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { NextjsServerless } from "./constructs/NextjsServerless";

// Default to the conventional `apps/web` location. Override via PLATFORM_DEMO_APP_PATH
// so platform CI can point at `apps/_demo` for self-test without rewriting this file.
const APP_REL = process.env.PLATFORM_DEMO_APP_PATH ?? "apps/web";

export class WebStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Private bucket backing the app's JSON store (workspaces, prompts, gateway
    // logs, eval runs, governance). The Lambda filesystem is read-only, so this
    // is where per-workspace state lives. Not public: it holds workspace data.
    // RETAIN: this is the app's entire persistence layer (there is no database),
    // so a stack delete or an accidental logical-id change must orphan the
    // bucket, not wipe every workspace, prompt version, and audit log.
    const hitlBucket = new s3.Bucket(this, "HitlBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const web = new NextjsServerless(this, "Web", {
      appPath: path.resolve(__dirname, "..", "..", "..", "..", APP_REL),
      environment: {
        // The chat agent's runtime secret. Baked at synth (docs/DEPLOY.md #13),
        // so it MUST ALSO be forwarded in the deploy workflow's CDK-deploy step
        // (.github/workflows/deploy.yml) and stored as a GitHub Actions secret.
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
        ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL ?? "",
        // Used by the model router (factual lookups and the cheap classifier).
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
        // Per-workspace RAG service (FastAPI + LlamaIndex + pgvector, on Fly).
        // Not a secret; defaults to the deployed Fly app. Unset disables RAG,
        // and the assistant falls back to the built-in fact lookup.
        RAG_SERVICE_URL:
          process.env.RAG_SERVICE_URL ?? "https://iras-rag.fly.dev",
        // Shared bearer token for the RAG service (services/rag). Unset means
        // the client sends no Authorization header (only valid if the service
        // is also unset). Baked at synth: forward it in deploy.yml too.
        RAG_SERVICE_TOKEN: process.env.RAG_SERVICE_TOKEN ?? "",
        // Upstash rate limiting (lib/rate-limit.ts). Without these the app
        // fails open and the public API routes have NO rate limiting in prod.
        UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL ?? "",
        UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
        // App JSON store bucket, read by lib/store.ts. Resolved at deploy time.
        HITL_BUCKET: hitlBucket.bucketName,
      },
      // The chat route streams from the LLM and can exceed the 30s default.
      // Raises both the Lambda timeout and the CloudFront origin read timeout
      // (docs/DEPLOY.md #14). Matches the route's maxDuration = 60.
      serverTimeoutSeconds: 60,
      // Custom domain on the CloudFront distribution. DNS lives on Vercel
      // (soonkeong.dev), so no hostedZoneId here: a CNAME record points
      // ai-tax.soonkeong.dev at the distribution. The cert ARN is not a secret,
      // but it is account-specific, so allow an env override for forks.
      customDomain: {
        domainName: process.env.CUSTOM_DOMAIN_NAME ?? "ai-tax.soonkeong.dev",
        certificateArn:
          process.env.CERTIFICATE_ARN ??
          "arn:aws:acm:us-east-1:281639842383:certificate/45a2e0d5-b434-4f9c-a978-60ff3d4d3ac6",
      },
    });

    // Let the server Lambda read and write escalations.
    hitlBucket.grantReadWrite(web.serverFunction);
  }
}
