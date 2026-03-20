'use client'

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Mail,
  MessageSquare,
  Sparkles,
  Send,
  Edit3,
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  X,
  Clock,
  AlertTriangle,
} from "lucide-react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { apiFetch } from "@/lib/api";
import { summarizeDisclosureStatus } from "@/lib/compliance-ui";
import { summarizeFairHousing } from "@/lib/policy-presenter";

type DraftRow = {
  id: string;
  pack_id?: string | null;
  property_id?: string | null;
  contact_id: string;
  channel: string;
  subject?: string | null;
  body: string;
  status: string;
  approval_state: string;
  compliance_snapshot?: any;
  disclosure_status?: any;
  fair_housing_scan?: any;
  sandbox_indicator?: string | null;
  last_send_attempt?: any;
};

type DraftPackRow = {
  id: string;
  objective: string;
  status: string;
  sandbox: boolean;
  drafts: DraftRow[];
};

export default function OutreachPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [packs, setPacks] = useState<DraftPackRow[]>([]);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    try {
      const [draftRows, packRows] = await Promise.all([
        apiFetch<DraftRow[]>("/outreach/drafts", (session as any).apiToken),
        apiFetch<{ items: DraftPackRow[] }>("/outreach/draft-packs?limit=20", (session as any).apiToken),
      ]);
      setRows(draftRows);
      setPacks(packRows.items || []);
      setSelectedPackId((current) => current || packRows.items?.[0]?.id || null);
    } finally {
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  async function saveDraft(id: string) {
    if (!session) return;
    setLoadingAction(`save-${id}`);
    await apiFetch(`/outreach/drafts/${id}`, (session as any).apiToken, {
      method: "PUT",
      body: JSON.stringify({ subject: editSubject || null, body: editBody }),
    });
    setEditingDraftId(null);
    setLoadingAction(null);
    await load();
  }

  async function approveDraft(id: string) {
    if (!session) return;
    setLoadingAction(`approve-${id}`);
    await apiFetch(`/outreach/drafts/${id}/approve`, (session as any).apiToken, { method: "POST" });
    setLoadingAction(null);
    await load();
  }

  async function approveAndSend(id: string) {
    if (!session) return;
    setLoadingAction(`send-${id}`);
    await apiFetch(`/outreach/${id}/approve_and_send`, (session as any).apiToken, { method: "POST" });
    setLoadingAction(null);
    await load();
  }

  async function rejectDraft(id: string) {
    if (!session) return;
    setLoadingAction(`reject-${id}`);
    await apiFetch(`/outreach/drafts/${id}/reject`, (session as any).apiToken, { method: "POST" });
    setLoadingAction(null);
    await load();
  }

  async function acknowledgeDisclosure(row: DraftRow, blockingDisclosure: any) {
    if (!session) return;
    const payload: any = {
      action: "outreach_approve",
      disclosure_version_id: blockingDisclosure.disclosure_version_id,
      contact_id: row.contact_id,
      property_id: row.property_id,
      source: "web_outreach",
    };
    if (blockingDisclosure.acknowledgement_mode === "checkbox") {
      payload.checkbox_acknowledged = true;
    } else {
      const typed = window.prompt("Type acknowledgement to continue", "I acknowledge this disclosure.");
      if (!typed) return;
      payload.typed_acknowledgement = typed;
    }
    await apiFetch("/disclosures/acknowledge", (session as any).apiToken, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await load();
  }

  const selectedPack = useMemo(() => packs.find((p) => p.id === selectedPackId) || null, [packs, selectedPackId]);
  const pendingCount = (selectedPack?.drafts || []).filter((d) => d.status === "pending_approval").length;

  if (status !== "authenticated") return null;

  return (
    <SiteShell>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Mail className="w-5 h-5 text-orange-400" />
            Outreach
          </h1>
          <p className="text-white/40 text-sm mt-0.5 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-orange-400" />
            Copilot drafts ready for your review · Sandbox mode active
          </p>
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="text-xs px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/50 hover:text-white/80 hover:bg-white/[0.08] flex items-center gap-1.5 transition-all"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Campaign sidebar */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-white/[0.08] bg-[#13161f] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Campaigns</p>
            </div>
            <div className="p-2 space-y-1">
              {packs.map((pack) => {
                const isSelected = selectedPackId === pack.id;
                const pendingDrafts = pack.drafts.filter((d) => d.status === "pending_approval").length;
                return (
                  <button
                    key={pack.id}
                    className={`w-full text-left rounded-lg p-3 transition-all ${
                      isSelected
                        ? "bg-orange-500/12 border border-orange-500/25"
                        : "border border-transparent hover:bg-white/[0.04] hover:border-white/[0.06]"
                    }`}
                    onClick={() => setSelectedPackId(pack.id)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                        pack.sandbox
                          ? "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                          : "bg-green-500/15 text-green-400 border border-green-500/25"
                      }`}>
                        {pack.sandbox ? "Sandbox" : "Live"}
                      </span>
                      {pendingDrafts > 0 && (
                        <span className="text-[10px] font-bold text-orange-400">{pendingDrafts} pending</span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-white/70 line-clamp-2 mt-1">{pack.objective}</p>
                    <p className="text-[10px] text-white/30 mt-0.5 capitalize">{pack.status.replace(/_/g, " ")}</p>
                  </button>
                );
              })}
              {packs.length === 0 && (
                <div className="py-8 text-center">
                  <MessageSquare className="w-8 h-8 text-white/15 mx-auto mb-2" />
                  <p className="text-xs text-white/30">No campaigns yet</p>
                  <p className="text-[10px] text-white/20 mt-1">Use Copilot to generate outreach</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Drafts panel */}
        <div className="lg:col-span-3 space-y-4">
          {selectedPack ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white">Suggested Messages</h2>
                  {pendingCount > 0 && (
                    <p className="text-xs text-orange-400/80 mt-0.5">{pendingCount} awaiting your approval</p>
                  )}
                </div>
              </div>
              {selectedPack.drafts.map((draft) => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  editingDraftId={editingDraftId}
                  editSubject={editSubject}
                  editBody={editBody}
                  loadingAction={loadingAction}
                  setEditingDraftId={setEditingDraftId}
                  setEditSubject={setEditSubject}
                  setEditBody={setEditBody}
                  onSave={() => saveDraft(draft.id)}
                  onApprove={() => approveDraft(draft.id)}
                  onReject={() => rejectDraft(draft.id)}
                  onSend={() => approveAndSend(draft.id)}
                  onAcknowledge={(item: any) => acknowledgeDisclosure(draft, item)}
                />
              ))}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 rounded-xl border border-white/[0.06] border-dashed text-center">
              <MessageSquare className="w-10 h-10 text-white/20 mb-3" />
              <p className="text-white/50 text-sm font-medium">No campaign selected</p>
              <p className="text-white/25 text-xs mt-1">Pick a campaign on the left to review messages</p>
            </div>
          )}
        </div>
      </div>
    </SiteShell>
  )
}

function DraftCard({
  draft, editingDraftId, editSubject, editBody, loadingAction,
  setEditingDraftId, setEditSubject, setEditBody,
  onSave, onApprove, onReject, onSend, onAcknowledge,
}: any) {
  const [traceOpen, setTraceOpen] = useState(false);
  const isEditing = editingDraftId === draft.id;
  const isEmail = draft.channel === "email";
  const ChannelIcon = isEmail ? Mail : MessageSquare;

  const disclosureBlocked = summarizeDisclosureStatus(draft.disclosure_status).blocked;
  const fairHousingFlag = summarizeFairHousing(draft.fair_housing_scan || draft.compliance_snapshot?.fair_housing_scan);
  const fairHousingBlocked = !!fairHousingFlag;
  const complianceBlocked = draft.compliance_snapshot?.allowed === false;
  const isBlocked = disclosureBlocked || fairHousingBlocked || complianceBlocked;

  const statusColor = isBlocked
    ? "from-red-500"
    : draft.status === "sent" || draft.status === "sandbox_staged"
      ? "from-emerald-500"
      : "from-orange-500";

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#13161f] overflow-hidden">
      {/* Top accent strip */}
      <div className={`h-0.5 w-full bg-gradient-to-r ${statusColor} to-transparent`} />

      {/* Card header */}
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isEmail ? "bg-blue-500/10" : "bg-green-500/10"}`}>
            <ChannelIcon className={`w-4 h-4 ${isEmail ? "text-blue-400" : "text-green-400"}`} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{isEmail ? "Email" : "SMS"}</p>
            <p className="text-xs text-white/40">Contact {draft.contact_id.slice(0, 8)}…</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isBlocked && (
            <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-red-500/15 text-red-300 border border-red-500/25">
              <ShieldAlert className="w-3 h-3" /> Action Required
            </span>
          )}
          {!isBlocked && draft.status === "pending_approval" && (
            <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/25">
              <Clock className="w-3 h-3" /> Pending Approval
            </span>
          )}
          {(draft.status === "sent" || draft.status === "sandbox_staged") && (
            <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
              <CheckCircle2 className="w-3 h-3" /> {draft.status === "sent" ? "Sent" : "Staged"}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-5">
        {isEditing ? (
          <div className="space-y-3">
            {isEmail && (
              <input
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                placeholder="Subject line"
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-orange-500/40"
              />
            )}
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white/90 placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-orange-500/40 min-h-[140px] resize-y font-mono"
              placeholder="Message body"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditingDraftId(null)}
                className="text-xs px-3 py-1.5 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-all flex items-center gap-1.5"
              >
                <X className="w-3 h-3" /> Cancel
              </button>
              <button
                onClick={onSave}
                disabled={loadingAction === `save-${draft.id}`}
                className="text-xs px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-white transition-all disabled:opacity-50"
              >
                Save Changes
              </button>
            </div>
          </div>
        ) : (
          <div className="group relative">
            {isEmail && draft.subject && (
              <h4 className="font-semibold text-white mb-2">{draft.subject}</h4>
            )}
            <p className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">{draft.body}</p>
            {draft.status === "pending_approval" && (
              <button
                className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2.5 py-1.5 rounded-lg border border-white/[0.12] bg-white/[0.06] text-white/60 hover:text-white flex items-center gap-1.5"
                onClick={() => {
                  setEditSubject(draft.subject || "");
                  setEditBody(draft.body || "");
                  setEditingDraftId(draft.id);
                }}
              >
                <Edit3 className="w-3 h-3" /> Edit
              </button>
            )}
          </div>
        )}

        {/* Compliance alerts */}
        <div className="mt-4 space-y-2">
          {(draft.disclosure_status?.blocking_disclosures || []).map((item: any) => (
            <div key={item.disclosure_version_id || item.title} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between rounded-lg bg-red-500/8 border border-red-500/20 p-3">
              <div>
                <p className="text-xs font-semibold text-red-300">{item.title}</p>
                <p className="text-xs text-red-400/70 mt-0.5">{item.human_readable_message}</p>
              </div>
              <button
                onClick={() => onAcknowledge(item)}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-400 text-white transition-all flex-shrink-0"
              >
                Acknowledge
              </button>
            </div>
          ))}
          {fairHousingBlocked && (
            <div className="flex items-start gap-2.5 rounded-lg bg-amber-500/8 border border-amber-500/20 p-3">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-300">Fair Housing Alert</p>
                <p className="text-xs text-amber-400/70">{fairHousingFlag}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-white/[0.06] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <button
          onClick={() => setTraceOpen(!traceOpen)}
          className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          {traceOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Delivery trace
        </button>
        {traceOpen && (
          <div className="w-full mt-2 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[10px] text-white/40 font-mono space-y-0.5">
            <p>status: {draft.status}</p>
            <p>approval_state: {draft.approval_state}</p>
            <p>provider_id: {draft.last_send_attempt?.provider_message_id || "none"}</p>
          </div>
        )}

        <div className="flex gap-2">
          {draft.status === "pending_approval" && !isEditing && (
            <>
              <button
                disabled={!!loadingAction}
                onClick={onReject}
                className="text-xs px-3 py-1.5 rounded-lg text-white/40 hover:text-red-300 hover:bg-red-500/8 transition-all disabled:opacity-40"
              >
                Discard
              </button>
              <button
                disabled={!!loadingAction}
                onClick={onApprove}
                className="text-xs px-3 py-1.5 rounded-lg border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.06] transition-all disabled:opacity-40"
              >
                Save for Later
              </button>
              <button
                disabled={!!isBlocked || !!loadingAction}
                onClick={onSend}
                className="text-xs px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-white flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-3 h-3" />
                {draft.sandbox_indicator ? "Stage" : "Send Now"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
