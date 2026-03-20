"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Settings,
  Database,
  Zap,
  Bot,
  Building2,
  Users,
  Mail,
  ChevronRight,
  LogOut,
} from "lucide-react";

import { OfflineBanner } from "@/components/offline-banner";
import { FixtureModeBanner } from "@/components/fixture-mode-banner";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/opportunities", label: "Opportunities", icon: Zap },
  { href: "/copilot", label: "Copilot", icon: Bot },
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/outreach", label: "Outreach", icon: Mail },
  { href: "/sources", label: "Data Sources", icon: Database },
  { href: "/setup", label: "Setup", icon: Settings },
];

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div className="min-h-screen flex bg-[#0f1117]">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-white/[0.06] bg-[#13161f]">
        {/* Logo */}
        <div className="px-5 py-6 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-rose-600 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-tight">Realtor Copilot</p>
              <p className="text-[10px] text-white/40 leading-tight mt-0.5">Columbus, OH · Public Data</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                  active
                    ? "bg-orange-500/15 text-orange-400"
                    : "text-white/50 hover:text-white/90 hover:bg-white/[0.05]"
                )}
              >
                <Icon className={cn("w-4 h-4 flex-shrink-0 transition-colors", active ? "text-orange-400" : "text-white/30 group-hover:text-white/60")} />
                <span>{item.label}</span>
                {active && <ChevronRight className="w-3 h-3 ml-auto text-orange-400/60" />}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="px-3 py-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.04]">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-white">
                {session?.user?.email?.[0]?.toUpperCase() ?? "A"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white/80 truncate">{session?.user?.name ?? "Agent"}</p>
              <p className="text-[10px] text-white/40 truncate">{session?.user?.email}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-white/30 hover:text-white/70 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top banner area */}
        <div className="px-6">
          <OfflineBanner />
          <FixtureModeBanner />
        </div>
        <main className="flex-1 px-6 py-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
