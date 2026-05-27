"use client";

import { Toaster as SonnerToaster } from "sonner";

// Mount this once near the root of your layout (inside <body>) so server
// actions and client components can call `toast.success()` / `toast.error()`
// from anywhere.
export function Toaster() {
  return <SonnerToaster richColors position="top-right" />;
}
