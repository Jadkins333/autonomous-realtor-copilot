from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlencode

from app.core.config import get_settings

settings = get_settings()


@dataclass
class ResoTenantConfig:
    tenant_id: str
    base_url: str
    client_id: str
    client_secret: str


class ResoODataQueryBuilder:
    @staticmethod
    def build(resource: str, filters: dict[str, str] | None = None, top: int = 50) -> str:
        query: dict[str, str] = {"$top": str(top)}
        if filters:
            filter_parts = [f"{k} eq '{v}'" for k, v in filters.items()]
            query["$filter"] = " and ".join(filter_parts)
        return f"/{resource}?{urlencode(query)}"


class ResoMetadataClient:
    async def fetch_metadata(self, _: ResoTenantConfig) -> dict:
        if not settings.enable_mls_sync:
            raise NotImplementedError(
                "MLS access requires paid credentials; module disabled by default."
            )
        raise NotImplementedError("Metadata fetch implementation intentionally disabled in MVP.")


class ResoSyncClient:
    async def run_sync(self, _: ResoTenantConfig) -> None:
        if not settings.enable_mls_sync:
            raise NotImplementedError(
                "MLS access requires paid credentials; module disabled by default."
            )
        raise NotImplementedError("Sync implementation intentionally disabled in MVP.")
