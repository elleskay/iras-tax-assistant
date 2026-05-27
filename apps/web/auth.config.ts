import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const onLogin = nextUrl.pathname.startsWith("/login");
      const onProtected = nextUrl.pathname.startsWith("/dashboard");

      if (onLogin) {
        if (isLoggedIn) return Response.redirect(new URL("/dashboard", nextUrl));
        return true;
      }

      if (!isLoggedIn && onProtected) {
        const signinUrl = new URL("/login", nextUrl);
        signinUrl.searchParams.set("callbackUrl", nextUrl.pathname);
        return Response.redirect(signinUrl);
      }

      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
