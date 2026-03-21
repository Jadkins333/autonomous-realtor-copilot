export type WebPropertyRestrictionRecord = {
  source_origin?: string;
  freshness?: {
    fetched_at?: string | null;
    staleness?: string;
    is_stale?: boolean | null;
  } | null;
  provenance?: {
    freshness?: {
      fetched_at?: string | null;
      staleness?: string;
      is_stale?: boolean | null;
    } | null;
    truth_state?: string | null;
    conflict_state?: string | null;
    is_conflicted?: boolean | null;
  } | null;
  truth_state?: string | null;
  display_policy?: {
    current_surface_allowed?: boolean;
    can_export?: boolean;
    can_cache_offline?: boolean;
    can_use_in_mobile?: boolean;
    block_reason_codes?: string[];
    required_prerequisites?: string[];
  } | null;
  restricted_content?: {
    blocked?: boolean;
    message?: string | null;
    reason_codes?: string[];
  } | null;
  restricted_actions?: string[];
  attribution_requirements?: string[];
} | null;

export function buildWebPropertyView(record: WebPropertyRestrictionRecord) {
  const sourceOrigin = record?.source_origin ?? "unknown_restricted";
  const policy = record?.display_policy;
  const restricted = record?.restricted_content;
  const freshness = record?.freshness ?? record?.provenance?.freshness;
  const blocked = Boolean(restricted?.blocked || policy?.current_surface_allowed === false);
  const truthState =
    record?.truth_state ||
    record?.provenance?.truth_state ||
    record?.provenance?.conflict_state ||
    (record?.provenance?.is_conflicted ? "conflicted" : freshness?.staleness || "unknown");

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

export function formatSourceOrigin(origin: string) {
  return String(origin)
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
