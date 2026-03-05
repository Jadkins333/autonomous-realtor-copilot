# RESO Web API Core (MLS/IDX/VOW)

MLS sync is intentionally disabled in this MVP.

Implementation notes:
- A RESO OData query-builder scaffold is included.
- `ENABLE_MLS_SYNC=false` by default.
- Any MLS sync call raises `NotImplementedError` unless explicit paid credentials integration is enabled.

Authoritative reference:
- RESO Web API Core proposal: https://transport.reso.org/proposals/web-api-core.html
