import { describe, expect, it } from "vitest";

import {
  summarizeDisclosureStatus as summarizeMobileDisclosureStatus,
  summarizeLastUpdated as summarizeMobileLastUpdated
} from "../../mobile/lib/compliance-ui";
import {
  summarizeDisclosureBlock as summarizeMobileDisclosureBlock,
  summarizeFairHousing as summarizeMobileFairHousing,
  summarizePolicyState as summarizeMobilePolicyState
} from "../../mobile/lib/policy-presenter";
import { buildMobilePropertyView } from "../../mobile/lib/property-access";
import { summarizeDisclosureStatus, summarizeLastUpdated } from "./compliance-ui";
import {
  summarizeDisclosureBlock as summarizeWebDisclosureBlock,
  summarizeFairHousing as summarizeWebFairHousing,
  summarizePolicyState as summarizeWebPolicyState
} from "./policy-presenter";
import { buildWebPropertyView } from "./property-access";

describe("web/mobile policy parity", () => {
  it("matches sandbox/live policy outcome rendering", () => {
    const allowed = {
      allowed: true,
      reason_codes: [],
      human_readable_explanations: [],
      delivery_mode: "sandbox"
    };
    const blocked = {
      allowed: false,
      reason_codes: ["quiet_hours", "suppressed_contact"],
      human_readable_explanations: ["Blocked"],
      delivery_mode: "live"
    };

    expect(summarizeWebPolicyState(allowed)).toBe(summarizeMobilePolicyState(allowed));
    expect(summarizeWebPolicyState(blocked)).toBe(summarizeMobilePolicyState(blocked));
  });

  it("matches fair-housing rendering", () => {
    const scan = {
      blocked: true,
      flagged_terms: ["ideal for families"],
      reason_codes: ["fair_housing_flagged"],
      explanations: ["Flagged fair-housing phrase"]
    };

    expect(summarizeWebFairHousing(scan)).toBe(summarizeMobileFairHousing(scan));
  });

  it("matches disclosure block indicators", () => {
    const decision = {
      allowed: false,
      reason_codes: ["disclosure_required", "consent_proof_missing"],
      human_readable_explanations: ["Disclosure missing"],
      delivery_mode: "live"
    };
    const status = {
      allowed: false,
      reason_codes: ["agency_relationship_required"],
      human_readable_messages: ["This workflow is blocked until the required Ohio disclosure is completed."],
      jurisdiction: "OH",
      blocking_disclosures: [
        {
          disclosure_version_id: "v1",
          title: "Ohio agency relationship disclosure",
          summary: "Review and acknowledge the applicable disclosure before continuing.",
          acknowledgement_mode: "checkbox",
          human_readable_message: "This workflow is blocked until the required Ohio disclosure is completed.",
          reason_code: "agency_relationship_required"
        }
      ]
    };

    expect(summarizeWebDisclosureBlock(decision)).toBe(summarizeMobileDisclosureBlock(decision));
    expect(summarizeDisclosureStatus(status)).toEqual(summarizeMobileDisclosureStatus(status));
  });

  it("matches freshness and source-origin indicators", () => {
    const record = {
      source_origin: "vow",
      freshness: {
        fetched_at: "2026-03-19T12:00:00Z",
        staleness: "stale",
        is_stale: true
      },
      provenance: {
        freshness: {
          fetched_at: "2026-03-19T12:00:00Z",
          staleness: "stale",
          is_stale: true
        },
        conflict_state: "conflicted"
      },
      display_policy: {
        current_surface_allowed: true,
        can_export: false,
        can_cache_offline: false,
        can_use_in_mobile: true,
        required_prerequisites: ["vow_registration"]
      },
      restricted_content: {
        blocked: false,
        reason_codes: []
      },
      restricted_actions: ["export"],
      attribution_requirements: ["Display broker attribution"]
    };

    expect(buildWebPropertyView(record)).toEqual(buildMobilePropertyView(record as any));
  });

  it("matches last-updated summaries", () => {
    const compliance = {
      status: "warning",
      message: "Freshness metadata indicates this information needs review before it is presented as current.",
      last_updated_at: "2026-03-01T12:00:00Z"
    };

    expect(summarizeLastUpdated(compliance)).toEqual(summarizeMobileLastUpdated(compliance));
  });
});
