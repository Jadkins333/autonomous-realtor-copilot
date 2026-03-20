import { NextRequest, NextResponse } from "next/server";

const BASE_URL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";
const PROXY_TIMEOUT_MS = 15000;

type ProxyContext = { params: { path?: string[] } };

function buildTarget(pathSegments: string[] = [], queryString: string) {
  const normalized = pathSegments
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${BASE_URL}/${normalized}${queryString}`;
}

async function proxy(request: NextRequest, pathSegments: string[] = []) {
  const target = buildTarget(pathSegments, request.nextUrl.search);

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
    signal: controller.signal
  };

  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  try {
    const response = await fetch(target, init);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("transfer-encoding");

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        error: timedOut ? "proxy_timeout" : "proxy_unavailable",
        detail: timedOut
          ? "API upstream timed out"
          : "API upstream is unavailable"
      },
      { status: 503 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET(request: NextRequest, context: ProxyContext) {
  return proxy(request, context.params.path);
}

export async function HEAD(request: NextRequest, context: ProxyContext) {
  return proxy(request, context.params.path);
}

export async function POST(request: NextRequest, context: ProxyContext) {
  return proxy(request, context.params.path);
}

export async function PUT(request: NextRequest, context: ProxyContext) {
  return proxy(request, context.params.path);
}

export async function PATCH(request: NextRequest, context: ProxyContext) {
  return proxy(request, context.params.path);
}

export async function DELETE(request: NextRequest, context: ProxyContext) {
  return proxy(request, context.params.path);
}

export async function OPTIONS(request: NextRequest, context: ProxyContext) {
  return proxy(request, context.params.path);
}
