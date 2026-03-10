"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { ProvenanceDrawer } from "@/components/provenance-drawer";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { COPILOT_COMMANDS } from "@/lib/commands";

type CopilotResponse = {
  status: string;
  text: string;
  data?: unknown;
  trace?: unknown;
  missing_inputs?: string[];
  ai_narration?: string | null;
};

type ChatItem = {
  role: "user" | "assistant";
  text: string;
  payload?: CopilotResponse;
};

type AgentRow = {
  key: string;
  name: string;
  description: string;
};

function llmProviderLabel(trace: unknown): string | null {
  const provider = (trace as Record<string, unknown> | undefined)?.llm_provider
  return typeof provider === "string" && provider ? provider : null
}

export default function CopilotPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [query, setQuery] = useState(COPILOT_COMMANDS[0]);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(false);

  const isOffline = typeof navigator !== "undefined" ? !navigator.onLine : false;

  async function submitCommand() {
    if (!session || !query.trim() || isOffline) return;
    const message = query.trim();
    setMessages((prev) => [...prev, { role: "user", text: message }]);
    setLoading(true);
    try {
      const result = await apiFetch<CopilotResponse>("/copilot/chat", session?.apiToken, {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      setMessages((prev) => [...prev, { role: "assistant", text: result.text, payload: result }]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Copilot request failed";
      setMessages((prev) => [...prev, { role: "assistant", text: detail }]);
    } finally {
      setLoading(false);
    }
  }

  const latestAssistantPayload = useMemo(() => {
    const assistant = [...messages].reverse().find((item) => item.role === "assistant" && item.payload);
    return assistant?.payload;
  }, [messages]);

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
        <CardTitle>Copilot</CardTitle>
        <CardDescription className="mt-1">
          Deterministic routing stays primary. When a local model is available, Copilot adds a secondary generated explanation.
        </CardDescription>
        <div className="mt-2">
          <Link className="text-sm text-accent underline" href="/copilot/agents">
            View all copilot agents
          </Link>
        </div>
        <div className="mt-4 flex flex-col gap-2 md:flex-row">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            data-testid="copilot-input"
          />
          <Button
            disabled={loading || isOffline}
            onClick={submitCommand}
            data-testid="copilot-run-btn"
          >
            {loading ? "Running..." : isOffline ? "Offline" : "Run"}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {COPILOT_COMMANDS.map((cmd) => (
            <Button
              key={cmd}
              variant="outline"
              onClick={() => setQuery(cmd)}
              data-testid={`preset-cmd-${cmd.slice(0, 8).replace(/\s+/g, "-")}`}
            >
              {cmd}
            </Button>
          ))}
        </div>
      </Card>

      <Card data-testid="chat-card">
        <CardTitle className="mb-3">Chat</CardTitle>
        <div className="space-y-3" data-testid="chat-messages">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="chat-empty">
              Run a command to start.
            </p>
          ) : null}
          {messages.map((item, index) => (
            <div
              key={`${item.role}-${index}`}
              className={item.role === "user" ? "ml-auto max-w-[85%]" : "mr-auto max-w-[90%]"}
              data-testid={`chat-msg-${item.role}-${index}`}
            >
              <div
                className={
                  item.role === "user"
                    ? "rounded-xl bg-muted p-3 text-sm"
                    : "rounded-xl border bg-card p-3 text-sm"
                }
              >
                <div className="space-y-2">
                  {item.role === "assistant" ? (
                    <div className="flex items-center gap-2">
                      <Badge className="text-xs">Deterministic result</Badge>
                    </div>
                  ) : null}
                  <p>{item.text}</p>
                </div>
                {item.payload?.ai_narration ? (
                  <div
                    className="mt-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-sm"
                    data-testid="ai-narration"
                  >
                    <div className="mb-1 flex items-center gap-1">
                      <Badge className="text-xs">AI-assisted narration</Badge>
                      {llmProviderLabel(item.payload?.trace) ? (
                        <span className="text-xs text-muted-foreground">
                          {llmProviderLabel(item.payload?.trace)}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground">
                      Generated explanation layered on top of the computed result above.
                    </p>
                    <p className="mt-2 text-muted-foreground">{item.payload.ai_narration}</p>
                  </div>
                ) : null}
                {(item.payload?.trace as Record<string, unknown> | undefined)?.selected_agent ? (
                  <div className="mt-2" data-testid="agent-badge">
                    <Badge>
                      agent:{" "}
                      {String(
                        (item.payload!.trace as Record<string, unknown>).selected_agent,
                      )}
                    </Badge>
                  </div>
                ) : null}
                {item.payload?.trace ? (
                  <details className="mt-2 text-xs" data-testid="trace-details">
                    <summary className="cursor-pointer text-muted-foreground">Trace</summary>
                    <pre className="mt-2 overflow-auto rounded-xl bg-muted p-2">
                      {JSON.stringify(item.payload.trace, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {latestAssistantPayload?.data ? (
          <div className="mt-3">
            <ProvenanceDrawer
              formula={
                (latestAssistantPayload.data as Record<string, unknown>)
                  ?.formula_markdown as string || "No formula"
              }
              inputs={
                ((latestAssistantPayload.data as Record<string, unknown>)
                  ?.inputs as Record<string, unknown>) || {
                  missing_inputs: latestAssistantPayload?.missing_inputs || [],
                }
              }
              provenance={{
                metric_provenance:
                  ((latestAssistantPayload.data as Record<string, unknown>)
                    ?.provenance as Record<string, unknown>) || {},
                trace:
                  (latestAssistantPayload?.trace as Record<string, unknown>) || {},
              }}
            />
          </div>
        ) : null}
      </Card>

      <Card className="mt-4" data-testid="agents-sidebar">
        <CardTitle className="mb-2">Available Agents</CardTitle>
        <ul className="space-y-2 text-sm">
          {agents.map((agent) => (
            <li
              key={agent.key}
              className="rounded-lg border bg-card p-2"
              data-testid={`sidebar-agent-${agent.key}`}
            >
              <p className="font-medium">{agent.name}</p>
              <p className="text-muted-foreground">{agent.description}</p>
            </li>
          ))}
        </ul>
      </Card>
    </SiteShell>
  );
}
