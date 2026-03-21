'use client'

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";

type ContactRow = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  stage: string;
  lead_source?: string | null;
  preferred_channel?: string | null;
  next_step_due_at?: string | null;
  next_step_note?: string | null;
  last_contact_at?: string | null;
  priority: string;
};

function fmtDate(value?: string | null) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString();
}

function stageLabel(stage: string) {
  return stage.replace(/_/g, " ");
}

export default function ContactsPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    stage: "sphere",
    lead_source: "sphere",
    priority: "normal",
    next_step_note: "",
    client_summary: "",
  });

  const load = useCallback(async () => {
    if (!session?.apiToken) return;
    const data = await apiFetch<ContactRow[]>("/contacts", session.apiToken);
    setContacts(data);
  }, [session?.apiToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createContact() {
    if (!session?.apiToken || !form.name.trim()) return;
    await apiFetch("/contacts", session.apiToken, {
      method: "POST",
      body: JSON.stringify({
        ...form,
        name: form.name.trim(),
        email: form.email || null,
        phone: form.phone || null,
        next_step_due_at: new Date().toISOString(),
      }),
    });
    setForm({
      name: "",
      email: "",
      phone: "",
      stage: "sphere",
      lead_source: "sphere",
      priority: "normal",
      next_step_note: "",
      client_summary: "",
    });
    await load();
  }

  if (status !== "authenticated") return null;

  return (
    <SiteShell>
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-400/80">CRM</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Relationship memory is the business.</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/45">
          Contacts now carry stage, source, preferred channel, and the next step so the database has a pulse instead of just a name.
        </p>
      </div>

      <Card className="mb-6 border-white/[0.08] bg-[#13161f] text-white">
        <CardTitle className="text-white">Add Contact</CardTitle>
        <CardDescription className="mt-1 text-white/45">
          Don&apos;t add a name without a stage and a next move.
        </CardDescription>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/25" placeholder="Name" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} />
          <Input className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/25" placeholder="Email" value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} />
          <Input className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/25" placeholder="Phone" value={form.phone} onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))} />
          <select className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white" value={form.stage} onChange={(e) => setForm((current) => ({ ...current, stage: e.target.value }))}>
            <option value="sphere">Sphere</option>
            <option value="active_buyer">Active buyer</option>
            <option value="listing_prep">Listing prep</option>
            <option value="past_client">Past client</option>
            <option value="vendor">Vendor</option>
          </select>
          <Input className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/25" placeholder="Lead source" value={form.lead_source} onChange={(e) => setForm((current) => ({ ...current, lead_source: e.target.value }))} />
          <select className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white" value={form.priority} onChange={(e) => setForm((current) => ({ ...current, priority: e.target.value }))}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
          <Input className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/25 md:col-span-2" placeholder="Next step" value={form.next_step_note} onChange={(e) => setForm((current) => ({ ...current, next_step_note: e.target.value }))} />
          <Textarea className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/25 md:col-span-2 xl:col-span-4" placeholder="Relationship summary" value={form.client_summary} onChange={(e) => setForm((current) => ({ ...current, client_summary: e.target.value }))} />
        </div>
        <div className="mt-4">
          <Button className="bg-orange-500 text-white hover:bg-orange-400" onClick={createContact}>Add contact</Button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {contacts.map((contact) => (
          <Link key={contact.id} href={`/contacts/${contact.id}`}>
            <Card className="h-full border-white/[0.08] bg-[#13161f] text-white transition hover:border-orange-500/30 hover:bg-white/[0.03]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-white">{contact.name}</CardTitle>
                  <CardDescription className="mt-1 text-white/45">{contact.email || contact.phone || "No direct contact info"}</CardDescription>
                </div>
                <span className="rounded-full border border-white/[0.08] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-orange-300">{contact.priority}</span>
              </div>
              <div className="mt-4 space-y-2 text-sm text-white/55">
                <p><span className="text-white/35">Stage:</span> {stageLabel(contact.stage)}</p>
                <p><span className="text-white/35">Source:</span> {contact.lead_source || "unknown"}</p>
                <p><span className="text-white/35">Preferred channel:</span> {contact.preferred_channel || "not set"}</p>
                <p><span className="text-white/35">Next step:</span> {contact.next_step_note || "not captured"}</p>
                <p><span className="text-white/35">Due:</span> {fmtDate(contact.next_step_due_at)}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </SiteShell>
  )
}
