from __future__ import annotations

from typing import Any

import httpx


class OverpassClient:
    def __init__(self, endpoint: str, timeout_seconds: int = 30) -> None:
        self.endpoint = endpoint
        self.timeout_seconds = timeout_seconds

    async def query_pois(self, lat: float, lon: float, radius_meters: int = 2500) -> list[dict[str, Any]]:
        query = f"""
[out:json][timeout:25];
(
  node["amenity"~"cafe|park|supermarket"](around:{radius_meters},{lat},{lon});
);
out body;
"""
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(self.endpoint, data=query)
            response.raise_for_status()
            payload = response.json()
        return payload.get("elements", [])
