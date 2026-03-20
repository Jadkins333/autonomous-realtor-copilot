export type FairHousingScanLike = {
  blocked: boolean;
  flagged_terms: string[];
  reason_codes: string[];
  explanations: string[];
};

export type PolicyDecisionLike = {
  allowed: boolean;
  reason_codes: string[];
  human_readable_explanations: string[];
  delivery_mode: string;
  fair_housing_scan?: FairHousingScanLike | null;
};

export function summarizePolicyState(decision?: PolicyDecisionLike | null) {
  if (!decision) {
    return "not yet evaluated";
  }
  return decision.allowed ? "pass" : decision.reason_codes.join(", ");
}

export function summarizeFairHousing(scan?: FairHousingScanLike | null) {
  if (!scan?.blocked) {
    return null;
  }
  return scan.flagged_terms.join(", ");
}

export function summarizeDisclosureBlock(decision?: PolicyDecisionLike | null) {
  if (!decision) {
    return null;
  }
  if (decision.reason_codes.includes("disclosure_required")) {
    return "disclosure required";
  }
  if (decision.reason_codes.includes("consent_proof_missing")) {
    return "consent proof incomplete";
  }
  return null;
}
