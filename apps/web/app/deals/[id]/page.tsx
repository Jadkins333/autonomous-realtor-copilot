"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, CalendarClock, CheckCircle2 } from "lucide-react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";

type DealDetail = {
  id: string;
  title: string;
  deal_type: string;
  stage: string;
  priority: string;
  status: string;
  contact_name?: string | null;
  parcel_address?: string | null;
  notes?: string | null;
  next_milestone_at?: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at?: string | null;
  created_at: string;
};

type ActivityRow = {
  id: string;
  event_type: string;
  created_at: string;
  metadata_json?: Record<string, unknown>;
};

function fmtDate(value?: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleString();
}

function stageLabel(stage: string) {
  return stage.replace(/_/g, " ");
}

const STAGES = ["new_lead", "active_buyer", "listing_prep", "active_listing", "under_contract", "escrow", "closed", "dead"];

export default function DealDetailPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const params = useParams<{ id: string }>();
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDueAt, setNewTaskDueAt] = useState("");

  const load = useCallback(async () => {
    if (!session?.apiToken || !params.id) return;
    const [dealPayload, taskPayload, activityPayload] = await Promise.all([
      apiFetch<DealDetail>(`/deals/${params.id}`, session.apiToken),
      apiFetch<TaskRow[]>(`/deals/${params.id}/tasks`, session.apiToken),
      apiFetch<ActivityRow[]>(`/deals/${params.id}/activity`, session.apiToken),
    ]);
    setDeal(dealPayload);
    setTasks(taskPayload);
    setActivity(activityPayload);
  }, [params.id, session?.apiToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateDeal(fields: Record<string, unknown>) {
    if (!session?.apiToken || !params.id) return;
    await apiFetch(`/deals/${params.id}`, session.apiToken, {
      method: "PUT",
      body: JSON.stringify(fields),
    });
    await load();
  }

  async function createTask() {
    if (!session?.apiToken || !params.id || !newTaskTitle.trim()) return;
    await apiFetch("/tasks", session.apiToken, {
      method: "POST",
      body: JSON.stringify({
        title: newTaskTitle.trim(),
        deal_id: params.id,
        due_at: newTaskDueAt ? new Date(newTaskDueAt).toISOString() : null,
        priority: "normal",
      }),
    });
    setNewTaskTitle("");
    setNewTaskDueAt("");
    await load();
  }

  async function completeTask(taskId: string) {
    if (!session?.apiToken) return;
    await apiFetch(`/tasks/${taskId}`, session.apiToken, {
      method: "PUT",
      body: JSON.stringify({ status: "completed" }),
    });
    await load();
  }

  if (status !== "authenticated") return null;

  return (
    <SiteShell>
      <div className="mb-6">
        <Link href="/pipeline" className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to pipeline
        </Link>
      </div>

      <Card className="mb-6 border-white/[0.08] bg-[#13161f] text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle className="text-3xl text-white">{deal?.title || "Deal detail"}</CardTitle>
            <CardDescription className="mt-2 text-white/45">
              {deal?.contact_name || "No linked contact"} · {deal?.parcel_address || "No linked property"}
            </CardDescription>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white"
              value={deal?.stage || "new_lead"}
              onChange={(e) => updateDeal({ stage: e.target.value })}
            >
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>{stageLabel(stage)}</option>
              ))}
            </select>
            <select
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white"
              value={deal?.priority || "normal"}
              onChange={(e) => updateDeal({ priority: e.target.value })}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
        <Textarea
          className="mt-4 border-white/10 bg-white/[0.03] text-white placeholder:text-white/25"
          value={deal?.notes || ""}
          placeholder="Deal notes"
          onChange={(e) => setDeal((current) => current ? { ...current, notes: e.target.value } : current)}
          onBlur={() => deal && updateDeal({ notes: deal.notes || "" })}
        />
        <div className="mt-4 flex items-center gap-2 text-sm text-white/45">
          <CalendarClock className="h-4 w-4 text-orange-300" />
          Next milestone: {fmtDate(deal?.next_milestone_at)}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-white/[0.08] bg-[#13161f] text-white">
          <CardTitle className="text-white">Tasks</CardTitle>
          <CardDescription className="mt-1 text-white/45">Work the next step, then the next one.</CardDescription>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Input
              className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/25"
              placeholder="New task"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
            />
            <Input
              type="datetime-local"
              className="border-white/10 bg-white/[0.03] text-white"
              value={newTaskDueAt}
              onChange={(e) => setNewTaskDueAt(e.target.value)}
            />
            <Button className="bg-orange-500 text-white hover:bg-orange-400" onClick={createTask}>Add Task</Button>
          </div>
          <div className="mt-4 space-y-3">
            {tasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[0.08] p-4 text-sm text-white/30">No tasks yet.</div>
            ) : (
              tasks.map((task) => (
                <div key={task.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">{task.title}</p>
                      <p className="mt-1 text-sm text-white/45">{fmtDate(task.due_at)}</p>
                    </div>
                    {task.status !== "completed" ? (
                      <Button size="sm" className="bg-emerald-500 text-white hover:bg-emerald-400" onClick={() => completeTask(task.id)}>
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Done
                      </Button>
                    ) : (
                      <span className="text-xs uppercase tracking-[0.18em] text-emerald-300">Completed</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="border-white/[0.08] bg-[#13161f] text-white">
          <CardTitle className="text-white">Activity</CardTitle>
          <CardDescription className="mt-1 text-white/45">Keep a visible trail of movement.</CardDescription>
          <div className="mt-4 space-y-3">
            {activity.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[0.08] p-4 text-sm text-white/30">No activity yet.</div>
            ) : (
              activity.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <p className="text-sm font-semibold text-white">{item.event_type.replace(/_/g, " ")}</p>
                  <p className="mt-1 text-xs text-white/40">{fmtDate(item.created_at)}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </SiteShell>
  );
}
