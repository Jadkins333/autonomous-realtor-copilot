"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Send, Bot, Sparkles, ChevronDown, ChevronRight, Cpu, Database } from "lucide-react";

import { useRequireAuth } from "@/components/auth-guard";
import { ProvenanceDrawer } from "@/components/provenance-drawer";
import { SiteShell } from "@/components/site-shell";
import { apiFetch } from "@/lib/api";
import { COPILOT_COMMANDS } from "@/lib/commands";

type CopilotResponse = {
  status: string;
  text: string;
  data?: {
    formula_markdown?: string;
    inputs?: Record<string, unknown>;
    provenance?: Record<string, unknown>;
  };
  trace?: {
    selected_agent?: string;
    [key: string]: unknown;
  };
  missing_inputs?: string[];
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

const AGENT_ICONS: Record<string, string> = {
  property_intel: "🏠",
  outreach_writer: "✉️",
  compliance_checker: "⚖️",
  market_analyst: "📊",
  data_provenance_explainer: "🔍",
};

export default function CopilotPage() {
  const { status } = useRequireAuth();
  const { data: session } = useSession();
  const [query, setQuery] = useState(COPILOT_COMMANDS[0]);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [traceOpen, setTraceOpen] = useState<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const isOffline = typeof navigator !== "undefined" ? !navigator.onLine : false;

  async function submitCommand() {
    if (!session || !query.trim() || isOffline || loading) return;
    const message = query.trim();
    setMessages((prev) => [...prev, { role: "user", text: message }]);
    setQuery("");
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
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!session) return;
    apiFetch<AgentRow[]>("/copilot/agents", session?.apiToken)
      .then(setAgents)
      .catch(() => setAgents([]));
  }, [session]);

  if (status !== "authenticated") return null;

  return (
    <SiteShell>
      <div className="flex h-full gap-6" style={{ height: "calc(100vh - 96px)" }}>
        {/* Chat panel */}
        <div className="flex-1 flex flex-col min-w-0 rounded-xl border border-white/[0.08] bg-[#13161f] overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center">
              <Bot className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white">AI Copilot</h1>
              <p className="text-xs text-white/40">Deterministic agents · Data-backed · Auditable</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-xs text-emerald-400 font-medium">Live</span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center pb-16">
                <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
                  <Sparkles className="w-7 h-7 text-indigo-400" />
                </div>
                <p className="text-white/60 text-sm font-medium mb-1">Ask anything about Columbus properties</p>
                <p className="text-white/30 text-xs max-w-xs">Property intelligence, outreach drafts, market analysis — all grounded in public data.</p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {COPILOT_COMMANDS.map((cmd) => (
                    <button
                      key={cmd}
                      onClick={() => setQuery(cmd)}
                      className="text-xs px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-white/60 hover:text-white/90 hover:bg-white/[0.08] transition-all"
                    >
                      {cmd}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((item, index) => (
              <div key={`${item.role}-${index}`} className={item.role === "user" ? "flex justify-end" : "flex justify-start"}>
                {item.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center flex-shrink-0 mt-1 mr-2.5">
                    <Bot className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                )}
                <div className={`max-w-[78%] ${item.role === "user" ? "" : ""}`}>
                  <div className={
                    item.role === "user"
                      ? "rounded-2xl rounded-tr-sm bg-orange-500/90 px-4 py-2.5 text-sm text-white"
                      : "rounded-2xl rounded-tl-sm bg-white/[0.06] border border-white/[0.08] px-4 py-3 text-sm text-white/90"
                  }>
                    <p className="leading-relaxed">{item.text}</p>
                    {item.payload?.trace?.selected_agent && (
                      <div className="mt-2 pt-2 border-t border-white/[0.08] flex items-center gap-2">
                        <span className="text-[10px] text-white/40">via</span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/20">
                          {AGENT_ICONS[item.payload.trace.selected_agent] ?? "🤖"} {item.payload.trace.selected_agent.replace(/_/g, " ")}
                        </span>
                      </div>
                    )}
                  </div>
                  {item.payload?.trace && (
                    <div className="mt-1.5 ml-1">
                      <button
                        onClick={() => setTraceOpen(traceOpen === index ? null : index)}
                        className="flex items-center gap-1.5 text-[10px] text-white/30 hover:text-white/60 transition-colors"
                      >
                        {traceOpen === index ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        Trace
                      </button>
                      {traceOpen === index && (
                        <pre className="mt-2 text-[10px] text-white/40 bg-white/[0.03] rounded-lg border border-white/[0.06] p-3 overflow-auto max-h-40">
                          {JSON.stringify(item.payload.trace, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <div className="flex gap-1 px-4 py-3 rounded-2xl rounded-tl-sm bg-white/[0.06] border border-white/[0.08]">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick commands (only when no messages) */}
          {messages.length > 0 && (
            <div className="px-5 pb-2 flex flex-wrap gap-1.5">
              {COPILOT_COMMANDS.map((cmd) => (
                <button
                  key={cmd}
                  onClick={() => setQuery(cmd)}
                  className="text-[10px] px-2 py-1 rounded-full border border-white/10 bg-white/[0.03] text-white/40 hover:text-white/70 hover:bg-white/[0.07] transition-all"
                >
                  {cmd}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-5 py-4 border-t border-white/[0.06]">
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submitCommand()}
                placeholder="Ask about a property, market, or draft outreach…"
                disabled={loading || isOffline}
                className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/40 disabled:opacity-50"
              />
              <button
                onClick={submitCommand}
                disabled={loading || isOffline || !query.trim()}
                className="w-10 h-10 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
            {latestAssistantPayload?.data && (
              <div className="mt-2">
                <ProvenanceDrawer
                  formula={latestAssistantPayload?.data?.formula_markdown || "No formula"}
                  inputs={latestAssistantPayload?.data?.inputs || { missing_inputs: latestAssistantPayload?.missing_inputs || [] }}
                  provenance={{ metric_provenance: latestAssistantPayload?.data?.provenance || {}, trace: latestAssistantPayload?.trace || {} }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Agents sidebar */}
        <div className="w-64 flex-shrink-0 flex flex-col gap-3">
          <div className="rounded-xl border border-white/[0.08] bg-[#13161f] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="w-3.5 h-3.5 text-white/40" />
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Available Agents</p>
            </div>
            <div className="space-y-2">
              {agents.map((agent) => (
                <button
                  key={agent.key}
                  onClick={() => setQuery(`ask ${agent.key.replace(/_/g, " ")}`)}
                  className="w-full text-left rounded-lg border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.12] p-3 transition-all group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm">{AGENT_ICONS[agent.key] ?? "🤖"}</span>
                    <p className="text-xs font-semibold text-white/80 group-hover:text-white">{agent.name}</p>
                  </div>
                  <p className="text-[10px] text-white/35 leading-relaxed">{agent.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#13161f] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Database className="w-3.5 h-3.5 text-white/40" />
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Data Layer</p>
            </div>
            <div className="space-y-2 text-xs text-white/40">
              <p>• Franklin County Auditor</p>
              <p>• ArcGIS permit feeds</p>
              <p>• FEMA flood zones</p>
              <p>• OSM / COTA transit</p>
              <p className="pt-1 text-amber-400/70">Running on seed data</p>
            </div>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
