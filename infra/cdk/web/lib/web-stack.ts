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
    const hitlBucket = new s3.Bucket(this, "HitlBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
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
        // App JSON store bucket, read by lib/store.ts. Resolved at deploy time.
        HITL_BUCKET: hitlBucket.bucketName,
      },
      // The chat route streams from the LLM and can exceed the 30s default.
      // Raises both the Lambda timeout and the CloudFront origin read timeout
      // (docs/DEPLOY.md #14). Matches the route's maxDuration = 60.
      serverTimeoutSeconds: 60,
      // Custom domain on the CloudFront distribution. DNS lives on Vercel
      // (soonkeong.dev), so no hostedZoneId here: a CNAME record points
      // ai-tax.soonkeong.dev at the distribution. The cert ARN is not a secret.
      customDomain: {
        domainName: "ai-tax.soonkeong.dev",
        certificateArn:
          "arn:aws:acm:us-east-1:281639842383:certificate/45a2e0d5-b434-4f9c-a978-60ff3d4d3ac6",
      },
    });

    // Let the server Lambda read and write escalations.
    hitlBucket.grantReadWrite(web.serverFunction);
  }
}
