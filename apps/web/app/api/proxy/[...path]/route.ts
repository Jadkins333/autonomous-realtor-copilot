import { NextRequest } from "next/server";

import { proxyRequest } from "@/lib/proxy-route";

export async function GET(request: NextRequest, context: { params: { path: string[] } }) {
  return proxyRequest(request, context.params.path);
}

export async function POST(request: NextRequest, context: { params: { path: string[] } }) {
  return proxyRequest(request, context.params.path);
}

export async function PUT(request: NextRequest, context: { params: { path: string[] } }) {
  return proxyRequest(request, context.params.path);
}

export async function PATCH(request: NextRequest, context: { params: { path: string[] } }) {
  return proxyRequest(request, context.params.path);
}

export async function DELETE(request: NextRequest, context: { params: { path: string[] } }) {
  return proxyRequest(request, context.params.path);
}

export async function OPTIONS(request: NextRequest, context: { params: { path: string[] } }) {
  return proxyRequest(request, context.params.path);
}
