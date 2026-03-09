import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { getCopilotAgents } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";

type AgentRow = {
  key: string;
  name: string;
  description: string;
  mission?: string;
};

export default function CopilotAgentsScreen() {
  const { token } = useAuth();
  const [rows, setRows] = useState<AgentRow[]>([]);

  useEffect(() => {
    if (!token) return;
    getCopilotAgents(token)
      .then((payload) => setRows(payload as AgentRow[]))
      .catch(() => setRows([]));
  }, [token]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Copilot Agents</Text>
      <Text style={styles.subtitle}>Deterministic routing roles used by the copilot trace.</Text>

      <View style={styles.list}>
        {rows.map((agent) => (
          <View key={agent.key} style={styles.card}>
            <Text style={styles.cardTitle}>{agent.name}</Text>
            <Text style={styles.cardText}>{agent.description}</Text>
            {agent.mission ? <Text style={styles.cardMission}>{agent.mission}</Text> : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1220"
  },
  content: {
    padding: 14,
    paddingBottom: 24
  },
  title: {
    color: "#f8fafc",
    fontWeight: "800",
    fontSize: 22
  },
  subtitle: {
    color: "#94a3b8",
    marginTop: 4,
    marginBottom: 10
  },
  list: {
    gap: 10
  },
  card: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 12,
    padding: 12
  },
  cardTitle: {
    color: "#f8fafc",
    fontWeight: "700",
    marginBottom: 4
  },
  cardText: {
    color: "#cbd5e1"
  },
  cardMission: {
    color: "#94a3b8",
    marginTop: 6,
    fontSize: 12
  }
});
