"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Sparkles, UserPlus2 } from "lucide-react";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch } from "@/lib/api";

type SequenceStep = {
  id: string;
  step_order: number;
  delay_minutes: number;
  channel: string;
  template_subject?: string | null;
  template_body: string;
  stop_on_reply: boolean;
};

type Sequence = {
  id: string;
  key: string;
  name: string;
  description: string;
  is_enabled: boolean;
  sandbox_only: boolean;
  steps: SequenceStep[];
};

type ContactOption = {
  id: string;
  name: string;
  email?: string | null;
};

function formatDelay(minutes: number): string {
  if (minutes === 0) return "immediately";
  if (minutes < 60) return `after ${minutes}m`;
  const h = Math.floor(minutes / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `after ${d}d`;
  return `after ${h}h`;
}

function channelLabel(channel: string): string {
  return channel === "sms"
    ? "SMS"
    : channel.charAt(0).toUpperCase() + channel.slice(1);
}

export default function SequencesPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();

  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [selectedContact, setSelectedContact] = useState<string>("");
  const [enrollPending, setEnrollPending] = useState(false);
  const [enrollResult, setEnrollResult] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const data = await apiFetch<Sequence[]>("/sequences", session.apiToken);
      setSequences(data);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [status, load]);

  async function openEnroll(seqId: string) {
    setEnrollingId(seqId);
    setSelectedContact("");
    setEnrollResult((prev) => ({ ...prev, [seqId]: "" }));
    if (!contactsLoaded && session) {
      const data = await apiFetch<ContactOption[]>(
        "/contacts",
        session.apiToken
      );
      setContacts(data);
      setContactsLoaded(true);
    }
  }

  function cancelEnroll() {
    setEnrollingId(null);
    setSelectedContact("");
  }

  async function submitEnroll(seqId: string) {
    if (!session || !selectedContact) return;
    setEnrollPending(true);
    try {
      await apiFetch(
        `/sequences/${seqId}/enroll/${selectedContact}`,
        session.apiToken,
        {
          method: "POST"
        }
      );
      setEnrollResult((prev) => ({
        ...prev,
        [seqId]: "✓ Enrolled successfully"
      }));
      setEnrollingId(null);
      setSelectedContact("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Enrollment failed";
      setEnrollResult((prev) => ({ ...prev, [seqId]: `Error: ${msg}` }));
      setEnrollingId(null);
    } finally {
      setEnrollPending(false);
    }
  }

  function toggleExpand(seqId: string) {
    setExpanded((prev) => ({ ...prev, [seqId]: !prev[seqId] }));
  }

  const enabledCount = useMemo(
    () => sequences.filter((sequence) => sequence.is_enabled).length,
    [sequences]
  );
  const sandboxCount = useMemo(
    () => sequences.filter((sequence) => sequence.sandbox_only).length,
    [sequences]
  );

  if (status !== "authenticated") return null;

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Nurture programs"
        title="Sequences"
        description="Timed outreach flows with clearer hierarchy, smoother expansion, and more confident enrollment feedback."
        meta={
          <>
            <span>
              {sequences.length} sequence{sequences.length === 1 ? "" : "s"}
            </span>
            <Badge className="bg-success/10 text-success">
              {enabledCount} enabled
            </Badge>
            <Badge className="bg-accent/10 text-accent-foreground">
              {sandboxCount} sandbox
            </Badge>
          </>
        }
        actions={
          <Link
            href="/contacts"
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-border/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-backgroundAlt"
          >
            Open contacts
            <UserPlus2 className="h-4 w-4" />
          </Link>
        }
      />

      {loading ? (
        <div className="space-y-4" data-testid="sequences-loading">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton-block h-36 rounded-[28px]" />
          ))}
        </div>
      ) : sequences.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="h-5 w-5" />}
          title="No sequences configured"
          description="Sequences are created through the admin CLI. Once they exist, this page becomes the calm control surface for review and enrollment."
          action={
            <span data-testid="empty-sequences" className="sr-only">
              No sequences configured
            </span>
          }
          className="shadow-panel"
        />
      ) : (
        <div className="space-y-4">
          {sequences.map((seq) => {
            const isOpen = expanded[seq.id] ?? false;
            const result = enrollResult[seq.id];
            return (
              <Card
                key={seq.id}
                data-testid={`sequence-card-${seq.key}`}
                className="animate-fade-up transition-all duration-200 hover:-translate-y-0.5 hover:shadow-panel"
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-[1.25rem]">
                        {seq.name}
                      </CardTitle>
                      {!seq.is_enabled ? <Badge>Disabled</Badge> : null}
                      {seq.sandbox_only ? (
                        <Badge className="bg-accent/10 text-accent-foreground">
                          Sandbox
                        </Badge>
                      ) : null}
                      <Badge variant="outline" className="text-xs">
                        {seq.steps.length}{" "}
                        {seq.steps.length === 1 ? "step" : "steps"}
                      </Badge>
                    </div>
                    <CardDescription>{seq.description}</CardDescription>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {seq.steps.map((step) => (
                        <span
                          key={step.id}
                          className="rounded-full border border-border/70 bg-card-muted/70 px-3 py-1.5"
                        >
                          {step.step_order}. {channelLabel(step.channel)}{" "}
                          {formatDelay(step.delay_minutes)}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2"
                      onClick={() => toggleExpand(seq.id)}
                      aria-expanded={isOpen}
                      aria-controls={`sequence-panel-${seq.id}`}
                    >
                      {isOpen ? (
                        <>
                          Hide steps
                          <ChevronUp className="h-4 w-4" />
                        </>
                      ) : (
                        <>
                          Show steps
                          <ChevronDown className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                    {enrollingId !== seq.id ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEnroll(seq.id)}
                        data-testid={`enroll-btn-${seq.id}`}
                        disabled={!seq.is_enabled}
                      >
                        Enroll Contact
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div
                  data-testid={`sequence-steps-${seq.id}`}
                  id={`sequence-panel-${seq.id}`}
                  className={[
                    "overflow-hidden transition-all duration-300 ease-out",
                    isOpen
                      ? "mt-5 max-h-[600px] opacity-100"
                      : "max-h-0 opacity-0"
                  ].join(" ")}
                  aria-hidden={!isOpen}
                >
                  <ol className="space-y-3 border-l border-border/80 pl-5">
                    {seq.steps.map((step) => (
                      <li
                        key={step.id}
                        className="relative rounded-[22px] border border-border/70 bg-card-muted/75 p-4"
                      >
                        <span className="absolute -left-[1.45rem] top-6 h-3 w-3 rounded-full border border-white bg-primary shadow-sm" />
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-xs capitalize"
                          >
                            {channelLabel(step.channel)}
                          </Badge>
                          <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            {formatDelay(step.delay_minutes)}
                          </span>
                          {step.stop_on_reply ? (
                            <span className="text-xs text-muted-foreground">
                              Stops on reply
                            </span>
                          ) : null}
                        </div>
                        {step.template_subject ? (
                          <p className="mt-3 font-semibold text-foreground">
                            {step.template_subject}
                          </p>
                        ) : null}
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                          {step.template_body}
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>

                {enrollingId === seq.id ? (
                  <div
                    className="app-panel-muted mt-5 p-4"
                    data-testid={`enroll-confirm-${seq.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground">
                          Choose a contact to enroll
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Enrollment opens the sequence and starts the timed
                          outreach cadence.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
                      <select
                        className="h-11 flex-1 rounded-2xl border border-input/80 bg-white/90 px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] outline-none transition-all duration-200 hover:border-border focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
                        value={selectedContact}
                        onChange={(e) => setSelectedContact(e.target.value)}
                        data-testid={`enroll-contact-select-${seq.id}`}
                      >
                        <option value="">Select contact</option>
                        {contacts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.email ? ` (${c.email})` : ""}
                          </option>
                        ))}
                      </select>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => submitEnroll(seq.id)}
                          disabled={!selectedContact || enrollPending}
                        >
                          {enrollPending ? "Enrolling…" : "Confirm Enroll"}
                        </Button>
                        <Button variant="ghost" onClick={cancelEnroll}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {result ? (
                  <p
                    className={[
                      "mt-4 rounded-2xl px-4 py-3 text-sm",
                      result.startsWith("Error")
                        ? "border border-destructive/20 bg-destructive/10 text-destructive"
                        : "border border-success/20 bg-success/10 text-success"
                    ].join(" ")}
                    data-testid={`enroll-result-${seq.id}`}
                    aria-live="polite"
                  >
                    {result}
                  </p>
                ) : null}

                {seq.sandbox_only ? (
                  <p
                    className="mt-4 text-xs text-muted-foreground"
                    data-testid={`sequence-note-${seq.id}`}
                  >
                    Sandbox-only templates still depend on server send mode and
                    provider availability before anything can leave the system.
                  </p>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </SiteShell>
  );
}
