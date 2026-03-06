"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { SiteShell } from "@/components/site-shell";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type AgentRow = {
  key: string;
  name: string;
  description: string;
  mission: string;
  sample_prompts?: string[];
};

export default function CopilotAgentsPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [agents, setAgents] = useState<AgentRow[]>([]);

  useEffect(() => {
    if (!session) return;
    apiFetch<AgentRow[]>("/copilot/agents", session?.apiToken)
      .then(setAgents)
      .catch(() => setAgents([]));
  }, [session]);

  if (status !== "authenticated") {
    return null;
  }

  return (
    <SiteShell>
      <Card className="mb-4">
        <CardTitle>Copilot Agents</CardTitle>
        <CardDescription>Deterministic roles available for chat routing and traceable outputs.</CardDescription>
        <div className="mt-2">
          <Link className="text-sm text-accent underline" href="/copilot">
            Back to copilot chat
          </Link>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2" data-testid="agents-grid">
        {agents.map((agent) => (
          <Card key={agent.key} className="p-4" data-testid={`agent-card-${agent.key}`}>
            <CardTitle className="text-base">{agent.name}</CardTitle>
            <CardDescription className="mt-1">{agent.description}</CardDescription>
            <p className="mt-2 text-sm text-muted-foreground">{agent.mission}</p>
            {agent.sample_prompts?.length ? (
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {agent.sample_prompts.map((prompt) => (
                  <p key={prompt}>• {prompt}</p>
                ))}
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </SiteShell>
  );
}
