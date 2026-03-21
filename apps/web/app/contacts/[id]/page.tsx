'use client'

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";

type ContactDetail = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  stage: string;
  lead_source?: string | null;
  preferred_channel?: string | null;
  priority: string;
  client_summary?: string | null;
  next_step_due_at?: string | null;
  next_step_note?: string | null;
  last_contact_at?: string | null;
};

type DealRow = {
  id: string;
  title: string;
  stage: string;
  priority: string;
};

type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at?: string | null;
};

type ContactEventRow = {
  id: string;
  deal_id?: string | null;
  deal_title?: string | null;
  event_type: "call" | "note" | "outreach" | "task_complete" | "deal_milestone";
  body: string;
  created_at: string;
};

type ContactMessageRow = {
  id: string;
  channel: string;
  direction: string;
  status: string;
  subject?: string | null;
  body_preview: string;
  created_at: string;
  sent_at?: string | null;
};

function fmtDate(value?: string | null) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString();
}

function stageLabel(stage: string) {
  return stage.replace(/_/g, " ");
}

function eventLabel(type: ContactEventRow["event_type"]) {
  if (type === "call") return "Call";
  if (type === "note") return "Note";
  if (type === "outreach") return "Outreach";
  if (type === "task_complete") return "Task Complete";
  return "Deal Milestone";
}

function eventTone(type: ContactEventRow["event_type"]) {
  if (type === "call") return "bg-blue-500/15 text-blue-200 border-blue-500/25";
  if (type === "outreach") return "bg-orange-500/15 text-orange-100 border-orange-500/25";
  if (type === "task_complete") return "bg-emerald-500/15 text-emerald-100 border-emerald-500/25";
  if (type === "deal_milestone") return "bg-purple-500/15 text-purple-100 border-purple-500/25";
  return "bg-white/[0.06] text-white/70 border-white/[0.08]";
}

function messageTone(direction: string) {
  return direction === "inbound"
    ? "bg-sky-500/15 text-sky-100 border-sky-500/25"
    : "bg-orange-500/15 text-orange-100 border-orange-500/25";
}

export default function ContactDetailPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const params = useParams<{ id: string }>();
  const apiToken = (session as { apiToken?: string } | null)?.apiToken;
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [events, setEvents] = useState<ContactEventRow[]>([]);
  const [messages, setMessages] = useState<ContactMessageRow[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [noteDealId, setNoteDealId] = useState<string>("");
  const [savingContact, setSavingContact] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  const load = useCallback(async () => {
    if (!apiToken || !params.id) return;
    const [contactPayload, dealsPayload, tasksPayload, eventsPayload, messagesPayload] = await Promise.all([
      apiFetch<ContactDetail>(`/contacts/${params.id}`, apiToken),
      apiFetch<DealRow[]>(`/contacts/${params.id}/deals`, apiToken),
      apiFetch<TaskRow[]>(`/contacts/${params.id}/tasks`, apiToken),
      apiFetch<ContactEventRow[]>(`/contacts/${params.id}/events`, apiToken),
      apiFetch<ContactMessageRow[]>(`/contacts/${params.id}/messages`, apiToken),
    ]);
    setContact(contactPayload);
    setDeals(dealsPayload);
    setTasks(tasksPayload);
    setEvents(eventsPayload);
    setMessages(messagesPayload);
  }, [apiToken, params.id]);

  const conversationThread = useMemo(
    () =>
      messages
        .filter((message) => message.status !== "draft")
        .sort(
          (left, right) =>
            new Date(right.sent_at || right.created_at).getTime() -
            new Date(left.sent_at || left.created_at).getTime()
        ),
    [messages]
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function saveContact() {
    if (!apiToken || !contact) return;
    setSavingContact(true);
    try {
      await apiFetch(`/contacts/${contact.id}`, apiToken, {
        method: "PUT",
        body: JSON.stringify(contact),
      });
      await load();
    } finally {
      setSavingContact(false);
    }
  }

  async function addCallNote() {
    if (!apiToken || !contact || !noteBody.trim()) return;
    setSavingNote(true);
    try {
      await apiFetch(`/contacts/${contact.id}/events`, apiToken, {
        method: "POST",
        body: JSON.stringify({
          event_type: "call",
          body: noteBody.trim(),
          deal_id: noteDealId || null,
        }),
      });
      setNoteBody("");
      setNoteDealId("");
      await load();
    } finally {
      setSavingNote(false);
    }
  }

  if (status !== "authenticated") return null;

  return (
    <SiteShell>
      <div className="mb-6">
        <Link href="/contacts" className="text-sm text-white/50 hover:text-white">← Back to CRM</Link>
      </div>

      <Card className="mb-6 border-white/[0.08] bg-[#13161f] text-white">
        <CardTitle className="text-3xl text-white">{contact?.name || "Contact profile"}</CardTitle>
        <CardDescription className="mt-2 text-white/45">
          One record for relationship history, active deals, and the next move.
        </CardDescription>
        {contact ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Input className="border-white/10 bg-white/[0.03] text-white" value={contact.name} onChange={(e) => setContact((current) => current ? { ...current, name: e.target.value } : current)} />
            <Input className="border-white/10 bg-white/[0.03] text-white" value={contact.email || ""} onChange={(e) => setContact((current) => current ? { ...current, email: e.target.value } : current)} />
            <Input className="border-white/10 bg-white/[0.03] text-white" value={contact.phone || ""} onChange={(e) => setContact((current) => current ? { ...current, phone: e.target.value } : current)} />
            <select className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white" value={contact.stage} onChange={(e) => setContact((current) => current ? { ...current, stage: e.target.value } : current)}>
              <option value="sphere">Sphere</option>
              <option value="active_buyer">Active buyer</option>
              <option value="listing_prep">Listing prep</option>
              <option value="past_client">Past client</option>
            </select>
            <Input className="border-white/10 bg-white/[0.03] text-white" value={contact.lead_source || ""} onChange={(e) => setContact((current) => current ? { ...current, lead_source: e.target.value } : current)} placeholder="Lead source" />
            <Input className="border-white/10 bg-white/[0.03] text-white" value={contact.preferred_channel || ""} onChange={(e) => setContact((current) => current ? { ...current, preferred_channel: e.target.value } : current)} placeholder="Preferred channel" />
            <select className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white" value={contact.priority} onChange={(e) => setContact((current) => current ? { ...current, priority: e.target.value } : current)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
            <Input className="border-white/10 bg-white/[0.03] text-white" type="datetime-local" value={contact.next_step_due_at ? new Date(contact.next_step_due_at).toISOString().slice(0, 16) : ""} onChange={(e) => setContact((current) => current ? { ...current, next_step_due_at: e.target.value ? new Date(e.target.value).toISOString() : null } : current)} />
            <Input className="border-white/10 bg-white/[0.03] text-white md:col-span-2 xl:col-span-4" value={contact.next_step_note || ""} onChange={(e) => setContact((current) => current ? { ...current, next_step_note: e.target.value } : current)} placeholder="Next step" />
            <Textarea className="border-white/10 bg-white/[0.03] text-white md:col-span-2 xl:col-span-4" value={contact.client_summary || ""} onChange={(e) => setContact((current) => current ? { ...current, client_summary: e.target.value } : current)} placeholder="Relationship summary" />
          </div>
        ) : null}
        <div className="mt-4">
          <Button className="bg-orange-500 text-white hover:bg-orange-400" disabled={savingContact} onClick={saveContact}>
            {savingContact ? "Saving..." : "Save contact"}
          </Button>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="border-white/[0.08] bg-[#13161f] text-white xl:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-white">Relationship Timeline</CardTitle>
              <CardDescription className="mt-2 text-white/45">
                Calls, outreach, task completions, and deal milestones in one running thread.
              </CardDescription>
            </div>
            <p className="text-right text-xs text-white/40">
              Last touch
              <span className="mt-1 block text-sm text-white/70">{fmtDate(contact?.last_contact_at)}</span>
            </p>
          </div>

          <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-sm font-semibold text-white">Log call note</p>
            <p className="mt-1 text-sm text-white/45">Capture what happened so the next conversation starts warm.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <Textarea
                className="min-h-[120px] border-white/10 bg-[#0f131b] text-white"
                placeholder="Left voicemail, discussed motivation, seller wants pricing options by Friday..."
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
              />
              <div className="space-y-3">
                <select
                  className="w-full rounded-xl border border-white/10 bg-[#0f131b] px-3 py-2 text-sm text-white"
                  value={noteDealId}
                  onChange={(e) => setNoteDealId(e.target.value)}
                >
                  <option value="">General relationship note</option>
                  {deals.map((deal) => (
                    <option key={deal.id} value={deal.id}>{deal.title}</option>
                  ))}
                </select>
                <Button
                  className="w-full bg-orange-500 text-white hover:bg-orange-400"
                  disabled={savingNote || !noteBody.trim()}
                  onClick={addCallNote}
                >
                  {savingNote ? "Saving..." : "Add Call Note"}
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {events.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/[0.08] p-5 text-sm text-white/35">
                No timeline activity yet. Start with a call note or send outreach from this contact.
              </p>
            ) : events.map((event) => (
              <div key={event.id} className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${eventTone(event.event_type)}`}>
                    {eventLabel(event.event_type)}
                  </span>
                  {event.deal_title ? (
                    <Link href={`/deals/${event.deal_id}`} className="text-xs text-orange-300 hover:text-orange-200">
                      {event.deal_title}
                    </Link>
                  ) : null}
                  <span className="ml-auto text-xs text-white/35">{fmtDate(event.created_at)}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/75">{event.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 border-t border-white/[0.08] pt-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-white">Conversation Thread</p>
                <p className="mt-1 text-sm text-white/45">
                  Recent sent and received messages so the next reply starts with context, not guesswork.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {conversationThread.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-white/[0.08] p-5 text-sm text-white/35">
                  No sent or received message history yet.
                </p>
              ) : conversationThread.map((message) => (
                <div key={message.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${messageTone(message.direction)}`}
                    >
                      {message.direction} {message.channel}
                    </span>
                    <span className="text-xs text-white/35">{message.status.replace(/_/g, " ")}</span>
                    <span className="ml-auto text-xs text-white/35">{fmtDate(message.sent_at || message.created_at)}</span>
                  </div>
                  {message.subject ? <p className="mt-3 text-sm font-semibold text-white">{message.subject}</p> : null}
                  <p className="mt-2 text-sm leading-6 text-white/70">{message.body_preview}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="border-white/[0.08] bg-[#13161f] text-white">
            <CardTitle className="text-white">Open Deals</CardTitle>
            <div className="mt-4 space-y-3">
              {deals.length === 0 ? (
                <p className="text-sm text-white/35">No deals linked yet.</p>
              ) : deals.map((deal) => (
                <Link key={deal.id} href={`/deals/${deal.id}`} className="block rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 transition hover:border-orange-500/30">
                  <p className="text-sm font-semibold text-white">{deal.title}</p>
                  <p className="mt-1 text-sm text-white/45">{stageLabel(deal.stage)} · {deal.priority}</p>
                </Link>
              ))}
            </div>
          </Card>

          <Card className="border-white/[0.08] bg-[#13161f] text-white">
            <CardTitle className="text-white">Tasks</CardTitle>
            <div className="mt-4 space-y-3">
              {tasks.length === 0 ? (
                <p className="text-sm text-white/35">No tasks linked yet.</p>
              ) : tasks.map((task) => (
                <div key={task.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <p className="text-sm font-semibold text-white">{task.title}</p>
                  <p className="mt-1 text-sm text-white/45">{fmtDate(task.due_at)} · {task.status}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </SiteShell>
  )
}
