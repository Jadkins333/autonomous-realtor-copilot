import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";

import { approveDraft, listOutreachDrafts } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import type { OutreachDraft } from "../../../lib/types";

export default function OutreachScreen() {
  const { token } = useAuth();
  const [rows, setRows] = useState<OutreachDraft[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      setRows(await listOutreachDrafts(token));
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (id: string) => {
    if (!token) return;
    const result = await approveDraft(token, id);
    Alert.alert("Approve Result", JSON.stringify(result));
    await load();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Drafted Outreach (Sandbox Default)</Text>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl tintColor="#f97316" refreshing={refreshing} onRefresh={load} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.channel}>{item.channel.toUpperCase()}</Text>
            <Text style={styles.subject}>{item.subject || "(No subject)"}</Text>
            <Text style={styles.body}>{item.body}</Text>
            <Text style={styles.status}>Status: {item.status}</Text>
            <Pressable onPress={() => void approve(item.id)} style={styles.button}>
              <Text style={styles.buttonText}>Approve</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1220",
    padding: 14
  },
  title: {
    color: "#f8fafc",
    fontWeight: "700",
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
  channel: {
    color: "#fb923c",
    fontWeight: "700",
    marginBottom: 4
  },
  subject: {
    color: "#f8fafc",
    fontWeight: "600",
    marginBottom: 4
  },
  body: {
    color: "#cbd5e1",
    marginBottom: 6
  },
  status: {
    color: "#94a3b8",
    marginBottom: 8
  },
  button: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#f97316",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  buttonText: {
    color: "#fb923c",
    fontWeight: "700"
  }
});
