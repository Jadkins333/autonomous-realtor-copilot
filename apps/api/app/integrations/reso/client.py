from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

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


class ResoApiClient:
    async def get_access_token(self, config: ResoTenantConfig) -> str:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{config.base_url.rstrip('/')}/connect/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": config.client_id,
                    "client_secret": config.client_secret,
                    "scope": "OData",
                },
            )
            response.raise_for_status()
            return response.json()["access_token"]


class ResoMetadataClient(ResoApiClient):
    async def fetch_metadata(self, config: ResoTenantConfig) -> dict:
        if not settings.enable_mls_sync:
            raise NotImplementedError(
                "MLS access requires paid credentials; module disabled by default."
            )
        token = await self.get_access_token(config)
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                f"{config.base_url.rstrip('/')}/OData/$metadata",
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            )
            response.raise_for_status()
            return response.json()


class ResoSyncClient(ResoApiClient):
    async def run_sync(self, config: ResoTenantConfig) -> None:
        if not settings.enable_mls_sync:
            raise NotImplementedError(
                "MLS access requires paid credentials; module disabled by default."
            )
        token = await self.get_access_token(config)
        async with httpx.AsyncClient(timeout=30) as client:
            url = f"{config.base_url.rstrip('/')}/OData" + ResoODataQueryBuilder.build("Property", top=10)
            response = await client.get(
                url,
                headers={"Authorization": f"Bearer {token}"},
            )
            response.raise_for_status()
            return
