import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { listOpportunities } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import type { OpportunityItem } from "../../lib/types";

export default function OpportunitiesScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<OpportunityItem[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const payload = await listOpportunities(token);
      setRows(payload.items || []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Opportunity Feed</Text>
      <ScrollView
        refreshControl={<RefreshControl tintColor="#f97316" refreshing={loading} onRefresh={load} />}
      >
        {rows.map((item) => {
          const heat = Number(item.neighborhood_heat?.value?.score_0_100 || 0);
          const distress = Number(item.distress_likelihood?.value?.score_0_1 || 0);
          return (
            <Pressable key={item.parcel_id} onPress={() => router.push(`/(app)/properties/${item.parcel_id}`)} style={styles.row}>
              <Text style={styles.address}>{item.address}</Text>
              <Text style={styles.meta}>Heat {Math.round(heat)} • Distress {(distress * 100).toFixed(0)}%</Text>
              <Text style={styles.meta}>{item.opportunity_flags.join(", ") || "no active flags"}</Text>
              <Text style={styles.meta}>Events 30d: {Number(item.event_signal?.count_30d || 0)}</Text>
              {item.event_signal?.latest ? (
                <Text style={styles.meta}>
                  Latest: {String(item.event_signal.latest.event_type || "unknown").replaceAll("_", " ")} (
                  {item.event_signal.latest.severity || "n/a"})
                </Text>
              ) : null}
              {item.status === "insufficient_data" ? (
                <Text style={styles.warn}>Partial signal: {item.missing_inputs.join(", ") || "missing inputs"}</Text>
              ) : null}
            </Pressable>
          );
        })}
        {!loading && rows.length === 0 ? <Text style={styles.empty}>No opportunities available.</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1220",
    padding: 14
  },
  header: {
    color: "#f8fafc",
    fontWeight: "800",
    fontSize: 20,
    marginBottom: 10
  },
  row: {
    backgroundColor: "#111827",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f2937",
    padding: 12,
    marginBottom: 10
  },
  address: {
    color: "#f8fafc",
    fontWeight: "700",
    marginBottom: 4
  },
  meta: {
    color: "#cbd5e1",
    marginBottom: 2
  },
  warn: {
    marginTop: 4,
    color: "#fbbf24",
    fontSize: 12
  },
  empty: {
    color: "#94a3b8"
  }
});
