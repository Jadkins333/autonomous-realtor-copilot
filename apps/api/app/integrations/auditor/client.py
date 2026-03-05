from __future__ import annotations

from typing import Any

import httpx
from pydantic import BaseModel, ValidationError


class AuditorParcel(BaseModel):
    external_id: str
    parcel_number: str
    address: str
    city: str = "Columbus"
    state: str = "OH"
    zip: str = "43215"
    attributes_json: dict
    centroid: dict | None = None


class JsonRestConnector:
    def __init__(self, base_url: str, path_by_address: str, timeout_seconds: int = 20) -> None:
        self.base_url = base_url.rstrip("/")
        self.path_by_address = path_by_address
        self.timeout_seconds = timeout_seconds

    async def fetch(self, query: str) -> list[dict[str, Any]]:
        url = f"{self.base_url}{self.path_by_address}"
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.get(url, params={"address": query})
            response.raise_for_status()
            payload = response.json()
        if isinstance(payload, dict) and "results" in payload:
            return payload["results"]
        if isinstance(payload, list):
            return payload
        return []

    @staticmethod
    def validate_records(records: list[dict[str, Any]]) -> list[AuditorParcel]:
        parsed: list[AuditorParcel] = []
        for row in records:
            try:
                parsed.append(AuditorParcel.model_validate(row))
            except ValidationError:
                continue
        return parsed
