export type DemoUser = {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  role: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: DemoUser;
};

export type ParcelSummary = {
  id: string;
  parcel_number: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  updated_at: string;
  source_origin: SourceOrigin;
  field_origin_mode: string;
  display_policy: PropertyDisplayPolicy;
  freshness: PropertyFreshness;
  attribution_requirements: string[];
  restricted_actions: string[];
  restricted_content: RestrictedContentState;
  vow_registration?: VowRegistrationState | null;
};

export type SourceOrigin =
  | "public_record"
  | "broker_owned"
  | "idx"
  | "vow"
  | "licensed_feed_other"
  | "unknown_restricted";

export type PropertyDisplayPolicy = {
  can_display_public: boolean;
  can_display_authenticated: boolean;
  requires_vow_registration: boolean;
  can_cache_offline: boolean;
  can_export: boolean;
  can_use_in_ai_summary: boolean;
  can_use_in_mobile: boolean;
  block_reason_codes: string[];
  required_prerequisites: string[];
  current_surface: string;
  current_surface_allowed: boolean;
};

export type PropertyFreshness = {
  fetched_at?: string | null;
  ttl_seconds?: number | null;
  staleness: string;
  is_stale?: boolean | null;
};

export type BlockingDisclosure = {
  disclosure_version_id: string;
  title: string;
  summary: string;
  acknowledgement_mode: string;
  human_readable_message: string;
  reason_code: string;
};

export type DisclosureStatus = {
  allowed: boolean;
  blocking_disclosures: BlockingDisclosure[];
  reason_codes: string[];
  human_readable_messages: string[];
  jurisdiction?: string | null;
};

export type PublicPageCompliance = {
  jurisdiction?: string | null;
  last_updated_at?: string | null;
  status: string;
  message: string;
  update_window_days?: number | null;
};

export type RestrictedContentState = {
  blocked: boolean;
  title?: string | null;
  message?: string | null;
  reason_codes: string[];
};

export type VowRegistrationState = {
  market?: string | null;
  source_name?: string | null;
  enabled_for_market_source: boolean;
  registrant_name?: string | null;
  registrant_email?: string | null;
  valid_email: boolean;
  terms_of_use_acknowledged: boolean;
  verification_state: string;
  accepted_at?: string | null;
  acceptance_record?: Record<string, unknown> | null;
  terms_version?: string | null;
};

export type ParcelDetail = ParcelSummary & {
  attributes_json: Record<string, any>;
  provenance: Record<string, any>;
  disclosure_status?: DisclosureStatus | null;
  public_page_compliance?: PublicPageCompliance | null;
  permits_summary: Record<string, any>;
  flood_zone: Record<string, any>;
  nearby_pois: Array<Record<string, any>>;
  transit_proximity: Record<string, any>;
  timeline: Array<Record<string, any>>;
  insights: Record<string, any>;
};

export type Contact = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  timezone?: string | null;
  tags_json: string[];
  notes?: string | null;
  created_at: string;
};

export type FairHousingScan = {
  blocked: boolean;
  flagged_terms: string[];
  reason_codes: string[];
  explanations: string[];
};

export type PolicyDecision = {
  allowed: boolean;
  reason_codes: string[];
  human_readable_explanations: string[];
  evaluated_at: string;
  recipient_timezone_used?: string | null;
  consent_evidence_refs: string[];
  delivery_mode: string;
  fair_housing_scan?: FairHousingScan | null;
};

export type SendAttempt = {
  id: string;
  final_status: string;
  provider_selected?: string | null;
  provider_message_id?: string | null;
  completed_at?: string | null;
  policy_snapshot?: PolicyDecision | null;
};

export type OutreachDraft = {
  id: string;
  pack_id?: string | null;
  property_id?: string | null;
  contact_id: string;
  channel: string;
  subject?: string | null;
  body: string;
  status: string;
  created_at: string;
  approval_state: string;
  compliance_snapshot?: PolicyDecision | null;
  disclosure_status?: DisclosureStatus | null;
  fair_housing_scan?: FairHousingScan | null;
  sandbox_indicator?: string | null;
  last_send_attempt?: SendAttempt | null;
};

export type DraftActionResult = {
  id: string;
  pack_id?: string | null;
  status: string;
  approval_state: string;
  pack_status?: string | null;
  reason?: string | null;
  reason_codes: string[];
  explanations: string[];
  policy_snapshot?: PolicyDecision | null;
  disclosure_status?: DisclosureStatus | null;
  send_attempt_id?: string | null;
};

export type CitySnapshot = {
  metric_key: string;
  version: string;
  formula_markdown: string;
  computed_at: string;
  value: {
    score_0_100: number;
    components: Record<string, number>;
    rationale: string;
  };
  inputs: Record<string, unknown>;
  provenance: Record<string, unknown>;
};

export type OpportunityItem = {
  parcel_id: string;
  address: string;
  parcel_number: string;
  city: string;
  state: string;
  zip: string;
  opportunity_flags: string[];
  status: "ok" | "insufficient_data";
  missing_inputs: string[];
  event_signal?: {
    count_30d?: number;
    latest?: {
      event_type?: string;
      severity?: string;
      created_at?: string;
    } | null;
  };
  neighborhood_heat: {
    value?: { score_0_100?: number };
  };
  distress_likelihood: {
    value?: { score_0_1?: number };
  };
};

export type OpportunitiesResponse = {
  status: "ok" | "insufficient_data";
  model_version?: string;
  items: OpportunityItem[];
};

export type TodayWorkspace = {
  summary: {
    open_tasks: number;
    overdue_tasks: number;
    due_today: number;
    active_deals: number;
    deals_at_risk: number;
    follow_ups_due: number;
  };
  coach_alerts: Array<{
    id: string;
    title: string;
    detail: string;
    href: string;
    cta_label: string;
    tone: string;
  }>;
  follow_ups: Array<{
    id: string;
    name: string;
    stage: string;
    next_step_note?: string | null;
  }>;
  deals_at_risk: Array<{
    id: string;
    title: string;
    stage: string;
  }>;
};

export type SourceStatusItem = {
 source_name: string;
 mode: string;
};

export type SourceStatusResponse = {
 items: SourceStatusItem[];
};

export type DraftPackDraft = {
 id: string;
 pack_id?: string;
 contact_id: string;
 channel: string;
 subject?: string;
 body: string;
 status: string;
 created_at: string;
 compliance_snapshot?: PolicyDecision | null;
 disclosure_status?: DisclosureStatus | null;
 fair_housing_scan?: FairHousingScan | null;
};

export type DraftPack = {
 id: string;
 created_at: string;
 created_by_user_id: string;
 parcel_id?: string;
 contact_id?: string;
 status: string;
 sandbox: boolean;
 objective: string;
 drafts: DraftPackDraft[];
};

export type DraftPacksResponse = {
 items: DraftPack[];
 next_cursor?: string;
};

export type DraftPackSubmitResponse = {
 id: string;
 status: string;
 submitted_at: string;
};

export type DraftActionResponse = {
 id: string;
 pack_id?: string;
 status: string;
 approval_state: string;
 pack_status?: string;
 reason?: string;
};
