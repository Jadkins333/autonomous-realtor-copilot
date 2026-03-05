import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useLocalSearchParams } from "expo-router";

import { ProvenanceModal } from "../../../components/provenance-modal";
import { getParcelDetail } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";

export default function PropertyDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [provenanceOpen, setProvenanceOpen] = useState(false);

  const load = useCallback(async () => {
    if (!token || !params.id) return;
    setLoading(true);
    try {
      const payload = await getParcelDetail(token, params.id);
      setData(payload);
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
      </View>

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
  badges: {
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
  }
});
