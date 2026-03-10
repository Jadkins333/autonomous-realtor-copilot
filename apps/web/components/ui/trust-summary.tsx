import React from "react";

type FreshnessInfo = {
  staleness?: string | null;
  fetched_at?: string | null;
};

type TrustSummaryProps = {
  label: string;
  verifiedAt?: string | null;
  officialUpdatedAt?: string | null;
  freshness?: FreshnessInfo | null;
  reference?: string | null;
  note?: string | null;
  testId?: string;
};

function formatTimestamp(value?: string | null): string {
  if (!value) {
    return "Unavailable";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatFreshness(freshness?: FreshnessInfo | null): string {
  if (!freshness) {
    return "Unknown";
  }

  const badge = freshness.staleness
    ? freshness.staleness.replaceAll("_", " ")
    : "unknown";
  const fetchedAt = formatTimestamp(freshness.fetched_at);

  if (!freshness.fetched_at) {
    return badge;
  }

  return `${badge} - checked ${fetchedAt}`;
}

export function TrustSummary({
  label,
  verifiedAt,
  officialUpdatedAt,
  freshness,
  reference,
  note,
  testId,
}: TrustSummaryProps) {
  return (
    <div data-testid={testId}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="detail-item">
          <p className="detail-item-label">Label</p>
          <p className="detail-item-value">{label}</p>
        </div>
        <div className="detail-item">
          <p className="detail-item-label">Verified at</p>
          <p className="detail-item-value">{formatTimestamp(verifiedAt)}</p>
        </div>
        <div className="detail-item">
          <p className="detail-item-label">Source freshness</p>
          <p className="detail-item-value">{formatFreshness(freshness)}</p>
        </div>
        <div className="detail-item">
          <p className="detail-item-label">Last official update</p>
          <p className="detail-item-value">{formatTimestamp(officialUpdatedAt)}</p>
        </div>
      </div>

      {reference ? (
        <p className="mt-4 break-all text-sm text-muted-foreground">
          Source reference: {reference}
        </p>
      ) : null}

      {note ? <p className="soft-note mt-3">{note}</p> : null}
    </div>
  );
}
