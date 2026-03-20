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
  status: "ok" | "warning" | string;
  message: string;
  update_window_days?: number | null;
};

export function summarizeDisclosureStatus(status?: DisclosureStatus | null) {
  if (!status || status.allowed) {
    return {
      blocked: false,
      title: "No disclosure block",
      messages: [] as string[],
      blockingDisclosures: [] as BlockingDisclosure[]
    };
  }

  const messages = Array.from(
    new Set(
      [status.human_readable_messages?.[0], ...status.human_readable_messages, ...status.blocking_disclosures.map((item) => item.summary)]
        .filter((value): value is string => Boolean(value))
    )
  );

  return {
    blocked: true,
    title: messages[0] || "Review and acknowledge the applicable disclosure before continuing.",
    messages,
    blockingDisclosures: status.blocking_disclosures || []
  };
}

export function summarizeLastUpdated(compliance?: PublicPageCompliance | null) {
  if (!compliance || !compliance.last_updated_at) {
    return {
      tone: "warning" as const,
      label: "Last updated unavailable",
      helper: compliance?.message || "Review freshness before presenting this information as current."
    };
  }

  return {
    tone: compliance.status === "warning" ? ("warning" as const) : ("neutral" as const),
    label: `Last updated: ${new Date(compliance.last_updated_at).toLocaleString()}`,
    helper: compliance.message
  };
}
