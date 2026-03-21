import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { acknowledgeDisclosure, approvePackDraft, listDraftPacks } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { summarizeDisclosureStatus } from "../../../lib/compliance-ui";
import { summarizeDisclosureBlock, summarizeFairHousing, summarizePolicyState } from "../../../lib/policy-presenter";
import type { DraftPack, DraftPackDraft } from "../../../lib/types";

export default function OutreachScreen() {
  const { token } = useAuth();
  const [packs, setPacks] = useState<DraftPack[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPackId, setSelectedPackId] = useState<string>("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState("");

  const load = useCallback(async () => {
    if (!token) {
      return;
    }

    setRefreshing(true);
    try {
      const response = await listDraftPacks(token, 20);
      const next = Array.isArray(response.items) ? response.items : [];
      setPacks(next);
      setSelectedPackId((current) => current || next[0]?.id || "");
      setActionResult("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load outreach drafts";
      setActionResult(message);
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedPack = useMemo(
    () => packs.find((pack) => pack.id === selectedPackId) || packs[0] || null,
    [packs, selectedPackId]
  );

  const approve = useCallback(
    async (draftId: string) => {
      if (!token) {
        return;
      }

      setActionBusy(draftId);
      try {
        const result = await approvePackDraft(token, draftId);
        Alert.alert(
          "Draft approved",
          `Status: ${result.status}\nApproval: ${result.approval_state}${result.reason ? `\n${result.reason}` : ""}`
        );
        setActionResult(`Approved draft ${draftId.slice(0, 8)}`);
        await load();
      } catch (error) {
        Alert.alert("Approval failed", error instanceof Error ? error.message : "Unknown error");
      } finally {
        setActionBusy(null);
      }
    },
    [load, token]
  );

  const acknowledge = useCallback(
    async (draft: DraftPackDraft, disclosureVersionId: string) => {
      if (!token) {
        return;
      }

      setActionBusy(draft.id);
      try {
        await acknowledgeDisclosure(token, {
          action: "outreach_approve",
          disclosure_version_id: disclosureVersionId,
          contact_id: draft.contact_id,
          source: "mobile_outreach",
          checkbox_acknowledged: true
        });
        setActionResult(`Acknowledged disclosure for ${draft.id.slice(0, 8)}`);
        await load();
      } catch (error) {
        Alert.alert("Acknowledgement failed", error instanceof Error ? error.message : "Unknown error");
      } finally {
        setActionBusy(null);
      }
    },
    [load, token]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Drafted Outreach</Text>
      <Text style={styles.subtitle}>
        Review campaigns, clear disclosures, and approve messages from the same queue.
      </Text>

      {actionResult ? <Text style={styles.banner}>{actionResult}</Text> : null}

      <ScrollView
        refreshControl={<RefreshControl tintColor="#f97316" refreshing={refreshing} onRefresh={() => void load()} />}
      >
        <View style={styles.header}>
          <Text style={styles.sectionLabel}>Campaigns</Text>
          <View style={styles.packRow}>
            {packs.map((pack) => {
              const active = pack.id === (selectedPack?.id || "");
              return (
                <Pressable
                  key={pack.id}
                  onPress={() => setSelectedPackId(pack.id)}
                  style={[styles.packChip, active && styles.packChipActive]}
                >
                  <Text style={[styles.packChipText, active && styles.packChipTextActive]}>
                    {pack.objective}
                  </Text>
                  <Text style={styles.packChipMeta}>
                    {pack.sandbox ? "Sandbox" : "Live"} · {pack.drafts.length}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {selectedPack ? (
            <View style={styles.selectedSummary}>
              <Text style={styles.selectedTitle}>{selectedPack.objective}</Text>
              <Text style={styles.selectedMeta}>
                {selectedPack.status.replace(/_/g, " ")} · {selectedPack.drafts.length} drafts
              </Text>
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No campaigns yet</Text>
              <Text style={styles.emptyText}>Generate outreach from the web app or copilot to populate this queue.</Text>
            </View>
          )}
        </View>

        {(selectedPack?.drafts || []).length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No drafts in this campaign</Text>
            <Text style={styles.emptyText}>Pull to refresh after creating a new outreach pack.</Text>
          </View>
        ) : null}

        {(selectedPack?.drafts || []).map((item) => {
          const disclosureSummary = summarizeDisclosureStatus(item.disclosure_status);
          const fairHousing = summarizeFairHousing(item.fair_housing_scan || item.compliance_snapshot?.fair_housing_scan);
          const disclosureBlock = summarizeDisclosureBlock(item.compliance_snapshot);

          return (
            <View key={item.id} style={styles.row}>
              <Text style={styles.channel}>{item.channel.toUpperCase()}</Text>
              <Text style={styles.subject}>{item.subject || "(No subject)"}</Text>
              <Text style={styles.body}>{item.body}</Text>
              <Text style={styles.status}>Status: {item.status}</Text>
              <Text style={styles.mode}>
                Compliance: {summarizePolicyState(item.compliance_snapshot)}
              </Text>

              {disclosureSummary.blocked ? (
                <Text style={styles.warning}>{disclosureSummary.title}</Text>
              ) : null}
              {fairHousing ? (
                <Text style={styles.warning}>Fair housing review required: {fairHousing}</Text>
              ) : null}
              {disclosureBlock ? (
                <Text style={styles.warning}>Disclosure gate: {disclosureBlock}</Text>
              ) : null}

              {disclosureSummary.blockingDisclosures.map((blocking) => (
                <Pressable
                  key={blocking.disclosure_version_id}
                  onPress={() => void acknowledge(item, blocking.disclosure_version_id)}
                  style={[styles.button, actionBusy === item.id && styles.buttonDisabled]}
                  disabled={actionBusy === item.id}
                >
                  <Text style={styles.buttonText}>Acknowledge {blocking.title}</Text>
                </Pressable>
              ))}

              <Pressable
                onPress={() => void approve(item.id)}
                style={[styles.button, actionBusy === item.id && styles.buttonDisabled]}
                disabled={actionBusy === item.id}
              >
                <Text style={styles.buttonText}>
                  {actionBusy === item.id ? "Working..." : "Approve"}
                </Text>
              </Pressable>
            </View>
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
  title: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8
  },
  subtitle: {
    color: "#94a3b8",
    marginBottom: 12
  },
  banner: {
    color: "#fdba74",
    marginBottom: 12
  },
  header: {
    marginBottom: 12
  },
  sectionLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    textTransform: "uppercase"
  },
  packRow: {
    gap: 8,
    marginBottom: 10
  },
  packChip: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    backgroundColor: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8
  },
  packChipActive: {
    borderColor: "#f97316",
    backgroundColor: "#2a1406"
  },
  packChipText: {
    color: "#f8fafc",
    fontWeight: "600"
  },
  packChipTextActive: {
    color: "#fdba74"
  },
  packChipMeta: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 4
  },
  selectedSummary: {
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 12,
    backgroundColor: "#111827",
    padding: 12
  },
  selectedTitle: {
    color: "#f8fafc",
    fontWeight: "700",
    marginBottom: 4
  },
  selectedMeta: {
    color: "#94a3b8"
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
    marginBottom: 6
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
    paddingVertical: 8,
    marginTop: 4
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: "#fb923c",
    fontWeight: "700"
  },
  emptyBox: {
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 12,
    backgroundColor: "#111827",
    padding: 16
  },
  emptyTitle: {
    color: "#f8fafc",
    fontWeight: "700",
    marginBottom: 4
  },
  emptyText: {
    color: "#94a3b8"
  }
});
