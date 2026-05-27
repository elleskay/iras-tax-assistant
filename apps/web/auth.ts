import NextAuth, { type NextAuthResult } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./auth.config";

// Demo only. Replace with a real provider and a real user store.
const DEMO_USER = {
  id: "demo-1",
  email: "demo@platform.test",
  password: "demo123",
  name: "Demo User",
};

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const result: NextAuthResult = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        if (email !== DEMO_USER.email || password !== DEMO_USER.password) return null;
        return { id: DEMO_USER.id, email: DEMO_USER.email, name: DEMO_USER.name };
      },
    }),
  ],
});

export const handlers = result.handlers;
export const auth = result.auth;
export const signIn = result.signIn;
export const signOut = result.signOut;
