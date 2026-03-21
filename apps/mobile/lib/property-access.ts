import type { ParcelDetail, ParcelSummary, SourceOrigin } from "./types";

type PropertyRecord = ParcelDetail | ParcelSummary | null | undefined;

export function buildMobilePropertyView(record: PropertyRecord) {
  const sourceOrigin = record?.source_origin ?? "unknown_restricted";
  const policy = record?.display_policy;
  const restricted = record?.restricted_content;
  const provenance = (record as ParcelDetail | null | undefined)?.provenance;
  const freshness = record?.freshness ?? (provenance?.freshness as ParcelDetail["freshness"] | undefined);
  const blocked = Boolean(restricted?.blocked || policy?.current_surface_allowed === false);
  const truthState =
    (record as any)?.truth_state ||
    (record as any)?.provenance?.truth_state ||
    (record as any)?.provenance?.conflict_state ||
    ((record as any)?.provenance?.is_conflicted ? "conflicted" : freshness?.staleness || "unknown");

  return {
    blocked,
    blockedMessage: restricted?.message ?? "Property details are blocked on this surface.",
    blockedReasonCodes: restricted?.reason_codes ?? [],
    originBadgeLabel: formatSourceOrigin(sourceOrigin),
    freshnessLabel: freshness?.staleness ?? "unknown",
    lastUpdatedLabel: freshness?.fetched_at ?? "unavailable",
    truthStateLabel: truthState,
    canShowDataSections: !blocked,
    canShare: Boolean(policy?.can_export),
    canExport: Boolean(policy?.can_export),
    canUseOffline: Boolean(policy?.can_cache_offline),
    canShowMobileDetail: Boolean(policy?.can_use_in_mobile),
    restrictedActions: record?.restricted_actions ?? [],
    attributionRequirements: record?.attribution_requirements ?? [],
    vowPrerequisites: policy?.required_prerequisites ?? []
  };
}

export function formatSourceOrigin(origin: SourceOrigin | string) {
  return String(origin)
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
