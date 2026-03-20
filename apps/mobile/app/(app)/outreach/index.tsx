import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { acknowledgeDisclosure, approveDraft, listOutreachDrafts } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { summarizeDisclosureStatus } from "../../../lib/compliance-ui";
import { summarizeDisclosureBlock, summarizeFairHousing, summarizePolicyState } from "../../../lib/policy-presenter";
import type { OutreachDraft } from "../../../lib/types";

export default function OutreachScreen() {
 const { token } = useAuth();
 const [packs, setPacks] = useState([] as DraftPack[]);
 const [actionBusy, setActionBusy] = useState(false);
 const [selectedPackId, setSelectedPackId] = useState("");
 const [refreshing, setRefreshing] = useState(false);
 const [actionResult, setActionResult] = useState("");

 const load = useCallback(async function () {
 if (!token) {
 return;
 }

 setRefreshing(true);
 try {
 const response = (await listDraftPacks(token, 20)) as DraftPacksResponse;
 const next = Array.isArray(response.items) ? response.items : [];
 setPacks(next);

  const approve = async (id: string) => {
    if (!token) return;
    const result = await approveDraft(token, id);
    const reasons = result.explanations?.join("\n") || result.reason || result.status;
    Alert.alert(
      "Compliance Result",
      `Status: ${result.status}\nMode: ${result.policy_snapshot?.delivery_mode || "unknown"}\n${reasons}`
    );
    await load();
  };

  const acknowledge = async (row: OutreachDraft, disclosureVersionId: string) => {
    if (!token) return;
    await acknowledgeDisclosure(token, {
      action: "outreach_approve",
      disclosure_version_id: disclosureVersionId,
      contact_id: row.contact_id,
      property_id: row.property_id,
      source: "mobile_outreach",
      checkbox_acknowledged: true
    });
    await load();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Drafted Outreach (Sandbox Default)</Text>
      <Text style={styles.subtitle}>
        Live sends require current consent evidence, fair-housing-safe content, recipient-local quiet-hours clearance,
        and a passing policy snapshot.
      </Text>
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
            <Text style={styles.mode}>Delivery Mode: {item.sandbox_indicator || "unknown"}</Text>
            {summarizeDisclosureStatus(item.disclosure_status).blocked ? (
              <Text style={styles.warning}>{summarizeDisclosureStatus(item.disclosure_status).title}</Text>
            ) : null}
            {item.compliance_snapshot ? (
              <Text style={styles.compliance}>Compliance: {summarizePolicyState(item.compliance_snapshot)}</Text>
            ) : null}
            {summarizeFairHousing(item.fair_housing_scan || item.compliance_snapshot?.fair_housing_scan) ? (
              <Text style={styles.warning}>
                Fair housing review required:{" "}
                {summarizeFairHousing(item.fair_housing_scan || item.compliance_snapshot?.fair_housing_scan)}
              </Text>
            ) : null}
            {summarizeDisclosureBlock(item.compliance_snapshot) ? (
              <Text style={styles.warning}>Disclosure gate: {summarizeDisclosureBlock(item.compliance_snapshot)}</Text>
            ) : null}
            {item.disclosure_status?.blocking_disclosures.map((blocking) => (
              <Pressable key={blocking.disclosure_version_id} onPress={() => void acknowledge(item, blocking.disclosure_version_id)} style={styles.button}>
                <Text style={styles.buttonText}>Acknowledge {blocking.title}</Text>
              </Pressable>
            ))}
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
  subtitle: {
    color: "#94a3b8",
    marginBottom: 12
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
    marginBottom: 4
  },
  mode: {
    color: "#cbd5e1",
    marginBottom: 4
  },
  compliance: {
    color: "#f8fafc",
    marginBottom: 4
  },
  warning: {
    color: "#fbbf24",
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





