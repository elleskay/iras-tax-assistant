"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

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
      className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
    >
      {loading ? "Signing out..." : "Sign out"}
    </button>
  );
}
