import * as Sentry from "@sentry/nextjs";

// No-ops cleanly when NEXT_PUBLIC_SENTRY_DSN is unset (local dev, demo builds).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.0,
  replaysOnErrorSampleRate: 1.0,
});
