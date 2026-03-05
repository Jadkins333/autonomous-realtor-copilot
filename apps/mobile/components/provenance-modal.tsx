import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export function ProvenanceModal({
  visible,
  title,
  payload,
  onClose
}: {
  visible: boolean;
  title: string;
  payload: unknown;
  onClose: () => void;
}) {
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.body}>
            <Text style={styles.json}>{JSON.stringify(payload, null, 2)}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end"
  },
  sheet: {
    maxHeight: "80%",
    backgroundColor: "#111827",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  title: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700"
  },
  close: {
    color: "#f59e0b",
    fontSize: 14,
    fontWeight: "600"
  },
  body: {
    borderRadius: 12,
    backgroundColor: "#0b1220",
    padding: 10
  },
  json: {
    color: "#cbd5e1",
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Courier"
  }
});
