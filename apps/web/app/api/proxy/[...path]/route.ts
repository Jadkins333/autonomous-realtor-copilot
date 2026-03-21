import { NextRequest } from "next/server";

import { proxyRequest } from "@/lib/proxy-route";

type ProxyContext = { params: { path: string[] } };

export async function GET(request: NextRequest, context: ProxyContext) {
  return proxyRequest(request, context.params.path);
}

export async function HEAD(request: NextRequest, context: ProxyContext) {
  return proxyRequest(request, context.params.path);
}

export async function POST(request: NextRequest, context: ProxyContext) {
  return proxyRequest(request, context.params.path);
}

export async function PUT(request: NextRequest, context: ProxyContext) {
  return proxyRequest(request, context.params.path);
}

export async function PATCH(request: NextRequest, context: ProxyContext) {
  return proxyRequest(request, context.params.path);
}

export async function DELETE(request: NextRequest, context: ProxyContext) {
  return proxyRequest(request, context.params.path);
}

export async function OPTIONS(request: NextRequest, context: ProxyContext) {
  return proxyRequest(request, context.params.path);
}
