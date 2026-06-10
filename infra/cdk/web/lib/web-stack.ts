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

    // Private bucket backing the human-in-the-loop escalation queue. The Lambda
    // filesystem is read-only, so escalations are stored here instead of a file.
    // Not public: this holds user-submitted queries.
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
        // Optional bearer token for the MCP endpoint's escalate_to_human tool.
        // Empty means the tool is open (no-op-without-key convention). Same
        // two-place wiring rule as ANTHROPIC_API_KEY above.
        MCP_API_KEY: process.env.MCP_API_KEY ?? "",
        // HITL escalation store. Resolved at deploy time (a CDK token).
        HITL_BUCKET: hitlBucket.bucketName,
      },
      // The chat route streams from the LLM and can exceed the 30s default.
      // Raises both the Lambda timeout and the CloudFront origin read timeout
      // (docs/DEPLOY.md #14). Matches the route's maxDuration = 60.
      serverTimeoutSeconds: 60,
      // Optional: provide a custom domain.
      // customDomain: {
      //   domainName: "iras-tax.example.com",
      //   certificateArn: "arn:aws:acm:us-east-1:...",
      //   hostedZoneId: "Z123ABCDE",
      // },
    });

    // Let the server Lambda read and write escalations.
    hitlBucket.grantReadWrite(web.serverFunction);
  }
}
