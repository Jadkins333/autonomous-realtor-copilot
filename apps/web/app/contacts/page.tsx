'use client'

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Users, UserPlus, Mail, Phone, Tag, AlertCircle, Check } from "lucide-react";

import { useRequireAuth } from "../../components/auth-guard";
import { SiteShell } from "../../components/site-shell";
import { apiFetch } from "../../lib/api";

export default function ContactsPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadContacts = useCallback(async () => {
    if (!session) return;
    const data = await apiFetch<any[]>("/contacts", (session as any).apiToken);
    setRows(data);
  }, [session]);

  async function createContact() {
    if (!session || !name.trim()) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError("You are offline. Contact writes are disabled until connection returns.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await apiFetch<any>("/contacts", (session as any).apiToken, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), email: email || null, phone: phone || null, tags_json: [] }),
      });
      setName("");
      setEmail("");
      setPhone("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
      await loadContacts();
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  if (status !== "authenticated") return null;

  return (
    <SiteShell>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-orange-400" />
            Contacts
          </h1>
          <p className="text-white/40 text-sm mt-0.5">
            {rows.length} contact{rows.length !== 1 ? "s" : ""} · Used for outreach targeting
          </p>
        </div>
      </div>

      {/* Add contact form */}
      <div className="rounded-xl border border-white/[0.08] bg-[#13161f] p-5 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-4 h-4 text-white/40" />
          <p className="text-sm font-semibold text-white/70">Add Contact</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-red-500/8 border border-red-500/20">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3 mb-3">
          <div className="relative">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
            <input
              placeholder="Full name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30"
            />
          </div>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30"
            />
          </div>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
            <input
              type="tel"
              placeholder="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={createContact}
            disabled={saving || !name.trim()}
            className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <><span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Saving…</>
            ) : success ? (
              <><Check className="w-3.5 h-3.5" /> Saved!</>
            ) : (
              <><UserPlus className="w-3.5 h-3.5" /> Add Contact</>
            )}
          </button>
          <p className="text-[10px] text-white/25">* Name is required</p>
        </div>
      </div>

      {/* Contact list */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-white/[0.06]">
          <Users className="w-10 h-10 text-white/15 mb-3" />
          <p className="text-white/40 text-sm">No contacts yet</p>
          <p className="text-white/25 text-xs mt-1">Add your first contact above to start outreach targeting</p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.08] bg-[#13161f] overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-4 px-5 py-3 border-b border-white/[0.06]">
            {["Name", "Email", "Phone", "Tags"].map((h) => (
              <p key={h} className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">{h}</p>
            ))}
          </div>
          {/* Rows */}
          <div className="divide-y divide-white/[0.04]">
            {rows.map((row) => (
              <div key={row.id} className="grid grid-cols-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-orange-400">
                      {(row.name || "?")[0].toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-white/80 truncate">{row.name}</span>
                </div>
                <div className="flex items-center">
                  <span className="text-sm text-white/45 truncate">{row.email ?? <span className="text-white/20">—</span>}</span>
                </div>
                <div className="flex items-center">
                  <span className="text-sm text-white/45">{row.phone ?? <span className="text-white/20">—</span>}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(row.tags_json || []).length ? (
                    (row.tags_json as string[]).map((tag) => (
                      <span key={tag} className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-white/40 border border-white/[0.06]">
                        <Tag className="w-2.5 h-2.5" />{tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-white/20 text-xs">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </SiteShell>
  )
}
