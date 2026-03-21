"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, BriefcaseBusiness, Plus } from "lucide-react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";

type DealRow = {
  id: string;
  title: string;
  deal_type: string;
  stage: string;
  priority: string;
  status: string;
  contact_name?: string | null;
  parcel_address?: string | null;
  next_milestone_at?: string | null;
  open_task_count: number;
  overdue_task_count: number;
};

const STAGES = [
  "new_lead",
  "active_buyer",
  "listing_prep",
  "active_listing",
  "under_contract",
  "escrow",
  "closed",
  "dead",
];

function stageLabel(stage: string) {
  return stage.replace(/_/g, " ");
}

export default function PipelinePage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: "",
    deal_type: "seller",
    stage: "new_lead",
    priority: "normal",
    notes: "",
  });

  const load = useCallback(async () => {
    if (!session?.apiToken) return;
    const data = await apiFetch<DealRow[]>("/deals", session.apiToken);
    setDeals(data);
  }, [session?.apiToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createDeal() {
    if (!session?.apiToken || !form.title.trim()) return;
    await apiFetch("/deals", session.apiToken, {
      method: "POST",
      body: JSON.stringify(form),
    });
    setForm({ title: "", deal_type: "seller", stage: "new_lead", priority: "normal", notes: "" });
    setShowCreate(false);
    await load();
  }

  async function updateStage(id: string, stage: string) {
    if (!session?.apiToken) return;
    await apiFetch(`/deals/${id}`, session.apiToken, {
      method: "PUT",
      body: JSON.stringify({ stage }),
    });
    await load();
  }

  const grouped = useMemo(() => {
    return STAGES.map((stage) => ({
      stage,
      items: deals.filter((deal) => deal.stage === stage),
    }));
  }, [deals]);

  if (status !== "authenticated") return null;

  return (
    <SiteShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-400/80">Pipeline</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Buyer, seller, listing, and deal flow in one board.</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/45">
            This is the working scoreboard. Every signal should end here as a deal, a next step, or a deliberate no.
          </p>
        </div>
        <Button className="bg-orange-500 text-white hover:bg-orange-400" onClick={() => setShowCreate((value) => !value)}>
          <Plus className="mr-2 h-4 w-4" />
          New Deal
        </Button>
      </div>

      {showCreate ? (
        <Card className="mb-6 border-white/[0.08] bg-[#13161f] text-white">
          <CardTitle className="text-white">Create Deal</CardTitle>
          <CardDescription className="mt-1 text-white/45">
            Start with the relationship and the next milestone, then let tasks carry the work.
          </CardDescription>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Input
              className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/25 xl:col-span-2"
              placeholder="Deal title"
              value={form.title}
              onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
            />
            <select
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white"
              value={form.deal_type}
              onChange={(e) => setForm((current) => ({ ...current, deal_type: e.target.value }))}
            >
              <option value="seller">Seller</option>
              <option value="buyer">Buyer</option>
              <option value="listing">Listing</option>
              <option value="referral">Referral</option>
            </select>
            <select
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white"
              value={form.stage}
              onChange={(e) => setForm((current) => ({ ...current, stage: e.target.value }))}
            >
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>{stageLabel(stage)}</option>
              ))}
            </select>
            <select
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white"
              value={form.priority}
              onChange={(e) => setForm((current) => ({ ...current, priority: e.target.value }))}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
            <Textarea
              className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/25 md:col-span-2 xl:col-span-4"
              placeholder="What is the next milestone or decision?"
              value={form.notes}
              onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
            />
          </div>
          <div className="mt-4 flex gap-2">
            <Button className="bg-orange-500 text-white hover:bg-orange-400" onClick={createDeal}>Create Deal</Button>
            <Button variant="outline" className="border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.06]" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-4">
        {grouped.map((group) => (
          <Card key={group.stage} className="border-white/[0.08] bg-[#13161f] text-white">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <CardTitle className="text-white">{stageLabel(group.stage)}</CardTitle>
                <CardDescription className="mt-1 text-white/40">{group.items.length} deal{group.items.length === 1 ? "" : "s"}</CardDescription>
              </div>
              <BriefcaseBusiness className="h-4 w-4 text-orange-300" />
            </div>

            <div className="space-y-3">
              {group.items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/[0.08] p-4 text-sm text-white/30">
                  No deals here.
                </div>
              ) : (
                group.items.map((deal) => (
                  <div key={deal.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{deal.title}</p>
                        <p className="mt-1 text-sm text-white/50">{deal.contact_name || deal.parcel_address || "No linked context yet"}</p>
                      </div>
                      <span className="rounded-full border border-white/[0.08] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-orange-300">
                        {deal.priority}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2">
                      <select
                        className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white"
                        value={deal.stage}
                        onChange={(e) => updateStage(deal.id, e.target.value)}
                      >
                        {STAGES.map((stage) => (
                          <option key={stage} value={stage}>{stageLabel(stage)}</option>
                        ))}
                      </select>
                      <p className="text-xs text-white/40">
                        {deal.open_task_count} open task{deal.open_task_count === 1 ? "" : "s"} · {deal.overdue_task_count} overdue
                      </p>
                      <Link href={`/deals/${deal.id}`} className="inline-flex items-center gap-1 text-xs text-orange-300 hover:text-orange-200">
                        Open deal <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        ))}
      </div>
    </SiteShell>
  );
}
