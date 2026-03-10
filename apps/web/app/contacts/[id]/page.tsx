"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Mail,
  Phone,
  UserRound
} from "lucide-react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";

type ContactDetail = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  tags_json: string[];
  notes: string | null;
  created_at: string;
};

type MessageRow = {
  id: string;
  channel: string;
  direction: string;
  status: string;
  subject: string | null;
  body_preview: string;
  created_at: string;
  sent_at: string | null;
};

type EnrollmentRow = {
  id: string;
  sequence_id: string;
  sequence_name: string;
  state: string;
  enrolled_at: string;
  next_step_at: string | null;
};

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusColor(status: string): string {
  if (status === "sent" || status === "delivered")
    return "bg-success/10 text-success";
  if (status === "failed" || status.startsWith("blocked"))
    return "bg-destructive/10 text-destructive";
  if (status === "queued") return "bg-info/10 text-info";
  return "bg-secondary text-secondary-foreground";
}

function enrollStateColor(state: string): string {
  if (state === "active") return "bg-success/10 text-success";
  if (state === "completed") return "bg-secondary text-secondary-foreground";
  if (state === "stopped") return "bg-destructive/10 text-destructive";
  if (state === "paused") return "bg-warning/10 text-warning-foreground";
  return "bg-secondary text-secondary-foreground";
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="section-label">{label}</span>
      {children}
    </label>
  );
}

export default function ContactDetailPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const params = useParams<{ id: string }>();

  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [contactError, setContactError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [savePending, setSavePending] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messagesError, setMessagesError] = useState(false);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(true);
  const [enrollmentsError, setEnrollmentsError] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || !session || !params.id) return;
    const { id } = params;
    const token = session.apiToken;

    setContactError(false);
    setMessagesError(false);
    setEnrollmentsError(false);
    setMessagesLoading(true);
    setEnrollmentsLoading(true);

    apiFetch<ContactDetail>(`/contacts/${id}`, token)
      .then(setContact)
      .catch(() => setContactError(true));

    apiFetch<MessageRow[]>(`/contacts/${id}/messages`, token)
      .then(setMessages)
      .catch(() => setMessagesError(true))
      .finally(() => setMessagesLoading(false));

    apiFetch<EnrollmentRow[]>(`/contacts/${id}/enrollments`, token)
      .then(setEnrollments)
      .catch(() => setEnrollmentsError(true))
      .finally(() => setEnrollmentsLoading(false));
  }, [status, session, params]);

  function startEdit() {
    if (!contact) return;
    setEditName(contact.name);
    setEditEmail(contact.email ?? "");
    setEditPhone(contact.phone ?? "");
    setSaveMsg(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!session || !contact) return;
    setSavePending(true);
    try {
      const updated = await apiFetch<ContactDetail>(
        `/contacts/${contact.id}`,
        session.apiToken,
        {
          method: "PUT",
          body: JSON.stringify({
            name: editName,
            email: editEmail || null,
            phone: editPhone || null
          })
        }
      );
      setContact(updated);
      setEditing(false);
      setSaveMsg("Changes saved.");
    } catch {
      setSaveMsg("Save failed — please try again.");
    } finally {
      setSavePending(false);
    }
  }

  if (status !== "authenticated") return null;

  const title =
    contact?.name ??
    (contactError ? "Contact unavailable" : "Loading contact…");
  const subtitle = contactError
    ? "This contact may not exist or the current account may not have access."
    : contact
      ? [contact.email, contact.phone].filter(Boolean).join(" · ") ||
        "No contact info yet"
      : "Fetching messages, enrollments, and profile details.";

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Contact dossier"
        title={title}
        description={subtitle}
        meta={
          contact ? (
            <>
              <span className="inline-flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-primary" />
                added {relativeTime(contact.created_at)}
              </span>
              {contact.tags_json.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </>
          ) : null
        }
        actions={
          <Link
            href="/contacts"
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-border/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-backgroundAlt"
          >
            <ArrowLeft className="h-4 w-4" />← Contacts
          </Link>
        }
      />

      {contactError ? (
        <Card className="mb-5">
          <p className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Unable to load contact. It may not exist or you may not have access.
          </p>
        </Card>
      ) : !contact ? (
        <Card className="mb-5 space-y-3">
          <div className="skeleton-block h-10 w-56" />
          <div className="skeleton-block h-5 w-72" />
          <div className="grid gap-3 md:grid-cols-3">
            <div className="skeleton-block h-20" />
            <div className="skeleton-block h-20" />
            <div className="skeleton-block h-20" />
          </div>
        </Card>
      ) : (
        <Card className="mb-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <p className="section-label">Profile</p>
                <CardTitle className="mt-2">Contact overview</CardTitle>
                <CardDescription className="mt-2">
                  Core details, recent context, and the fields most likely to
                  change.
                </CardDescription>
              </div>

              {editing ? (
                <div className="grid gap-4 lg:grid-cols-3">
                  <Field label="Name">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Name"
                      data-testid="contact-name-input-edit"
                    />
                  </Field>
                  <Field label="Email">
                    <Input
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="Email"
                    />
                  </Field>
                  <Field label="Phone">
                    <Input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="Phone"
                    />
                  </Field>
                </div>
              ) : (
                <div className="detail-list">
                  <div className="detail-item">
                    <p className="detail-item-label">Name</p>
                    <p className="detail-item-value" data-testid="contact-name">
                      {contact.name}
                    </p>
                  </div>
                  <div className="detail-item">
                    <p className="detail-item-label">Email</p>
                    <p className="detail-item-value flex items-center gap-2">
                      <Mail className="h-4 w-4 text-primary" />
                      {contact.email ?? "Not set"}
                    </p>
                  </div>
                  <div className="detail-item">
                    <p className="detail-item-label">Phone</p>
                    <p className="detail-item-value flex items-center gap-2">
                      <Phone className="h-4 w-4 text-primary" />
                      {contact.phone ?? "Not set"}
                    </p>
                  </div>
                  <div className="detail-item">
                    <p className="detail-item-label">Notes</p>
                    <p className="detail-item-value">
                      {contact.notes ?? "No notes yet"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="w-full max-w-sm space-y-3 rounded-[24px] border border-border/70 bg-card-muted/75 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <UserRound className="h-5 w-5" />
                </div>
                <div>
                  <p className="section-label">Contact status</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {contact.tags_json.length > 0
                      ? `${contact.tags_json.length} tags applied`
                      : "Ready for enrichment"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {contact.tags_json.length > 0 ? (
                  contact.tags_json.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))
                ) : (
                  <Badge>No tags yet</Badge>
                )}
              </div>
              {saveMsg ? (
                <p
                  className={[
                    "rounded-2xl px-4 py-3 text-sm",
                    saveMsg.startsWith("Save failed")
                      ? "border border-destructive/20 bg-destructive/10 text-destructive"
                      : "border border-success/20 bg-success/10 text-success"
                  ].join(" ")}
                >
                  {saveMsg}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {editing ? (
                  <>
                    <Button
                      onClick={saveEdit}
                      disabled={savePending}
                      data-testid="contact-save"
                    >
                      {savePending ? "Saving…" : "Save"}
                    </Button>
                    <Button variant="ghost" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    onClick={startEdit}
                    data-testid="edit-btn"
                  >
                    Edit
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr),minmax(0,0.9fr)]">
        <Card>
          <div className="section-heading">
            <div className="section-heading-copy">
              <p className="section-label">Conversation timeline</p>
              <CardTitle className="text-base">Outreach History</CardTitle>
              <CardDescription>
                Messages sent to or received from this contact.
              </CardDescription>
            </div>
            <Badge variant="outline">{messages.length} messages</Badge>
          </div>

          {messagesLoading ? (
            <div className="mt-5 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton-block h-12" />
              ))}
            </div>
          ) : messagesError ? (
            <p className="mt-5 rounded-2xl border border-border/70 bg-card-muted/75 px-4 py-3 text-sm text-muted-foreground">
              Unable to load message history.
            </p>
          ) : messages.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="No messages yet"
                description="Once outreach starts, status chips, previews, and send timing will appear here."
                className="border-none bg-card-muted/65 shadow-none"
              />
              <span className="sr-only" data-testid="no-messages">
                No messages yet.
              </span>
            </div>
          ) : (
            <div className="table-shell mt-5 overflow-x-auto">
              <Table data-testid="messages-table">
                <thead>
                  <tr>
                    <Th>Channel</Th>
                    <Th>Status</Th>
                    <Th>Subject / Preview</Th>
                    <Th>Sent</Th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((msg) => (
                    <tr key={msg.id} data-testid={`message-row-${msg.id}`}>
                      <Td>
                        <Badge variant="outline" className="text-xs capitalize">
                          {msg.channel}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge
                          className={[
                            "text-xs capitalize",
                            statusColor(msg.status)
                          ].join(" ")}
                        >
                          {msg.status}
                        </Badge>
                      </Td>
                      <Td className="max-w-[320px]">
                        {msg.subject ? (
                          <p className="truncate font-semibold">
                            {msg.subject}
                          </p>
                        ) : null}
                        <p className="truncate text-xs text-muted-foreground">
                          {msg.body_preview}
                        </p>
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-muted-foreground">
                        {relativeTime(msg.sent_at ?? msg.created_at)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card>

        <Card>
          <div className="section-heading">
            <div className="section-heading-copy">
              <p className="section-label">Automation context</p>
              <CardTitle className="text-base">Sequence Enrollments</CardTitle>
              <CardDescription>
                Automated drip campaigns this contact is part of.
              </CardDescription>
            </div>
            <Badge variant="outline">{enrollments.length} enrollments</Badge>
          </div>

          {enrollmentsLoading ? (
            <div className="mt-5 space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="skeleton-block h-16" />
              ))}
            </div>
          ) : enrollmentsError ? (
            <p className="mt-5 rounded-2xl border border-border/70 bg-card-muted/75 px-4 py-3 text-sm text-muted-foreground">
              Unable to load enrollment history.
            </p>
          ) : enrollments.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="Not enrolled in any sequences"
                description={
                  <>
                    Visit{" "}
                    <Link
                      href="/sequences"
                      className="font-semibold text-primary hover:text-primary/80"
                    >
                      Sequences
                    </Link>{" "}
                    when you are ready to attach this contact to a nurture flow.
                  </>
                }
                className="border-none bg-card-muted/65 shadow-none"
              />
              <span className="sr-only" data-testid="no-enrollments">
                Not enrolled in any sequences.
              </span>
            </div>
          ) : (
            <ul className="mt-5 space-y-3" data-testid="enrollments-list">
              {enrollments.map((enr) => (
                <li
                  key={enr.id}
                  data-testid={`enrollment-row-${enr.id}`}
                  className="rounded-[24px] border border-border/70 bg-card-muted/70 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">
                        {enr.sequence_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Enrolled {relativeTime(enr.enrolled_at)}
                        {enr.next_step_at
                          ? ` · next step ${relativeTime(enr.next_step_at)}`
                          : ""}
                      </p>
                    </div>
                    <Badge
                      className={[
                        "text-xs capitalize",
                        enrollStateColor(enr.state)
                      ].join(" ")}
                    >
                      {enr.state}
                    </Badge>
                  </div>
                  <Link
                    href="/sequences"
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80"
                  >
                    Review sequence options
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </SiteShell>
  );
}
