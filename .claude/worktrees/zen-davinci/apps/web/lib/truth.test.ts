import { describe, expect, it } from "vitest";

import { isTruthMetricResponse } from "./truth";

describe("isTruthMetricResponse", () => {
  it("accepts valid truth metric payload", () => {
    const payload = {
      status: "ok",
      insufficient_data: false,
      formula_key: "micro_market_nowcast_v1",
      formula_version: "v1",
      formula_markdown: "formula",
      computed_at: "2026-03-05T00:00:00+00:00",
      value: { score: 42.1 },
      inputs: {
        permits_per_100_parcels_90d: { value: 3.2, fields: ["permits.id"], ids: ["tenant-1"] }
      },
      provenance: {
        sources: [
          {
            source_id: "source-1",
            raw_url: "seed://permits",
            freshness: {
              fetched_at: "2026-03-05T00:00:00+00:00",
              ttl_seconds: 3600,
              staleness: "fresh",
              is_stale: false
            }
          }
        ]
      },
      freshness: {
        fetched_at: "2026-03-05T00:00:00+00:00",
        ttl_seconds: 3600,
        staleness: "fresh",
        is_stale: false
      },
      coverage_summary: {
        coverage_pct: 100,
        required_total: 3,
        required_present: 3,
        missing_required: []
      }
    };

    expect(isTruthMetricResponse(payload)).toBe(true);
  });

  it("rejects payload without provenance and freshness fields", () => {
    const payload = {
      status: "ok",
      formula_key: "micro_market_nowcast_v1"
    };

    expect(isTruthMetricResponse(payload)).toBe(false);
  });
});
