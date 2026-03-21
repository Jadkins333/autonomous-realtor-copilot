import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";

import { ProvenanceModal } from "../../components/provenance-modal";
import { getCitySnapshot, getTodayWorkspace } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";

export default function DashboardScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [workspace, setWorkspace] = useState<any>(null);
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const [tourDismissed, setTourDismissed] = useState(false);

  const dismissTour = async () => {
    await SecureStore.setItemAsync("tour_mode_dismissed", "true");
    setTourDismissed(true);
  };

  const load = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const [snapshotPayload, workspacePayload] = await Promise.all([
        getCitySnapshot(token),
        getTodayWorkspace(token)
      ]);
      setSnapshot(snapshotPayload);
      setWorkspace(workspacePayload);
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let mounted = true;
    SecureStore.getItemAsync("tour_mode_dismissed")
      .then((value) => {
        if (mounted) {
          setTourDismissed(value === "true");
        }
      })
      .catch(() => {
        if (mounted) {
          setTourDismissed(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const score = useMemo(() => Number(snapshot?.value?.score_0_100 || 0), [snapshot]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl tintColor="#f97316" refreshing={refreshing} onRefresh={load} />}
    >
      <Text style={styles.title}>Welcome, {user?.name || "Agent"}</Text>
      <Text style={styles.subtitle}>Columbus market nowcast from public data</Text>

      {!tourDismissed ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tour Mode</Text>
          <Text style={styles.detail}>
            1. Review what is due today. 2. Work the follow-up queue. 3. Move deals forward. 4. Open property intel
            only when it helps a live conversation.
          </Text>
          <Pressable onPress={() => void dismissTour()} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Dismiss tour</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Micro Market Nowcast</Text>
        <Text style={styles.score}>{score.toFixed(1)}</Text>
        <Text style={styles.detail}>{snapshot?.value?.rationale || "Loading..."}</Text>
        <Pressable onPress={() => setProvenanceOpen(true)} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>View Provenance</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today</Text>
        <Text style={styles.detail}>Open tasks: {workspace?.summary?.open_tasks ?? 0}</Text>
        <Text style={styles.detail}>Overdue: {workspace?.summary?.overdue_tasks ?? 0}</Text>
        <Text style={styles.detail}>Deals at risk: {workspace?.summary?.deals_at_risk ?? 0}</Text>
        <Text style={styles.detail}>Follow-ups due: {workspace?.summary?.follow_ups_due ?? 0}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Coach Alerts</Text>
        {(workspace?.coach_alerts || []).length === 0 ? (
          <Text style={styles.detail}>No proactive coach alerts yet.</Text>
        ) : (
          workspace.coach_alerts.map((alert: any) => (
            <View key={alert.id} style={styles.alertItem}>
              <Text style={styles.alertTitle}>{alert.title}</Text>
              <Text style={styles.detail}>{alert.detail}</Text>
            </View>
          ))
        )}
      </View>

      <Text style={styles.section}>Quick Links</Text>
      <View style={styles.quickLinks}>
        <Pressable onPress={() => router.push("./opportunities")} style={styles.linkCard}>
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
  alertItem: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#1f2937"
  },
  alertTitle: {
    color: "#f8fafc",
    fontWeight: "700"
  },
  linkLabel: {
    color: "#f8fafc",
    fontWeight: "700"
  }
});
