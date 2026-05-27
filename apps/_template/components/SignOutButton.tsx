"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

// Use this instead of a server-action form for signing out. The server-action
// path does not reliably clear cookies through OpenNext's Lambda streaming
// response, so users stay logged in. Calling signOut from next-auth/react
// goes through /api/auth/signout which clears cookies via Set-Cookie.
export function SignOutButton({ redirectTo = "/login" }: { redirectTo?: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => {
        setLoading(true);
        void signOut({ redirectTo });
      }}
      className="rounded-md border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
    >
      {loading ? "Signing out..." : "Sign out"}
    </button>
  );
}
