import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import { createContact, listContacts, updateContact } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import type { Contact } from "../../../lib/types";

export default function ContactsScreen() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Contact[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const payload = await listContacts(token);
      setRows(payload);
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const clearForm = () => {
    setEditingId(null);
    setName("");
    setEmail("");
    setPhone("");
  };

  const save = async () => {
    if (!token || !name.trim()) {
      Alert.alert("Validation", "Name is required.");
      return;
    }

    if (editingId) {
      await updateContact(token, editingId, {
        name: name.trim(),
        email: email || null,
        phone: phone || null
      });
    } else {
      await createContact(token, {
        name: name.trim(),
        email: email || null,
        phone: phone || null,
        tags_json: []
      });
    }

    clearForm();
    await load();
  };

  const startEdit = (item: Contact) => {
    setEditingId(item.id);
    setName(item.name);
    setEmail(item.email || "");
    setPhone(item.phone || "");
  };

  return (
    <View style={styles.container}>
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>{editingId ? "Edit Contact" : "New Contact"}</Text>
        <TextInput
          onChangeText={setName}
          placeholder="Name"
          placeholderTextColor="#64748b"
          style={styles.input}
          value={name}
        />
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#64748b"
          style={styles.input}
          value={email}
        />
        <TextInput
          onChangeText={setPhone}
          placeholder="Phone"
          placeholderTextColor="#64748b"
          style={styles.input}
          value={phone}
        />

        <View style={styles.formButtons}>
          <Pressable onPress={() => void save()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{editingId ? "Update" : "Create"}</Text>
          </Pressable>
          {editingId ? (
            <Pressable onPress={clearForm} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        refreshControl={<RefreshControl tintColor="#f97316" refreshing={refreshing} onRefresh={load} />}
      >
        {rows.map((item) => (
          <Pressable key={item.id} onPress={() => startEdit(item)} style={styles.row}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>{item.email || "No email"}</Text>
            <Text style={styles.meta}>{item.phone || "No phone"}</Text>
          </Pressable>
        ))}
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
  formCard: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 8
  },
  formTitle: {
    color: "#f8fafc",
    fontWeight: "700",
    marginBottom: 4
  },
  input: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: "#f8fafc",
    backgroundColor: "#0b1220"
  },
  formButtons: {
    flexDirection: "row",
    gap: 10
  },
  primaryButton: {
    backgroundColor: "#ea580c",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700"
  },
  secondaryButton: {
    borderColor: "#f97316",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14
  },
  secondaryButtonText: {
    color: "#fb923c",
    fontWeight: "700"
  },
  row: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10
  },
  name: {
    color: "#f8fafc",
    fontWeight: "700"
  },
  meta: {
    color: "#94a3b8",
    marginTop: 2
  }
});
