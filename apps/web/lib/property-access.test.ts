import { describe, expect, it } from "vitest";

import { buildMobilePropertyView } from "../../mobile/lib/property-access";
import { buildWebPropertyView } from "./property-access";

const basePolicy = {
  can_display_public: true,
  can_display_authenticated: true,
  requires_vow_registration: false,
  can_cache_offline: true,
  can_export: true,
  can_use_in_ai_summary: true,
  can_use_in_mobile: true,
  block_reason_codes: [],
  required_prerequisites: [],
  current_surface: "web",
  current_surface_allowed: true,
};

describe("property access view models", () => {
  it("renders public-record web state as fully available", () => {
    const view = buildWebPropertyView({
      source_origin: "public_record",
      display_policy: basePolicy,
      restricted_content: { blocked: false, reason_codes: [] },
      restricted_actions: [],
      attribution_requirements: [],
    });

    expect(view.blocked).toBe(false);
    expect(view.canExport).toBe(true);
    expect(view.canUseOffline).toBe(true);
    expect(view.originBadgeLabel).toBe("Public Record");
  });

  it("renders unknown_restricted web state as blocked", () => {
    const view = buildWebPropertyView({
      source_origin: "unknown_restricted",
      display_policy: {
        ...basePolicy,
        can_cache_offline: false,
        can_export: false,
        can_use_in_mobile: false,
        current_surface_allowed: false,
        block_reason_codes: ["unknown_restricted_origin"],
      },
      restricted_content: {
        blocked: true,
        message: "Restricted source-origin data is blocked until it is explicitly classified and configured.",
        reason_codes: ["unknown_restricted_origin"],
      },
      restricted_actions: ["display", "export", "share", "offline_cache"],
      attribution_requirements: [],
    });

    expect(view.blocked).toBe(true);
    expect(view.canExport).toBe(false);
    expect(view.canUseOffline).toBe(false);
    expect(view.blockedMessage).toContain("explicitly classified");
  });

  it("renders idx mobile state with offline/export disabled", () => {
    const view = buildMobilePropertyView({
      id: "1",
      parcel_number: "010-123",
      address: "145 N High St",
      city: "Columbus",
      state: "OH",
      zip: "43215",
      updated_at: "2026-03-19T12:00:00+00:00",
      source_origin: "idx",
      field_origin_mode: "record_level",
      display_policy: {
        ...basePolicy,
        can_cache_offline: false,
        can_export: false,
        can_use_in_ai_summary: false,
        current_surface: "mobile",
      },
      freshness: { staleness: "fresh" },
      attribution_requirements: ["Display broker attribution"],
      restricted_actions: ["export", "share", "offline_cache", "ai_summary"],
      restricted_content: { blocked: false, reason_codes: [] },
      vow_registration: null,
    });

    expect(view.blocked).toBe(false);
    expect(view.canExport).toBe(false);
    expect(view.canUseOffline).toBe(false);
    expect(view.originBadgeLabel).toBe("Idx");
  });

  it("renders vow mobile state as deterministically blocked until prerequisites are met", () => {
    const view = buildMobilePropertyView({
      id: "2",
      parcel_number: "Restricted",
      address: "Restricted property detail",
      city: "Restricted",
      state: "",
      zip: "",
      updated_at: "2026-03-19T12:00:00+00:00",
      source_origin: "vow",
      field_origin_mode: "record_level",
      display_policy: {
        ...basePolicy,
        can_display_public: false,
        can_display_authenticated: false,
        requires_vow_registration: true,
        can_cache_offline: false,
        can_export: false,
        can_use_in_ai_summary: false,
        can_use_in_mobile: false,
        current_surface: "mobile",
        current_surface_allowed: false,
        block_reason_codes: ["vow_prerequisites_incomplete", "mobile_display_not_permitted"],
        required_prerequisites: ["registrant_name", "valid_email", "terms_of_use_acknowledgement", "verification"],
      },
      freshness: { staleness: "unknown" },
      attribution_requirements: [],
      restricted_actions: ["display", "export", "share", "offline_cache"],
      restricted_content: {
        blocked: true,
        message: "VOW registration prerequisites are required before this property can be displayed.",
        reason_codes: ["vow_prerequisites_incomplete"],
      },
      vow_registration: {
        enabled_for_market_source: true,
        valid_email: false,
        terms_of_use_acknowledged: false,
        verification_state: "not_started",
      },
    });

    expect(view.blocked).toBe(true);
    expect(view.canShowDataSections).toBe(false);
    expect(view.vowPrerequisites).toContain("verification");
    expect(view.blockedMessage).toContain("VOW registration");
  });
});
