
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { getSourcesStatus } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import type { SourceStatusItem } from "../lib/types";

const REFRESH_MS = 30_000;
const CRITICAL_SOURCES = new Set([
 "franklin_auditor",
 "columbus_arcgis_permits",
 "fema_nfhl",
 "osm_overpass",
 "cota_gtfs"
]);

export function FixtureModeBanner() {
 const { token } = useAuth();
 const [items, setItems] = useState<SourceStatusItem[]>([]);
 const [warning, setWarning] = useState("");

 useEffect(() => {
 if (!token) {
 setItems([]);
 setWarning("");
 return;
 }

 let active = true;

 const load = async () => {
 try {
 const response = await getSourcesStatus(token);
 if (!active) {
 return;
 }
 setItems(response.items ?? []);
 setWarning("");
 } catch (error) {
 if (__DEV__) {
 console.warn("fixture mode status fetch failed", error);
 setWarning("Fixture status refresh failed.");
 }
 }
 };

 void load();
 const timer = setInterval(() => {
 void load();
 }, REFRESH_MS);

 return () => {
 active = false;
 clearInterval(timer);
 };
 }, [token]);
 const fixtureEnabled = useMemo(
 () =>
 items.some((item) => {
 if (!CRITICAL_SOURCES.has(item.source_name)) {
 return false;
 }
 return item.mode === "fixture";
 }),
 [items]
 );

 if (!fixtureEnabled && !warning) {
 return null;
 }

 const message = fixtureEnabled
 ? "Fixture mode: demo data in use. Live sources not connected."
 : warning;

 return (
 <View style={styles.banner}>
 <Text style={styles.text}>{message}</Text>
 </View>
 );
}

const styles = StyleSheet.create({
 banner: {
 backgroundColor: "#7c2d12",
 borderBottomColor: "#f59e0b",
 borderBottomWidth: 1,
 paddingHorizontal: 12,
 paddingVertical: 8
 },
 text: {
 color: "#ffedd5",
 fontSize: 12,
 fontWeight: "600"
 }
});

