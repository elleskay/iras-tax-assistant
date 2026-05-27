import { auth } from "@/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-gray-500">Signed in as {session.user.email}</p>
        </div>
        <SignOutButton />
      </header>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm">
          You are looking at the platform's demo app. It exists so the platform repo can self-test
          the constructs and patterns end to end. Replace this app with your real one.
        </p>
        <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-gray-600">
          <li>Auth via Auth.js v5 (Credentials, JWT)</li>
          <li>Edge-safe middleware in middleware.ts</li>
          <li>Security headers + Server Actions allowed-origins in next.config.ts</li>
          <li>Client-side signout (works on AWS serverless deploys)</li>
          <li>Healthcheck at /api/health</li>
          <li>Deployable via NextjsServerless CDK construct</li>
        </ul>
      </div>
    </main>
  );
}
