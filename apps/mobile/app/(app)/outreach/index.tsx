import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { approvePackDraft, listDraftPacks, rejectPackDraft, submitDraftPack } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import type { DraftPack, DraftPacksResponse } from "../../../lib/types";

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

 if (!selectedPackId) {
 if (next.length) {
 setSelectedPackId(next[0].id);
 }
 } else {
 const stillExists = next.some(function (pack) {
 return pack.id === selectedPackId;
 });
 if (!stillExists) {
 setSelectedPackId(next.length ? next[0].id : "");
 }
 }
 } catch (error) {
 Alert.alert("Load Failed", String(error));
 } finally {
 setRefreshing(false);
 }
 }, [token, selectedPackId]);

 useEffect(function () {
 void load();
 }, [load]);

 const selectedPack = useMemo(function () {
 const found = packs.find(function (pack) {
 return pack.id === selectedPackId;
 });
 if (found) {
 return found;
 }
 return null;
 }, [packs, selectedPackId]);

 const submitPack = async function (packId: string) {
 if (!token) {
 return;
 }
 try {
 setActionBusy(true);
 const result = await submitDraftPack(token, packId);
 setActionResult(JSON.stringify(result));
 await load();
 } catch (error) {
 Alert.alert("Submit Failed", String(error));
 } finally {
 setActionBusy(false);
 }
 };

 const approveDraft = async function (draftId: string) {
 if (!token) {
 return;
 }
 try {
 setActionBusy(true);
 const result = await approvePackDraft(token, draftId);
 setActionResult(JSON.stringify(result));
 await load();
 } catch (error) {
 Alert.alert("Approve Failed", String(error));
 } finally {
 setActionBusy(false);
 }
 };

 const rejectDraft = async function (draftId: string) {
 if (!token) {
 return;
 }
 try {
 setActionBusy(true);
 const result = await rejectPackDraft(token, draftId);
 setActionResult(JSON.stringify(result));
 await load();
 } catch (error) {
 Alert.alert("Reject Failed", String(error));
 } finally {
 setActionBusy(false);
 }
 };

 const draftRows = selectedPack ? (Array.isArray(selectedPack.drafts) ? selectedPack.drafts : []) : [];

 return (
 <View style={styles.container}>
 <Text style={styles.title}>Draft Packs (Sandbox Default)</Text>

 <FlatList
 horizontal
 data={packs}
 keyExtractor={function (item) {
 return item.id;
 }}
 refreshControl={<RefreshControl tintColor="#f97316" refreshing={refreshing} onRefresh={load} />}
 renderItem={function ({ item }) {
 const selected = item.id === selectedPackId;
 return (
 <Pressable
 onPress={function () {
 setSelectedPackId(item.id);
 }}
 style={[styles.packCard, selected ? styles.packCardSelected : null]}
 >
 <Text style={styles.packTitle}>Pack {String(item.id).slice(0, 8)}</Text>
 <Text style={styles.packMeta}>Status: {item.status}</Text>
 <Text style={styles.packMeta}>{item.objective}</Text>
 </Pressable>
 );
 }}
 />

 {actionResult ? <Text style={styles.result}>{actionResult}</Text> : null}

 {packs.length === 0 ? <Text style={styles.emptyText}>No draft packs yet.</Text> : null}

 {selectedPack ? (
 <ScrollView style={styles.detailCard}>
 <Text style={styles.detailTitle}>Pack Detail</Text>
 <Text style={styles.detailMeta}>Status: {selectedPack.status}</Text>

 <Pressable
 onPress={function () {
 if (!actionBusy) {
 void submitPack(selectedPack.id);
 }
 }}
 style={styles.submitButton}
 >
 <Text style={styles.submitButtonText}>Submit Pack</Text>
 </Pressable>

 {draftRows.map(function (draft) {
 return (
 <View key={draft.id} style={styles.draftRow}>
 <Text style={styles.draftChannel}>{String(draft.channel).toUpperCase()}</Text>
 <Text style={styles.draftSubject}>{draft.subject ? draft.subject : "(No subject)"}</Text>
 <Text style={styles.draftBody}>{draft.body}</Text>
 <Text style={styles.draftStatus}>Status: {draft.status}</Text>

 <View style={styles.actionRow}>
 <Pressable onPress={function () { if (!actionBusy) {
 void approveDraft(draft.id);
 } }} style={styles.actionButton}>
 <Text style={styles.actionButtonText}>Approve</Text>
 </Pressable>
 <Pressable onPress={function () { if (!actionBusy) {
 void rejectDraft(draft.id);
 } }} style={styles.rejectButton}>
 <Text style={styles.rejectButtonText}>Reject</Text>
 </Pressable>
 </View>
 </View>
 );
 })}
 </ScrollView>
 ) : (
 <Text style={styles.emptyText}>Select a draft pack to view details.</Text>
 )}
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
 result: {
 color: "#fcd34d",
 marginBottom: 10,
 fontSize: 12
 },
 packCard: {
 width: 180,
 backgroundColor: "#111827",
 borderRadius: 12,
 borderWidth: 1,
 borderColor: "#1f2937",
 padding: 12,
 marginRight: 10,
 marginBottom: 10
 },
 packCardSelected: {
 borderColor: "#f97316"
 },
 packTitle: {
 color: "#f8fafc",
 fontWeight: "700",
 marginBottom: 4
 },
 packMeta: {
 color: "#cbd5e1",
 fontSize: 12,
 marginBottom: 2
 },
 detailCard: {
 flex: 1,
 backgroundColor: "#111827",
 borderRadius: 12,
 borderWidth: 1,
 borderColor: "#1f2937",
 padding: 12
 },
 detailTitle: {
 color: "#f8fafc",
 fontWeight: "700",
 marginBottom: 4
 },
 detailMeta: {
 color: "#94a3b8",
 marginBottom: 10
 },
 submitButton: {
 alignSelf: "flex-start",
 borderWidth: 1,
 borderColor: "#f97316",
 borderRadius: 10,
 paddingHorizontal: 12,
 paddingVertical: 8,
 marginBottom: 12
 },
 submitButtonText: {
 color: "#fb923c",
 fontWeight: "700"
 },
 draftRow: {
 borderTopWidth: 1,
 borderTopColor: "#1f2937",
 paddingTop: 10,
 marginTop: 10
 },
 draftChannel: {
 color: "#fb923c",
 fontWeight: "700",
 marginBottom: 4
 },
 draftSubject: {
 color: "#f8fafc",
 fontWeight: "600",
 marginBottom: 4
 },
 draftBody: {
 color: "#cbd5e1",
 marginBottom: 6
 },
 draftStatus: {
 color: "#94a3b8",
 marginBottom: 8
 },
 actionRow: {
 flexDirection: "row",
 gap: 10
 },
 actionButton: {
 borderWidth: 1,
 borderColor: "#22c55e",
 borderRadius: 10,
 paddingHorizontal: 12,
 paddingVertical: 8
 },
 actionButtonText: {
 color: "#4ade80",
 fontWeight: "700"
 },
 rejectButton: {
 borderWidth: 1,
 borderColor: "#ef4444",
 borderRadius: 10,
 paddingHorizontal: 12,
 paddingVertical: 8
 },
 rejectButtonText: {
 color: "#f87171",
 fontWeight: "700"
 },
 emptyText: {
 color: "#94a3b8",
 marginTop: 10
 }
});

