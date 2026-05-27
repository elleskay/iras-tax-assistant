import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// Read at build time. Pass the CloudFront domain AND the Lambda Function URL
// host, comma-separated, e.g.
//   ALLOWED_ORIGINS="d1aeysqic3xk9.cloudfront.net,xxxx.lambda-url.ap-southeast-1.on.aws"
// Required because Next.js Server Actions reject requests when x-forwarded-host
// (Lambda URL) does not match origin (CloudFront).
const allowedOrigins =
  process.env.ALLOWED_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    serverActions: {
      allowedOrigins,
    },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
