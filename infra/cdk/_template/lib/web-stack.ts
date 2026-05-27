import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { NextjsServerless } from "./constructs/NextjsServerless";

export class WebStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new NextjsServerless(this, "Web", {
      appPath: path.resolve(__dirname, "..", "..", "..", "..", "apps", "web"),
      environment: {
        DATABASE_URL: process.env.DATABASE_URL ?? "",
        AUTH_SECRET: process.env.AUTH_SECRET ?? "",
        AUTH_URL: process.env.AUTH_URL ?? "",
      },
      // Optional: provide a custom domain so AUTH_URL is known up front.
      // customDomain: {
      //   domainName: "armoury.example.com",
      //   certificateArn: "arn:aws:acm:us-east-1:...",
      //   hostedZoneId: "Z123ABCDE",
      // },
    });
  }
}
