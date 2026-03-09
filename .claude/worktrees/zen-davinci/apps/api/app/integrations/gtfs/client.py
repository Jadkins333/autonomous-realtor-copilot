from __future__ import annotations

from typing import Any

import csv
import io
import zipfile

import httpx


class GTFSClient:
    def __init__(self, url: str, timeout_seconds: int = 45) -> None:
        self.url = url
        self.timeout_seconds = timeout_seconds

    async def fetch_stops(self, limit: int = 500) -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.get(self.url)
            response.raise_for_status()
            content = response.content

        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            with zf.open("stops.txt") as fp:
                text = io.TextIOWrapper(fp, encoding="utf-8")
                reader = csv.DictReader(text)
                rows: list[dict[str, Any]] = []
                for idx, row in enumerate(reader):
                    rows.append(row)
                    if idx + 1 >= limit:
                        break
        return rows
