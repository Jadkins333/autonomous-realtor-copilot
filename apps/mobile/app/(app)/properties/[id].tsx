import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useLocalSearchParams } from "expo-router";

import { ProvenanceModal } from "../../../components/provenance-modal";
import { acknowledgeDisclosure, evaluateDisclosures, getParcelDetail } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { summarizeDisclosureStatus, summarizeLastUpdated } from "../../../lib/compliance-ui";
import { buildMobilePropertyView } from "../../../lib/property-access";
import type { ParcelDetail } from "../../../lib/types";

export default function PropertyDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const [data, setData] = useState<ParcelDetail | null>(null);
  const [disclosureStatus, setDisclosureStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const [typedAcknowledgement, setTypedAcknowledgement] = useState("");

  const load = useCallback(async () => {
    if (!token || !params.id) return;
    setLoading(true);
    try {
      const [payload, disclosure] = await Promise.all([
        getParcelDetail(token, params.id),
        evaluateDisclosures(token, {
          action: "property_marketing_action",
          property_id: params.id,
          source: "mobile_property_detail",
          log_presentation: true
        })
      ]);
      setData(payload);
      setDisclosureStatus(disclosure);
    } finally {
      setLoading(false);
    }
  }, [params.id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const coordinates = useMemo(() => {
    const raw = data?.attributes_json?.coordinates;
    if (Array.isArray(raw) && raw.length === 2) {
      const longitude = Number(raw[0]);
      const latitude = Number(raw[1]);
      if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
        return { longitude, latitude };
      }
    }
    return { latitude: 39.9612, longitude: -82.9988 };
  }, [data]);
  const view = buildMobilePropertyView(data);
  const disclosureSummary = summarizeDisclosureStatus(disclosureStatus || data?.disclosure_status);
  const lastUpdatedSummary = summarizeLastUpdated(data?.public_page_compliance);

  const acknowledge = async (blockingDisclosure: any) => {
    if (!token || !params.id) return;
    if (blockingDisclosure.acknowledgement_mode !== "checkbox" && !typedAcknowledgement.trim()) {
      return;
    }
    const result = await acknowledgeDisclosure(token, {
      action: "property_marketing_action",
      disclosure_version_id: blockingDisclosure.disclosure_version_id,
      property_id: params.id,
      source: "mobile_property_detail",
      checkbox_acknowledged: blockingDisclosure.acknowledgement_mode === "checkbox",
      typed_acknowledgement:
        blockingDisclosure.acknowledgement_mode === "checkbox" ? undefined : typedAcknowledgement.trim()
    });
    setDisclosureStatus(result.disclosure_status);
    setTypedAcknowledgement("");
  };

  function handleShare() {
    Alert.alert("Share", view.canShare ? "Share is permitted for this property." : "Share is blocked for this source.");
  }

  function handleExport() {
    Alert.alert("Export", view.canExport ? "Export is permitted for this property." : "Export is blocked for this source.");
  }

  function handleOffline() {
    Alert.alert(
      "Offline access",
      view.canUseOffline
        ? "Offline caching is allowed for this property on controlled mobile surfaces."
        : "Offline caching is blocked for this source."
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl tintColor="#f97316" refreshing={loading} onRefresh={load} />}
    >
      <Text style={styles.title}>{data?.address || "Property Detail"}</Text>
      <Text style={styles.meta}>
        Parcel {data?.parcel_number || "-"} • {data?.city || "Columbus"}, {data?.state || "OH"}
      </Text>

      <View style={styles.badges}>
        <Text style={styles.badge}>Permits 12M: {data?.permits_summary?.last_12_months_count ?? "-"}</Text>
        <Text style={styles.badge}>Flood: {String(data?.flood_zone?.intersects ?? false)}</Text>
        <Text style={styles.badge}>Transit: {Math.round(Number(data?.transit_proximity?.score_0_100 ?? 0))}</Text>
        <Text style={styles.badge}>Origin: {view.originBadgeLabel}</Text>
        <Text style={styles.badge}>Freshness: {view.freshnessLabel}</Text>
        <Text style={styles.badge}>Truth State: {view.truthStateLabel}</Text>
      </View>
      <Text style={[styles.meta, lastUpdatedSummary.tone === "warning" ? styles.warning : null]}>{lastUpdatedSummary.label}</Text>
      <Text style={[styles.meta, lastUpdatedSummary.tone === "warning" ? styles.warning : null]}>{lastUpdatedSummary.helper}</Text>
      {disclosureSummary.blocked ? (
        <View style={styles.blockedCard}>
          <Text style={styles.cardTitle}>{disclosureSummary.title}</Text>
          {disclosureSummary.blockingDisclosures.map((item) => (
            <View key={item.disclosure_version_id} style={styles.disclosureRow}>
              <Text style={styles.insight}>{item.summary}</Text>
              {item.acknowledgement_mode !== "checkbox" ? (
                <TextInput
                  placeholder="Type acknowledgement"
                  placeholderTextColor="#64748b"
                  style={styles.input}
                  value={typedAcknowledgement}
                  onChangeText={setTypedAcknowledgement}
                />
              ) : null}
              <Pressable onPress={() => void acknowledge(item)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Acknowledge Disclosure</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.actions}>
        <Pressable disabled={!view.canShare} onPress={handleShare} style={[styles.actionButton, !view.canShare && styles.actionButtonDisabled]}>
          <Text style={styles.actionButtonText}>Share</Text>
        </Pressable>
        <Pressable disabled={!view.canExport} onPress={handleExport} style={[styles.actionButton, !view.canExport && styles.actionButtonDisabled]}>
          <Text style={styles.actionButtonText}>Export</Text>
        </Pressable>
        <Pressable disabled={!view.canUseOffline} onPress={handleOffline} style={[styles.actionButton, !view.canUseOffline && styles.actionButtonDisabled]}>
          <Text style={styles.actionButtonText}>Offline</Text>
        </Pressable>
      </View>
      {!!data?.attribution_requirements?.length ? (
        <Text style={styles.meta}>Attribution: {data.attribution_requirements.join(" | ")}</Text>
      ) : null}
      {view.blocked ? (
        <View style={styles.blockedCard}>
          <Text style={styles.cardTitle}>Restricted content</Text>
          <Text style={styles.insight}>{view.blockedMessage}</Text>
          {view.vowPrerequisites.length ? (
            <Text style={styles.meta}>Required prerequisites: {view.vowPrerequisites.join(", ")}</Text>
          ) : null}
        </View>
      ) : null}

      {view.canShowDataSections ? (
        <>
          <View style={styles.mapWrap}>
            <MapView
              style={styles.map}
              initialRegion={{
                ...coordinates,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02
              }}
            >
              <Marker coordinate={coordinates} title={data?.address || "Selected property"} />
            </MapView>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Nearby POIs</Text>
            {(data?.nearby_pois || []).map((poi: any) => (
              <Text key={`${poi.name}-${poi.distance_meters}`} style={styles.poiItem}>
                {poi.category}: {poi.name} ({poi.distance_meters}m)
              </Text>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Insights</Text>
            <Text style={styles.insight}>Renovation ROI: {data?.insights?.renovation_roi?.value?.roi_band || "-"}</Text>
            <Text style={styles.insight}>
              Insurance Pressure: {data?.insights?.insurance_pressure?.value?.pressure_level || "-"}
            </Text>
            <Pressable onPress={() => setProvenanceOpen(true)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>View Provenance</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Timeline</Text>
            {(data?.timeline || []).slice(0, 8).map((event: any) => (
              <View key={`${event.event_type}-${event.occurred_at}-${event.title}`} style={styles.timelineRow}>
                <Text style={styles.timelineTitle}>{event.title}</Text>
                <Text style={styles.timelineMeta}>{new Date(event.occurred_at).toLocaleString()}</Text>
              </View>
            ))}
            {!(data?.timeline || []).length ? <Text style={styles.insight}>No timeline events yet.</Text> : null}
          </View>
        </>
      ) : null}

      <ProvenanceModal
        visible={provenanceOpen}
        title="Property Insight Provenance"
        payload={{
          renovation_roi: data?.insights?.renovation_roi,
          insurance_pressure: data?.insights?.insurance_pressure
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
    padding: 14,
    gap: 12,
    paddingBottom: 30
  },
  title: {
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "800"
  },
  meta: {
    color: "#94a3b8"
  },
  warning: {
    color: "#fbbf24"
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  badge: {
    color: "#f8fafc",
    backgroundColor: "#1f2937",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999
  },
  actionButton: {
    borderWidth: 1,
    borderColor: "#f97316",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  actionButtonDisabled: {
    borderColor: "#374151",
    opacity: 0.55
  },
  actionButtonText: {
    color: "#fb923c",
    fontWeight: "700"
  },
  map: {
    height: 220,
    width: "100%"
  },
  mapWrap: {
    borderRadius: 12,
    overflow: "hidden"
  },
  card: {
    backgroundColor: "#111827",
    borderColor: "#1f2937",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12
  },
  blockedCard: {
    backgroundColor: "#1f1726",
    borderColor: "#7f1d1d",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12
  },
  disclosureRow: {
    marginTop: 10
  },
  cardTitle: {
    color: "#f8fafc",
    fontWeight: "700",
    marginBottom: 8
  },
  poiItem: {
    color: "#cbd5e1",
    marginBottom: 4
  },
  insight: {
    color: "#cbd5e1",
    marginBottom: 5
  },
  input: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#f8fafc",
    marginTop: 8
  },
  secondaryButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#f97316",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8
  },
  secondaryButtonText: {
    color: "#fb923c",
    fontWeight: "700"
  },
  timelineRow: {
    borderTopWidth: 1,
    borderTopColor: "#1f2937",
    paddingTop: 8,
    marginTop: 8
  },
  timelineTitle: {
    color: "#f8fafc",
    fontWeight: "600"
  },
  timelineMeta: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 2
  }
});
