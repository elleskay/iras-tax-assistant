import type { NextAuthConfig } from "next-auth";

// Edge-safe NextAuth config. Imported by middleware.ts so it must not pull in
// the database client or any Node-only deps. The provider list is empty here;
// add providers in the full auth.ts which imports this config and is invoked
// only from Node runtime (not Edge).
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  // Required behind a proxy (CloudFront, ALB, App Runner, etc).
  trustHost: true,
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const onLogin = nextUrl.pathname.startsWith("/login");

      if (onLogin) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }

      // Allow everything else by default. Apps add role-based checks here.
      if (!isLoggedIn) {
        const signinUrl = new URL("/login", nextUrl);
        signinUrl.searchParams.set("callbackUrl", nextUrl.pathname);
        return Response.redirect(signinUrl);
      }

      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
