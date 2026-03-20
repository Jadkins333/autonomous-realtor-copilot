import { NextRequest, NextResponse } from "next/server";

const BASE_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PROXY_TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS || 15000);

export function buildProxyTarget(pathSegments: string[] = [], queryString: string) {
  const normalized = pathSegments.map((segment) => encodeURIComponent(segment)).join("/");
  return `${BASE_URL}/${normalized}${queryString}`;
}

function sanitizeRequestHeaders(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  return headers;
}

function sanitizeResponseHeaders(response: Response) {
  const headers = new Headers(response.headers);
  headers.delete("content-encoding");
  headers.delete("transfer-encoding");
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Authorization, Cookie");
  return headers;
}

async function forwardOnce(request: NextRequest, target: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const init: RequestInit = {
      method: request.method,
      headers: sanitizeRequestHeaders(request),
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal
    };

    if (!["GET", "HEAD"].includes(request.method)) {
      init.body = await request.arrayBuffer();
    }

    return await fetch(target, init);
  } finally {
    clearTimeout(timeoutId);
  }
}

function shouldRetry(method: string, response?: Response, error?: unknown) {
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    return false;
  }
  if (response && [502, 503, 504].includes(response.status)) {
    return true;
  }
  return error instanceof Error && error.name === "AbortError";
}

function errorResponse(status: number, detail: string, target: string) {
  return NextResponse.json(
    {
      detail,
      target
    },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        Vary: "Authorization, Cookie"
      }
    }
  );
}

export async function proxyRequest(request: NextRequest, pathSegments: string[]) {
  const target = buildProxyTarget(pathSegments, request.nextUrl.search);

  let response: Response | undefined;
  try {
    response = await forwardOnce(request, target);
    if (shouldRetry(request.method, response)) {
      response = await forwardOnce(request, target);
    }
  } catch (error) {
    if (shouldRetry(request.method, undefined, error)) {
      try {
        response = await forwardOnce(request, target);
      } catch (retryError) {
        const detail = retryError instanceof Error ? retryError.message : "Upstream request failed";
        return errorResponse(504, detail, target);
      }
    } else {
      const detail = error instanceof Error ? error.message : "Upstream request failed";
      return errorResponse(502, detail, target);
    }
  }

  if (!response) {
    return errorResponse(502, "Upstream response missing", target);
  }

  return new NextResponse(response.body, {
    status: response.status,
    headers: sanitizeResponseHeaders(response)
  });
}
