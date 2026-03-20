import type {
  AuthResponse,
  CitySnapshot,
  Contact,
  DisclosureStatus,
  DraftActionResult,
  OpportunitiesResponse,
  OutreachDraft,
  ParcelDetail,
  ParcelSummary
} from "./types";

declare const process: { env: Record<string, string | undefined> };

const BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  token?: string | null;
  body?: unknown;
  headers?: Record<string, string>;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  Object.assign(headers, options.headers || {});

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${path}`);
  }

  return (await response.json()) as T;
}

export function getApiBaseUrl() {
  return BASE_URL;
}

export function login(email: string, password: string) {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: { email, password }
  });
}

export function getMetrics(token: string) {
  return request<Record<string, unknown>>("/metrics", { token });
}

export function getCitySnapshot(token: string) {
  return request<CitySnapshot>("/insights/city/columbus", { token });
}

export function listOpportunities(token: string) {
  return request<OpportunitiesResponse>("/opportunities", { token });
}

export function searchParcels(token: string, query: string) {
  return request<ParcelSummary[]>(`/parcels/search?query=${encodeURIComponent(query)}`, {
    token,
    headers: { "x-client-surface": "mobile" }
  });
}

export function getParcelDetail(token: string, parcelId: string) {
  return request<ParcelDetail>(`/parcels/${parcelId}`, {
    token,
    headers: { "x-client-surface": "mobile" }
  });
}

export function listContacts(token: string) {
  return request<Contact[]>("/contacts", { token });
}

export function createContact(
  token: string,
  payload: { name: string; email?: string | null; phone?: string | null; tags_json?: string[]; notes?: string | null }
) {
  return request<Contact>("/contacts", {
    method: "POST",
    token,
    body: payload
  });
}

export function updateContact(
  token: string,
  id: string,
  payload: { name?: string; email?: string | null; phone?: string | null; tags_json?: string[]; notes?: string | null }
) {
  return request<Contact>(`/contacts/${id}`, {
    method: "PUT",
    token,
    body: payload
  });
}

export function listOutreachDrafts(token: string) {
  return request<OutreachDraft[]>("/outreach/drafts", { token });
}

export function approveDraft(token: string, messageId: string) {
  return request<DraftActionResult>(`/outreach/drafts/${messageId}/approve`, {
    method: "POST",
    token
  });
}

export function evaluateDisclosures(
  token: string,
  payload: {
    action: string;
    contact_id?: string | null;
    property_id?: string | null;
    source?: string;
    log_presentation?: boolean;
  }
) {
  return request<DisclosureStatus>("/disclosures/evaluate", {
    method: "POST",
    token,
    body: payload
  });
}

export function acknowledgeDisclosure(
  token: string,
  payload: {
    action: string;
    disclosure_version_id: string;
    contact_id?: string | null;
    property_id?: string | null;
    source?: string;
    checkbox_acknowledged?: boolean;
    typed_acknowledgement?: string;
  }
) {
  return request<{ disclosure_status: DisclosureStatus }>("/disclosures/acknowledge", {
    method: "POST",
    token,
    body: payload
  });
}

export function copilotChat(token: string, message: string) {
  return request<any>("/copilot/chat", {
    method: "POST",
    token,
    body: { message }
  });
}

export function getCopilotAgents(token: string) {
  return request<Array<{ key: string; name: string; description: string }>>("/copilot/agents", {
    token
  });
}
