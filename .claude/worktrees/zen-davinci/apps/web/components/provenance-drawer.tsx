"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export function ProvenanceDrawer({
  formula,
  provenance,
  inputs
}: {
  formula: string;
  provenance: unknown;
  inputs: unknown;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <Button variant="outline" onClick={() => setOpen(true)}>
        View Provenance
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div
            className="ml-auto h-full w-full max-w-2xl overflow-auto rounded-2xl border bg-card p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-heading text-xl">Truth Layer Provenance</h3>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
            <section className="mb-4">
              <h4 className="mb-1 font-semibold">Formula</h4>
              <pre className="overflow-auto rounded-xl bg-muted p-3 text-xs">{formula}</pre>
            </section>
            <section className="mb-4">
              <h4 className="mb-1 font-semibold">Inputs</h4>
              <pre className="overflow-auto rounded-xl bg-muted p-3 text-xs">
                {JSON.stringify(inputs, null, 2)}
              </pre>
            </section>
            <section>
              <h4 className="mb-1 font-semibold">Provenance</h4>
              <pre className="overflow-auto rounded-xl bg-muted p-3 text-xs">
                {JSON.stringify(provenance, null, 2)}
              </pre>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
