"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bot, Command, Cpu, Sparkles } from "lucide-react";
import { useSession } from "next-auth/react";

import { useRequireAuth } from "@/components/auth-guard";
import { ProvenanceDrawer } from "@/components/provenance-drawer";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
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

type LlmStatus = {
  llm_enabled: boolean;
  provider: string | null;
  model: string | null;
  available: boolean;
  provider_label: string | null;
};

function llmProviderLabel(trace: unknown): string | null {
  const provider = (trace as Record<string, unknown> | undefined)?.llm_provider;
  return typeof provider === "string" && provider ? provider : null;
}

function llmStateLabel(llmStatus: LlmStatus | null): string {
  if (!llmStatus?.llm_enabled) return "Disabled";
  return llmStatus.available ? "Available" : "Unavailable";
}

function llmStateVariant(
  llmStatus: LlmStatus | null
): "success" | "warning" | "outline" {
  if (!llmStatus?.llm_enabled) return "outline";
  return llmStatus.available ? "success" : "warning";
}

export default function CopilotPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [query, setQuery] = useState(COPILOT_COMMANDS[0]);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [llmStatus, setLlmStatus] = useState<LlmStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const isOffline = typeof navigator !== "undefined" ? !navigator.onLine : false;

  async function submitCommand() {
    if (!session || !query.trim() || isOffline) return;
    const message = query.trim();
    setMessages((prev) => [...prev, { role: "user", text: message }]);
    setLoading(true);
    try {
      const result = await apiFetch<CopilotResponse>(
        "/copilot/chat",
        session.apiToken,
        {
          method: "POST",
          body: JSON.stringify({ message }),
        }
      );
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: result.text, payload: result },
      ]);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Copilot request failed";
      setMessages((prev) => [...prev, { role: "assistant", text: detail }]);
    } finally {
      setLoading(false);
    }
  }

  const latestAssistantPayload = useMemo(() => {
    const assistant = [...messages]
      .reverse()
      .find((item) => item.role === "assistant" && item.payload);
    return assistant?.payload;
  }, [messages]);

  useEffect(() => {
    if (!session) return;
    let mounted = true;

    Promise.allSettled([
      apiFetch<AgentRow[]>("/copilot/agents", session.apiToken),
      apiFetch<LlmStatus>("/copilot/llm-status", session.apiToken),
    ]).then(([agentsResult, llmResult]) => {
      if (!mounted) return;

      if (agentsResult.status === "fulfilled") {
        setAgents(agentsResult.value);
      } else {
        setAgents([]);
      }

      if (llmResult.status === "fulfilled") {
        setLlmStatus(llmResult.value);
      } else {
        setLlmStatus({
          llm_enabled: false,
          provider: null,
          model: null,
          available: false,
          provider_label: null,
        });
      }
    });

    return () => {
      mounted = false;
    };
  }, [session]);

  if (status !== "authenticated") {
    return null;
  }

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Hybrid operator"
        title="Copilot"
        description="Deterministic routing stays primary. AI-assisted narration only appears when a local model is actually reachable, and it never replaces the computed result."
        meta={
          <>
            <Badge variant={llmStateVariant(llmStatus)}>
              Local LLM {llmStateLabel(llmStatus)}
            </Badge>
            <span>
              {llmStatus?.provider_label ??
                llmStatus?.provider ??
                "Deterministic-only mode"}
            </span>
          </>
        }
        actions={
          <Link
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-border/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-backgroundAlt"
            href="/copilot/agents"
          >
            View agents
            <Sparkles className="h-4 w-4" />
          </Link>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr),minmax(0,0.9fr)]">
        <Card>
          <div className="section-heading">
            <div className="section-heading-copy">
              <p className="section-label">Command deck</p>
              <CardTitle>Run deterministic workflows</CardTitle>
              <CardDescription>
                Presets route through the deterministic engine first. AI
                narration remains optional and clearly secondary.
              </CardDescription>
            </div>
          </div>

          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submitCommand();
            }}
          >
            <label className="space-y-2">
              <span className="section-label">Command</span>
              <div className="flex flex-col gap-3 md:flex-row">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  data-testid="copilot-input"
                />
                <Button
                  disabled={loading || isOffline}
                  data-testid="copilot-run-btn"
                  type="submit"
                >
                  {loading ? "Running..." : isOffline ? "Offline" : "Run"}
                </Button>
              </div>
            </label>

            <div className="app-panel-muted px-4 py-4" data-testid="llm-status-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="section-label">Local model status</p>
                  <p className="mt-2 font-semibold text-foreground">
                    {llmStatus?.provider_label ??
                      llmStatus?.model ??
                      "Deterministic-only mode"}
                  </p>
                </div>
                <Badge variant={llmStateVariant(llmStatus)}>
                  {llmStateLabel(llmStatus)}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {!llmStatus?.llm_enabled
                  ? "AI narration is disabled. Copilot still routes and returns deterministic results normally."
                  : llmStatus.available
                    ? "AI-assisted narration is ready for this workspace. Deterministic text remains the authoritative layer."
                    : "The configured local model is unavailable right now. Copilot will continue in deterministic-only mode until it comes back online."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {COPILOT_COMMANDS.map((cmd) => (
                <Button
                  key={cmd}
                  variant="outline"
                  onClick={() => setQuery(cmd)}
                  data-testid={`preset-cmd-${cmd
                    .slice(0, 8)
                    .replace(/\s+/g, "-")}`}
                  type="button"
                >
                  <Command className="h-4 w-4" />
                  {cmd}
                </Button>
              ))}
            </div>
          </form>
        </Card>

        <Card data-testid="agents-sidebar">
          <div className="section-heading">
            <div className="section-heading-copy">
              <p className="section-label">Agent roster</p>
              <CardTitle>Available agents</CardTitle>
              <CardDescription>
                These agents own routing and tool execution. LLM narration does
                not replace their selected output.
              </CardDescription>
            </div>
            <Badge variant="outline">{agents.length} listed</Badge>
          </div>

          {agents.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                icon={<Cpu className="h-5 w-5" />}
                title="No agents returned"
                description="The agents registry did not return any rows. Deterministic copilot commands may still fail until the backend registry is reachable again."
              />
            </div>
          ) : (
            <ul className="mt-5 space-y-3 text-sm">
              {agents.map((agent) => (
                <li
                  key={agent.key}
                  className="app-panel-muted px-4 py-4"
                  data-testid={`sidebar-agent-${agent.key}`}
                >
                  <p className="font-semibold text-foreground">{agent.name}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {agent.description}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-5" data-testid="chat-card">
        <div className="section-heading">
          <div className="section-heading-copy">
            <p className="section-label">Conversation</p>
            <CardTitle>Chat</CardTitle>
            <CardDescription>
              User prompts, deterministic responses, and optional AI narration
              stay visually separated so authority remains obvious.
            </CardDescription>
          </div>
        </div>

        <div
          className="mt-5 space-y-3"
          data-testid="chat-messages"
          aria-live="polite"
          aria-busy={loading}
        >
          {messages.length === 0 ? (
            <EmptyState
              icon={<Bot className="h-5 w-5" />}
              title="Run a command to start"
              description="Choose a preset or type your own request. The first visible answer is always the deterministic result."
              action={
                <span data-testid="chat-empty" className="sr-only">
                  Run a command to start.
                </span>
              }
              className="border-none bg-card-muted/65 shadow-none"
            />
          ) : null}

          {messages.map((item, index) => (
            <div
              key={`${item.role}-${index}`}
              className={
                item.role === "user"
                  ? "ml-auto max-w-[100%] md:max-w-[85%]"
                  : "mr-auto max-w-[100%] md:max-w-[90%]"
              }
              data-testid={`chat-msg-${item.role}-${index}`}
            >
              <div
                className={
                  item.role === "user"
                    ? "rounded-[24px] border border-border/70 bg-card-muted/80 p-4 text-sm"
                    : "rounded-[24px] border border-border/70 bg-white/85 p-4 text-sm shadow-soft"
                }
              >
                <div className="space-y-2">
                  {item.role === "assistant" ? (
                    <div className="flex items-center gap-2">
                      <Badge className="text-xs">Deterministic result</Badge>
                    </div>
                  ) : null}
                  <p className="leading-6">{item.text}</p>
                </div>
                {item.payload?.ai_narration ? (
                  <div
                    className="mt-3 rounded-[20px] border border-accent/30 bg-accent/5 px-3 py-3 text-sm"
                    data-testid="ai-narration"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-1">
                      <Badge className="text-xs">AI-assisted narration</Badge>
                      {llmProviderLabel(item.payload?.trace) ? (
                        <span className="text-xs text-muted-foreground">
                          {llmProviderLabel(item.payload?.trace)}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground">
                      Generated explanation layered on top of the computed result
                      above.
                    </p>
                    <p className="mt-2 leading-6 text-muted-foreground">
                      {item.payload.ai_narration}
                    </p>
                  </div>
                ) : null}
                {(item.payload?.trace as Record<string, unknown> | undefined)
                  ?.selected_agent ? (
                  <div className="mt-2" data-testid="agent-badge">
                    <Badge>
                      agent:{" "}
                      {String(
                        (item.payload!.trace as Record<string, unknown>)
                          .selected_agent
                      )}
                    </Badge>
                  </div>
                ) : null}
                {item.payload?.trace ? (
                  <details className="mt-2 text-xs" data-testid="trace-details">
                    <summary className="cursor-pointer text-muted-foreground">
                      Trace
                    </summary>
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
                ((latestAssistantPayload.data as Record<string, unknown>)
                  ?.formula_markdown as string) || "No formula"
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
                  (latestAssistantPayload?.trace as Record<string, unknown>) ||
                  {},
              }}
            />
          </div>
        ) : null}
      </Card>
    </SiteShell>
  );
}
