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
};

export type Contact = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  tags_json: string[];
  notes?: string | null;
  created_at: string;
};

export type OutreachDraft = {
  id: string;
  contact_id: string;
  channel: string;
  subject?: string | null;
  body: string;
  status: string;
  created_at: string;
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
