import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ProvenanceModal } from "../../../components/provenance-modal";
import { copilotChat, getCopilotAgents } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";

const DEMO_COMMANDS = [
  "property profile for 145 N High St",
  "draft outreach to Ava",
  "columbus market snapshot"
];

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  payload?: unknown;
  agent?: string;
};

export default function CopilotScreen() {
  const { token } = useAuth();
  const [input, setInput] = useState(DEMO_COMMANDS[0]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agents, setAgents] = useState<Array<{ key: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const [latestPayload, setLatestPayload] = useState<unknown>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (!token) return;
    getCopilotAgents(token)
      .then((rows) => setAgents(rows.map((row) => ({ key: row.key, name: row.name }))))
      .catch(() => setAgents([]));
  }, [token]);

  useEffect(() => {
    if (!messages.length) return;
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const send = async () => {
    if (!token || !input.trim() || loading) return;

    const messageText = input.trim();
    setMessages((prev) => [...prev, { id: `m-${Date.now()}`, role: "user", text: messageText }]);
    setLoading(true);

    try {
      const response = await copilotChat(token, messageText);
      setLatestPayload(response?.trace || response);
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}-assistant`,
          role: "assistant",
          text: response.text || "Response received.",
          payload: response,
          agent: response?.trace?.selected_agent || undefined
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.quickRow}>
        {DEMO_COMMANDS.map((cmd) => (
          <Pressable key={cmd} onPress={() => setInput(cmd)} style={styles.quickButton}>
            <Text style={styles.quickButtonText}>{cmd}</Text>
          </Pressable>
        ))}
      </View>
      {!!agents.length ? (
        <View style={styles.agentStrip}>
          {agents.map((agent) => (
            <Text key={agent.key} style={styles.agentChip}>
              {agent.name}
            </Text>
          ))}
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        style={styles.list}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.message, item.role === "user" ? styles.userMsg : styles.botMsg]}>
            <Text style={styles.messageText}>{item.text}</Text>
            {item.agent ? <Text style={styles.agentBadge}>agent: {item.agent}</Text> : null}
            {item.role === "assistant" && item.payload ? (
              <Pressable onPress={() => setProvenanceOpen(true)} style={styles.provenanceButton}>
                <Text style={styles.provenanceButtonText}>Provenance</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      />

      <View style={styles.inputRow}>
        <TextInput
          onChangeText={setInput}
          placeholder="Ask copilot"
          placeholderTextColor="#64748b"
          style={styles.input}
          value={input}
        />
        <Pressable disabled={loading} onPress={() => void send()} style={styles.sendButton}>
          <Text style={styles.sendText}>{loading ? "Sending..." : "Send"}</Text>
        </Pressable>
      </View>
      {loading ? <Text style={styles.typing}>Copilot is typing…</Text> : null}

      <ProvenanceModal
        visible={provenanceOpen}
        title="Copilot Trace + Provenance"
        payload={latestPayload}
        onClose={() => setProvenanceOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1220",
    padding: 12
  },
  quickRow: {
    marginBottom: 10,
    gap: 8
  },
  quickButton: {
    backgroundColor: "#111827",
    borderColor: "#1f2937",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  quickButtonText: {
    color: "#cbd5e1",
    fontSize: 12
  },
  agentStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8
  },
  agentChip: {
    color: "#f8fafc",
    backgroundColor: "#1f2937",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11
  },
  list: {
    flex: 1
  },
  message: {
    marginBottom: 10,
    padding: 10,
    borderRadius: 10
  },
  userMsg: {
    backgroundColor: "#1e293b",
    alignSelf: "flex-end",
    maxWidth: "85%"
  },
  botMsg: {
    backgroundColor: "#111827",
    borderColor: "#1f2937",
    borderWidth: 1,
    alignSelf: "flex-start",
    maxWidth: "90%"
  },
  messageText: {
    color: "#f8fafc"
  },
  agentBadge: {
    color: "#f97316",
    fontSize: 11,
    marginTop: 6
  },
  provenanceButton: {
    alignSelf: "flex-start",
    marginTop: 8,
    borderColor: "#f97316",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  provenanceButtonText: {
    color: "#fb923c",
    fontWeight: "700",
    fontSize: 12
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    color: "#f8fafc",
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#111827"
  },
  sendButton: {
    backgroundColor: "#ea580c",
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: "center"
  },
  sendText: {
    color: "#fff",
    fontWeight: "700"
  },
  typing: {
    marginTop: 6,
    color: "#94a3b8",
    fontSize: 12
  }
});
