"use client";

import type { LucideIcon } from "lucide-react";
import React, { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Bot,
  Building2,
  Database,
  LayoutDashboard,
  Send,
  Settings2,
  Sparkles,
  UsersRound,
  Wrench
} from "lucide-react";

import { FixtureModeBanner } from "@/components/fixture-mode-banner";
import { OfflineBanner } from "@/components/offline-banner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
};

const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "High-signal view of health, activity, and system posture."
  },
  {
    href: "/setup",
    label: "Setup",
    icon: Wrench,
    description: "Environment readiness and diagnostics."
  },
  {
    href: "/sources",
    label: "Sources",
    icon: Database,
    description: "Connector health, drift status, and replay controls."
  },
  {
    href: "/opportunities",
    label: "Opportunities",
    icon: Sparkles,
    description: "Lead discovery and market pressure signals."
  },
  {
    href: "/copilot",
    label: "Copilot",
    icon: Bot,
    description: "Agent workflows and command execution."
  },
  {
    href: "/properties",
    label: "Properties",
    icon: Building2,
    description: "Parcel intelligence, maps, and insight cards."
  },
  {
    href: "/contacts",
    label: "Contacts",
    icon: UsersRound,
    description: "Relationship memory, message history, and enrollments."
  },
  {
    href: "/outreach",
    label: "Outreach",
    icon: Send,
    description: "Draft packs, approvals, and follow-up."
  },
  {
    href: "/sequences",
    label: "Sequences",
    icon: Settings2,
    description: "Timed nurture programs and enrollment control."
  }
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const activeItem =
    NAV.find((item) => isActive(pathname, item.href)) ?? NAV[0];

  return (
    <div className="min-h-screen">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="mx-auto flex w-full max-w-[1540px] gap-5 px-4 py-4 sm:px-5 lg:px-6 lg:py-6">
        <aside className="hidden w-[292px] shrink-0 md:block">
          <div className="sticky top-4 flex h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-[30px] border border-sidebar-border/90 bg-sidebar text-sidebar-foreground shadow-panel">
            <div className="border-b border-white/10 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                  <Sparkles className="h-5 w-5 text-sidebar-accent" />
                </div>
                <div>
                  <p className="font-heading text-lg font-semibold tracking-[-0.03em]">
                    Autonomous Realtor
                  </p>
                  <p className="text-xs text-sidebar-foreground/60">
                    Calm operations console
                  </p>
                </div>
              </div>
              <div className="mt-5 rounded-[24px] border border-white/10 bg-white/10 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/60">
                  Current focus
                </p>
                <p className="mt-2 font-heading text-[1.1rem] font-semibold">
                  {activeItem.label}
                </p>
                <p className="mt-2 text-sm leading-6 text-sidebar-foreground/70">
                  {activeItem.description}
                </p>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto p-4" aria-label="Primary">
              <ul className="space-y-1.5">
                {NAV.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group flex items-center gap-3 rounded-[22px] border px-3.5 py-3 text-sm font-medium transition-all duration-200 ease-out focus-visible:border-white/40 focus-visible:bg-white/12 focus-visible:text-white",
                          active
                            ? "border-white/20 bg-white text-slate-900 shadow-soft"
                            : "border-transparent text-sidebar-foreground/70 hover:border-white/10 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-colors",
                            active
                              ? "bg-slate-100 text-primary"
                              : "bg-white/10 text-sidebar-foreground/70 group-hover:bg-white/20 group-hover:text-sidebar-accent"
                          )}
                        >
                          <Icon className="h-[18px] w-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block">{item.label}</span>
                          <span
                            className={cn(
                              "mt-0.5 block text-[0.73rem] leading-5",
                              active
                                ? "text-slate-500"
                                : "text-sidebar-foreground/50"
                            )}
                          >
                            {item.description}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="border-t border-white/10 p-4">
              <div className="rounded-[24px] border border-white/10 bg-white/10 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/60">
                  Signed in
                </p>
                <p className="mt-2 truncate text-sm font-semibold text-white">
                  {session?.user?.email ?? "Unknown user"}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4 w-full justify-center border-white/0 bg-white/20 text-white hover:bg-white/25"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                >
                  Sign out
                </Button>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="app-panel mb-4 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="page-kicker">Autonomous Realtor Copilot</div>
                <div className="space-y-2">
                  <p className="font-heading text-[1.55rem] font-semibold tracking-[-0.04em] text-foreground md:text-[1.85rem]">
                    Calm command center for sourcing, contacts, and follow-up
                  </p>
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                    Sharper hierarchy, calmer surfaces, and faster scanning
                    without changing the working flows underneath.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="rounded-[22px] border border-border/70 bg-white/80 px-4 py-3 text-sm shadow-soft">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Workspace
                  </p>
                  <p className="mt-1 font-semibold text-foreground">
                    {activeItem.label}
                  </p>
                </div>
                <div className="rounded-[22px] border border-border/70 bg-white/80 px-4 py-3 text-sm shadow-soft">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Operator
                  </p>
                  <p className="mt-1 font-semibold text-foreground">
                    {session?.user?.email ?? "Unknown user"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="sm:self-stretch"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                >
                  Sign out
                </Button>
              </div>
            </div>

            <div className="mt-4 md:hidden">
              <nav
                aria-label="Primary mobile"
                className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
              >
                {NAV.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition-all focus-visible:border-primary/30 focus-visible:bg-primary/12 focus-visible:text-foreground",
                        active
                          ? "border-primary/20 bg-primary/10 text-primary shadow-soft"
                          : "border-border/70 bg-white/80 text-muted-foreground hover:bg-white hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </header>

          <div className="space-y-3">
            <OfflineBanner />
            <FixtureModeBanner />
          </div>

          <main id="main-content" tabIndex={-1} className="pb-10 pt-4">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
