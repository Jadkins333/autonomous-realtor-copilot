import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ProvenanceModal } from "../../components/provenance-modal";
import { getCitySnapshot, getMetrics } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";

export default function DashboardScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [provenanceOpen, setProvenanceOpen] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const [snapshotPayload, metricsPayload] = await Promise.all([
        getCitySnapshot(token),
        getMetrics(token)
      ]);
      setSnapshot(snapshotPayload);
      setMetrics(metricsPayload);
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const score = useMemo(() => Number(snapshot?.value?.score_0_100 || 0), [snapshot]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl tintColor="#f97316" refreshing={refreshing} onRefresh={load} />}
    >
      <Text style={styles.title}>Welcome, {user?.name || "Agent"}</Text>
      <Text style={styles.subtitle}>Columbus market nowcast from public data</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Micro Market Nowcast</Text>
        <Text style={styles.score}>{score.toFixed(1)}</Text>
        <Text style={styles.detail}>{snapshot?.value?.rationale || "Loading..."}</Text>
        <Pressable onPress={() => setProvenanceOpen(true)} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>View Provenance</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>System Metrics</Text>
        <Text style={styles.json}>{JSON.stringify(metrics, null, 2)}</Text>
      </View>

      <Text style={styles.section}>Quick Links</Text>
      <View style={styles.quickLinks}>
        <Pressable onPress={() => router.push("/(app)/opportunities")} style={styles.linkCard}>
          <Text style={styles.linkLabel}>Opportunities</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/(app)/properties")} style={styles.linkCard}>
          <Text style={styles.linkLabel}>Properties</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/(app)/contacts")} style={styles.linkCard}>
          <Text style={styles.linkLabel}>Contacts</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/(app)/outreach")} style={styles.linkCard}>
          <Text style={styles.linkLabel}>Outreach</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/(app)/copilot")} style={styles.linkCard}>
          <Text style={styles.linkLabel}>Copilot</Text>
        </Pressable>
      </View>

      <ProvenanceModal
        visible={provenanceOpen}
        title="Market Snapshot Provenance"
        payload={{
          metric_key: snapshot?.metric_key,
          version: snapshot?.version,
          formula_markdown: snapshot?.formula_markdown,
          computed_at: snapshot?.computed_at,
          inputs: snapshot?.inputs,
          provenance: snapshot?.provenance
        }}
        onClose={() => setProvenanceOpen(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1220"
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 26
  },
  title: {
    color: "#f8fafc",
    fontSize: 24,
    fontWeight: "800"
  },
  subtitle: {
    color: "#94a3b8",
    marginBottom: 4
  },
  card: {
    backgroundColor: "#111827",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1f2937"
  },
  cardTitle: {
    color: "#f8fafc",
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 8
  },
  score: {
    color: "#fb923c",
    fontWeight: "800",
    fontSize: 42
  },
  detail: {
    color: "#cbd5e1",
    marginTop: 6,
    lineHeight: 20
  },
  secondaryButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    borderColor: "#f97316",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  secondaryButtonText: {
    color: "#fb923c",
    fontWeight: "700"
  },
  json: {
    color: "#cbd5e1",
    fontFamily: "Courier",
    fontSize: 12,
    lineHeight: 18
  },
  section: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 8
  },
  quickLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  linkCard: {
    width: "48%",
    backgroundColor: "#111827",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f2937",
    paddingVertical: 20,
    alignItems: "center"
  },
  linkLabel: {
    color: "#f8fafc",
    fontWeight: "700"
  }
});
