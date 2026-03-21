import { describe, expect, it } from "vitest";

import { summarizeDisclosureStatus, summarizeLastUpdated } from "./compliance-ui";

describe("compliance ui helpers", () => {
  it("summarizes blocking disclosure state", () => {
    const summary = summarizeDisclosureStatus({
      allowed: false,
      reason_codes: ["agency_relationship_required"],
      human_readable_messages: [
        "This workflow is blocked until the required Ohio disclosure is completed.",
        "Review and acknowledge the applicable disclosure before continuing."
      ],
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
    });

    expect(summary.blocked).toBe(true);
    expect(summary.title).toContain("blocked");
    expect(summary.messages).toContain("Review and acknowledge the applicable disclosure before continuing.");
    expect(summary.blockingDisclosures).toHaveLength(1);
  });

  it("renders warning state when last-updated metadata is unavailable", () => {
    const summary = summarizeLastUpdated({
      status: "warning",
      message: "Last updated date is unavailable. Review freshness before presenting this information as current.",
      last_updated_at: null
    });

    expect(summary.tone).toBe("warning");
    expect(summary.label).toBe("Last updated unavailable");
  });

  it("renders dated warning state when freshness is stale", () => {
    const summary = summarizeLastUpdated({
      status: "warning",
      message: "Freshness metadata indicates this information needs review before it is presented as current.",
      last_updated_at: "2026-03-01T12:00:00Z"
    });

    expect(summary.tone).toBe("warning");
    expect(summary.label).toContain("Last updated:");
  });
});
