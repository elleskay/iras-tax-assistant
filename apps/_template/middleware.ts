import NextAuth, { type NextAuthResult } from "next-auth";
import { authConfig } from "./auth.config";

// The explicit NextAuthResult annotation avoids the TS2742 "inferred type
// cannot be named" error next-auth v5 triggers in strict/monorepo setups.
const { auth }: NextAuthResult = NextAuth(authConfig);
export default auth;

export const config = {
  // Skip static assets and image responses. NOTE: this also skips ALL /api
  // routes, so middleware auth never protects them; every API handler must
  // check auth() itself.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
