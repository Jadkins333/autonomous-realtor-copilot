"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

import { OfflineBanner } from "@/components/offline-banner";
import { FixtureModeBanner } from "@/components/fixture-mode-banner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/setup", label: "Setup" },
  { href: "/sources", label: "Sources" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/copilot", label: "Copilot" },
  { href: "/properties", label: "Properties" },
  { href: "/contacts", label: "Contacts" },
  { href: "/outreach", label: "Outreach" }
];

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5">
        <div>
          <p className="font-heading text-xl font-bold">Autonomous Realtor Intelligence</p>
          <p className="text-xs text-muted-foreground">Columbus, Ohio Public-Data MVP</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded-full bg-card px-3 py-1">{session?.user?.email}</span>
          <Button variant="outline" onClick={() => signOut({ callbackUrl: "/login" })}>
            Sign out
          </Button>
        </div>
      </header>
      <div className="mx-auto w-full max-w-7xl px-4">
        <OfflineBanner />
        <FixtureModeBanner />
      </div>
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 px-4 pb-8 md:grid-cols-[220px,1fr]">
        <nav className="h-fit rounded-2xl border bg-card p-3">
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "block rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted",
                    pathname.startsWith(item.href) && "bg-muted"
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main>{children}</main>
      </div>
    </div>
  );
}
