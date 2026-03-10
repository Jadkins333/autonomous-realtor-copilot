"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, PlusCircle, UsersRound } from "lucide-react";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";

type ContactRow = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  tags_json?: string[];
};

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

export default function ContactsPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [rows, setRows] = useState([] as ContactRow[]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadContacts = useCallback(async () => {
    if (!session) return;
    const data = await apiFetch<ContactRow[]>("/contacts", session.apiToken);
    setRows(data);
  }, [session]);

  async function createContact() {
    if (!session) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError(
        "You are offline. Contact writes are disabled until connection returns."
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch<ContactRow>("/contacts", session.apiToken, {
        method: "POST",
        body: JSON.stringify({
          name,
          email: email || null,
          phone: phone || null,
          tags_json: []
        })
      });
      setName("");
      setEmail("");
      setPhone("");
      await loadContacts();
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  if (status !== "authenticated") {
    return null;
  }

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Relationship memory"
        title="Contacts"
        description="Create and revisit contact records with more structure, calmer hierarchy, and faster access to the detail view."
        meta={
          <span>
            {rows.length} active contact{rows.length === 1 ? "" : "s"}
          </span>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[360px,minmax(0,1fr)]">
        <Card className="h-fit" data-testid="create-contact-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-label">New relationship</p>
              <CardTitle className="mt-2">Create Contact</CardTitle>
              <CardDescription className="mt-2">
                Capture the essentials now and deepen the dossier later from the
                detail page.
              </CardDescription>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <PlusCircle className="h-5 w-5" />
            </div>
          </div>

          {error ? (
            <p
              className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              data-testid="contact-error"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-5 space-y-4">
            <Field label="Name">
              <Input
                placeholder="Enter contact name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="contact-name-input"
              />
            </Field>
            <Field label="Email">
              <Input
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="contact-email-input"
              />
            </Field>
            <Field label="Phone">
              <Input
                placeholder="+1 614 555 0100"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                data-testid="contact-phone-input"
              />
            </Field>
            <Button
              onClick={createContact}
              data-testid="add-contact-btn"
              className="w-full"
              disabled={!name.trim() || submitting}
            >
              {submitting ? "Saving contact…" : "Add Contact"}
            </Button>
          </div>
        </Card>

        <Card data-testid="contacts-table-card">
          <div className="section-heading">
            <div className="section-heading-copy">
              <p className="section-label">Directory</p>
              <CardTitle>Contact list</CardTitle>
              <CardDescription>
                Names link directly into history, enrollments, and edit
                controls.
              </CardDescription>
            </div>
            <div className="soft-note inline-flex items-center gap-2">
              <UsersRound className="h-4 w-4 text-primary" />
              <span>{rows.length} records</span>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="No contacts yet"
                description="Start by creating a contact on this page. Their message history and sequence enrollments will appear automatically once activity begins."
              />
            </div>
          ) : (
            <div className="table-shell mt-5 overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Email</Th>
                    <Th>Phone</Th>
                    <Th>Tags</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} data-testid={`contact-row-${row.id}`}>
                      <Td>
                        <Link
                          href={`/contacts/${row.id}`}
                          className="inline-flex items-center gap-2 font-semibold text-primary hover:text-primary/80"
                        >
                          {row.name}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Td>
                      <Td>{row.email ?? "—"}</Td>
                      <Td>{row.phone ?? "—"}</Td>
                      <Td>{(row.tags_json || []).join(", ") || "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card>
      </div>
    </SiteShell>
  );
}
