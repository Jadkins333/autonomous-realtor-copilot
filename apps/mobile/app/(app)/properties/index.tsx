import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useRouter } from "expo-router";

import { searchParcels } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { buildMobilePropertyView } from "../../../lib/property-access";
import type { ParcelSummary } from "../../../lib/types";

export default function PropertiesScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState("High");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ParcelSummary[]>([]);

  const runSearch = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const payload = await searchParcels(token, query);
      setRows(payload);
    } finally {
      setLoading(false);
    }
  }, [query, token]);

  useEffect(() => {
    void runSearch();
  }, [runSearch]);

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          onChangeText={setQuery}
          placeholder="Search address or parcel"
          placeholderTextColor="#64748b"
          style={styles.input}
          value={query}
        />
        <Pressable onPress={() => void runSearch()} style={styles.button}>
          <Text style={styles.buttonText}>Search</Text>
        </Pressable>
      </View>

      <ScrollView
        refreshControl={<RefreshControl tintColor="#f97316" refreshing={loading} onRefresh={runSearch} />}
      >
        {rows.map((item) => {
          const view = buildMobilePropertyView(item);
          return (
            <Pressable key={item.id} onPress={() => router.push(`/(app)/properties/${item.id}`)} style={styles.row}>
              <Text style={styles.address}>{item.address}</Text>
              <Text style={styles.badge}>{view.originBadgeLabel}</Text>
              <Text style={styles.meta}>{item.parcel_number}</Text>
              <Text style={styles.meta}>
                {item.city}, {item.state} {item.zip}
              </Text>
              {view.blocked ? <Text style={styles.blocked}>{view.blockedMessage}</Text> : null}
            </Pressable>
          );
        })}
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
  searchRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    backgroundColor: "#111827",
    color: "#f8fafc",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  button: {
    backgroundColor: "#ea580c",
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: "center"
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700"
  },
  row: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#1f2937",
    marginBottom: 10
  },
  address: {
    color: "#f8fafc",
    fontWeight: "700",
    marginBottom: 4
  },
  meta: {
    color: "#94a3b8"
  },
  badge: {
    alignSelf: "flex-start",
    color: "#fde68a",
    backgroundColor: "#2b2a1f",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 6
  },
  blocked: {
    color: "#fca5a5",
    marginTop: 6
  }
});
