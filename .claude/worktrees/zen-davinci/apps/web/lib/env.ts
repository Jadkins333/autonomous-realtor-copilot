// NEXT_PUBLIC_API_BASE_URL can be mangled by Git Bash path expansion on Windows;
// prefer the env var when it looks like a valid URL/path, else fall back to the
// safe default.  The proxy route always lives at /api/proxy in this app.
const _rawBase = process.env.NEXT_PUBLIC_API_BASE_URL;
export const API_PROXY_BASE =
  _rawBase && (_rawBase.startsWith("/") || _rawBase.startsWith("http"))
    ? _rawBase
    : "/api/proxy";
export const API_INTERNAL_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const APP_BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";
