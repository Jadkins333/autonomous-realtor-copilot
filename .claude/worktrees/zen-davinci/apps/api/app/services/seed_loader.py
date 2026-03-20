from __future__ import annotations

import json
import os
from pathlib import Path


def load_seed_json(filename: str) -> list[dict]:
    local_seed_dir = Path(__file__).resolve().parents[2] / "seed"
    search_dirs = [
        Path(os.getenv("SEED_DIR", "/seed")),
        local_seed_dir,
    ]

    for directory in search_dirs:
        path = directory / filename
        if path.exists():
            with path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
                if isinstance(payload, list):
                    return payload
                if isinstance(payload, dict) and "data" in payload:
                    return payload["data"]
    return []
