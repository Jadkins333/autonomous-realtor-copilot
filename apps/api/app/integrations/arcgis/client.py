from __future__ import annotations

from typing import Any

import httpx


class ArcGISFeatureServiceClient:
    def __init__(self, service_url: str, timeout_seconds: int = 30) -> None:
        self.service_url = service_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    async def query(
        self,
        where: str = "1=1",
        out_fields: str = "*",
        result_record_count: int = 200,
    ) -> list[dict[str, Any]]:
        url = f"{self.service_url}/query"
        params = {
            "f": "json",
            "where": where,
            "outFields": out_fields,
            "resultRecordCount": result_record_count,
        }
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            payload = response.json()
        return payload.get("features", [])
