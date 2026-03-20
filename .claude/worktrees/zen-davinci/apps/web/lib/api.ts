import { API_PROXY_BASE } from "@/lib/env";

function toProxyPath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_PROXY_BASE}${normalized}`;
}

export async function apiFetch<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const headers = new Headers(init?.headers || {});
  Object.entries(baseHeaders).forEach(([key, value]) => headers.set(key, value));
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(toProxyPath(path), {
    ...init,
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `API request failed for ${path}`);
  }

  return (await response.json()) as T;
}
