"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Clock3,
  PhoneCall,
  TrendingUp,
} from "lucide-react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at?: string | null;
  contact_name?: string | null;
  deal_title?: string | null;
  parcel_address?: string | null;
};

type FollowUpRow = {
  id: string;
  name: string;
  stage: string;
  priority: string;
  next_step_due_at?: string | null;
  next_step_note?: string | null;
  last_contact_at?: string | null;
  preferred_channel?: string | null;
};

type DealRow = {
  id: string;
  title: string;
  stage: string;
  priority: string;
  contact_name?: string | null;
  parcel_address?: string | null;
  next_milestone_at?: string | null;
  overdue_task_count: number;
};

type CoachAlertRow = {
  id: string;
  title: string;
  detail: string;
  href: string;
  cta_label: string;
  tone: string;
};

type ReengageRow = {
  id: string;
  name: string;
  stage: string;
  priority: string;
  preferred_channel?: string | null;
  last_event_at?: string | null;
  trigger: string;
  trigger_date?: string | null;
  detail: string;
};

type ComingUpRow = {
  id: string;
  name: string;
  stage: string;
  priority: string;
  preferred_channel?: string | null;
  last_event_at?: string | null;
  occasion: string;
  occasion_date: string;
  detail: string;
};

type TodayPayload = {
  summary: {
    open_tasks: number;
    overdue_tasks: number;
    due_today: number;
    active_deals: number;
    deals_at_risk: number;
    follow_ups_due: number;
  };
  coach_alerts: CoachAlertRow[];
  urgent_tasks: TaskRow[];
  due_today_tasks: TaskRow[];
  follow_ups: FollowUpRow[];
  reengage: ReengageRow[];
  coming_up: ComingUpRow[];
  deals_at_risk: DealRow[];
  pipeline: Array<{ stage: string; count: number }>;
};

function fmtDate(value?: string | null) {
  if (!value) return "No date";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function stageLabel(value: string) {
  return value.replace(/_/g, " ");
}

function occasionLabel(value: string) {
  return value.replace(/_/g, " ");
}

export default function DashboardPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const apiToken = (session as { apiToken?: string } | null)?.apiToken;
  const [payload, setPayload] = useState<TodayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!apiToken) return;
    setLoading(true);
    try {
      const data = await apiFetch<TodayPayload>("/workspace/today", apiToken);
      setPayload(data);
    } finally {
      setLoading(false);
    }
  }, [apiToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function completeTask(taskId: string) {
    if (!apiToken) return;
    setSavingTaskId(taskId);
    try {
      await apiFetch(`/tasks/${taskId}`, apiToken, {
        method: "PUT",
        body: JSON.stringify({ status: "completed" }),
      });
      await load();
    } finally {
      setSavingTaskId(null);
    }
  }

  if (status !== "authenticated") return null;

  const summary = payload?.summary;

  return (
    <SiteShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-400/80">Today</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Run the business, not just the intel.</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/45">
            This is the agent operating screen: overdue tasks, follow-ups due, pipeline risk, and what needs a human touch next.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/pipeline">
            <Button variant="outline" className="border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.06]">
              Open Pipeline
            </Button>
          </Link>
          <Link href="/contacts">
            <Button className="bg-orange-500 text-white hover:bg-orange-400">Open CRM</Button>
          </Link>
        </div>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="Open Tasks" value={summary?.open_tasks ?? 0} icon={<Clock3 className="h-4 w-4" />} />
        <SummaryCard label="Overdue" value={summary?.overdue_tasks ?? 0} icon={<AlertTriangle className="h-4 w-4" />} tone="danger" />
        <SummaryCard label="Due Today" value={summary?.due_today ?? 0} icon={<CalendarClock className="h-4 w-4" />} tone="warn" />
        <SummaryCard label="Active Deals" value={summary?.active_deals ?? 0} icon={<BriefcaseBusiness className="h-4 w-4" />} />
        <SummaryCard label="Deals At Risk" value={summary?.deals_at_risk ?? 0} icon={<TrendingUp className="h-4 w-4" />} tone="warn" />
        <SummaryCard label="Follow-Ups Due" value={summary?.follow_ups_due ?? 0} icon={<PhoneCall className="h-4 w-4" />} tone="danger" />
      </div>

      <Card className="mb-6 border-white/[0.08] bg-[#13161f] text-white">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <CardTitle className="text-white">Coach Alerts</CardTitle>
            <CardDescription className="text-white/40">
              Proactive signals from your actual pipeline, not generic market chatter.
            </CardDescription>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {(payload?.coach_alerts || []).length === 0 ? (
            <EmptyState text="No proactive coach alerts are surfaced yet." />
          ) : (
            payload?.coach_alerts.map((alert) => (
              <Link
                key={alert.id}
                href={alert.href}
                className="block rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 transition hover:border-orange-500/30 hover:bg-white/[0.05]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">{alert.title}</p>
                    <p className="mt-2 text-sm text-white/60">{alert.detail}</p>
                  </div>
                  <span className="rounded-full border border-orange-500/25 bg-orange-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-orange-300">
                    {alert.tone}
                  </span>
                </div>
                <p className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-orange-300">
                  {alert.cta_label} <ArrowRight className="h-3 w-3" />
                </p>
              </Link>
            ))
          )}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-white/[0.08] bg-[#13161f] text-white">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <CardTitle className="text-white">Overdue Tasks</CardTitle>
              <CardDescription className="text-white/40">These are already late and need attention first.</CardDescription>
            </div>
          </div>
          <div className="space-y-3">
            {(payload?.urgent_tasks || []).length === 0 ? (
              <EmptyState text="No overdue tasks. This is the calmest part of your board right now." />
            ) : (
              payload?.urgent_tasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  savingTaskId={savingTaskId}
                  onComplete={completeTask}
                />
              ))
            )}
          </div>
        </Card>

        <Card className="border-white/[0.08] bg-[#13161f] text-white">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <CardTitle className="text-white">Due Today</CardTitle>
              <CardDescription className="text-white/40">Work that should move before the day ends.</CardDescription>
            </div>
          </div>
          <div className="space-y-3">
            {(payload?.due_today_tasks || []).length === 0 ? (
              <EmptyState text="Nothing is due today. Add tasks from a deal or contact to keep this useful." />
            ) : (
              payload?.due_today_tasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  savingTaskId={savingTaskId}
                  onComplete={completeTask}
                />
              ))
            )}
          </div>
        </Card>

        <Card className="border-white/[0.08] bg-[#13161f] text-white">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <CardTitle className="text-white">Follow-Up Queue</CardTitle>
              <CardDescription className="text-white/40">Who needs a call, text, or update now.</CardDescription>
            </div>
            <Link href="/contacts" className="text-xs text-orange-300 hover:text-orange-200">
              Open CRM
            </Link>
          </div>
          <div className="space-y-3">
            {(payload?.follow_ups || []).length === 0 ? (
              <EmptyState text="No follow-ups are due yet. Contact next-step dates will surface here." />
            ) : (
              payload?.follow_ups.map((contact) => (
                <Link
                  key={contact.id}
                  href={`/contacts/${contact.id}`}
                  className="block rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 transition hover:border-orange-500/30 hover:bg-white/[0.05]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">{contact.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/35">{stageLabel(contact.stage)}</p>
                      <p className="mt-2 text-sm text-white/60">{contact.next_step_note || "No next-step note recorded."}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">
                        {contact.preferred_channel || "follow up"}
                      </p>
                      <p className="mt-2 text-xs text-white/50">{fmtDate(contact.next_step_due_at || contact.last_contact_at)}</p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>

        <Card className="border-white/[0.08] bg-[#13161f] text-white">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <CardTitle className="text-white">Deals At Risk</CardTitle>
              <CardDescription className="text-white/40">Milestones coming up or unresolved overdue work.</CardDescription>
            </div>
            <Link href="/pipeline" className="text-xs text-orange-300 hover:text-orange-200">
              Open Pipeline
            </Link>
          </div>
          <div className="space-y-3">
            {(payload?.deals_at_risk || []).length === 0 ? (
              <EmptyState text="No deals are currently flagged at risk." />
            ) : (
              payload?.deals_at_risk.map((deal) => (
                <Link
                  key={deal.id}
                  href={`/deals/${deal.id}`}
                  className="block rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 transition hover:border-orange-500/30 hover:bg-white/[0.05]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">{deal.title}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/35">{stageLabel(deal.stage)}</p>
                      <p className="mt-2 text-sm text-white/60">{deal.contact_name || deal.parcel_address || "Deal needs context"}</p>
                    </div>
                    <div className="text-right text-xs text-white/45">
                      <p>{deal.overdue_task_count} overdue task{deal.overdue_task_count === 1 ? "" : "s"}</p>
                      <p className="mt-2">{fmtDate(deal.next_milestone_at)}</p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="border-white/[0.08] bg-[#13161f] text-white">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <CardTitle className="text-white">Re-Engage</CardTitle>
              <CardDescription className="text-white/40">Contacts with 60+ days of silence who need a warm restart.</CardDescription>
            </div>
            <Link href="/contacts" className="text-xs text-orange-300 hover:text-orange-200">
              Open CRM
            </Link>
          </div>
          <div className="space-y-3">
            {(payload?.reengage || []).length === 0 ? (
              <EmptyState text="No dormant sphere contacts are currently flagged." />
            ) : (
              payload?.reengage.map((contact) => (
                <Link
                  key={contact.id}
                  href={`/contacts/${contact.id}`}
                  className="block rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 transition hover:border-orange-500/30 hover:bg-white/[0.05]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">{contact.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/35">{stageLabel(contact.stage)}</p>
                      <p className="mt-2 text-sm text-white/60">{contact.detail}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">
                        {contact.preferred_channel || "re-engage"}
                      </p>
                      <p className="mt-2 text-xs text-white/45">{fmtDate(contact.last_event_at)}</p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>

        <Card className="border-white/[0.08] bg-[#13161f] text-white">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <CardTitle className="text-white">Coming Up</CardTitle>
              <CardDescription className="text-white/40">Birthdays and home anniversaries inside the next two weeks.</CardDescription>
            </div>
            <Link href="/contacts" className="text-xs text-orange-300 hover:text-orange-200">
              Open CRM
            </Link>
          </div>
          <div className="space-y-3">
            {(payload?.coming_up || []).length === 0 ? (
              <EmptyState text="No birthdays or anniversaries are coming up yet." />
            ) : (
              payload?.coming_up.map((contact) => (
                <Link
                  key={`${contact.id}-${contact.occasion}-${contact.occasion_date}`}
                  href={`/contacts/${contact.id}`}
                  className="block rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 transition hover:border-orange-500/30 hover:bg-white/[0.05]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">{contact.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/35">{occasionLabel(contact.occasion)}</p>
                      <p className="mt-2 text-sm text-white/60">{contact.detail}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">
                        {contact.preferred_channel || "check in"}
                      </p>
                      <p className="mt-2 text-xs text-white/45">{fmtDate(contact.occasion_date)}</p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-6 border-white/[0.08] bg-[#13161f] text-white">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <CardTitle className="text-white">Pipeline Snapshot</CardTitle>
            <CardDescription className="text-white/40">Current board distribution across active stages.</CardDescription>
          </div>
          <Link href="/pipeline" className="inline-flex items-center gap-1 text-xs text-orange-300 hover:text-orange-200">
            Open board <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {(payload?.pipeline || []).map((item) => (
            <div key={item.stage} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/35">{stageLabel(item.stage)}</p>
              <p className="mt-2 text-2xl font-bold text-white">{item.count}</p>
            </div>
          ))}
          {!loading && (payload?.pipeline || []).length === 0 ? <EmptyState text="No active deals yet." /> : null}
        </div>
      </Card>
    </SiteShell>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone?: "default" | "warn" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-500/20 bg-red-500/8 text-red-200"
      : tone === "warn"
        ? "border-amber-500/20 bg-amber-500/8 text-amber-100"
        : "border-white/[0.08] bg-[#13161f] text-white";

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.18em] text-white/45">{label}</p>
        <div className="text-white/60">{icon}</div>
      </div>
      <p className="mt-3 text-3xl font-bold">{value}</p>
    </div>
  );
}

function TaskItem({
  task,
  savingTaskId,
  onComplete,
}: {
  task: TaskRow;
  savingTaskId: string | null;
  onComplete: (taskId: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white">{task.title}</p>
          <p className="mt-1 text-sm text-white/55">{task.contact_name || task.deal_title || task.parcel_address || "General task"}</p>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-orange-300">{task.priority} priority</p>
          <p className="mt-1 text-xs text-white/40">{fmtDate(task.due_at)}</p>
        </div>
        <Button
          size="sm"
          className="bg-emerald-500 text-white hover:bg-emerald-400"
          disabled={savingTaskId === task.id}
          onClick={() => onComplete(task.id)}
        >
          {savingTaskId === task.id ? "Saving..." : <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Done</>}
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.08] p-5 text-sm text-white/35">
      {text}
    </div>
  );
}
