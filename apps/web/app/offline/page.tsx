import Link from "next/link";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-xl">
        <CardTitle className="mb-3">You are offline</CardTitle>
        <CardDescription>
          The app shell is available, but live API data cannot be refreshed right now. Reconnect to the
          internet and return to the dashboard.
        </CardDescription>
        <p className="mt-4 text-sm">
          When online, continue at <Link className="text-accent underline" href="/dashboard">/dashboard</Link>.
        </p>
      </Card>
    </main>
  );
}
