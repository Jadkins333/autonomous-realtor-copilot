from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any


def _is_valid(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, float) and math.isnan(value):
        return False
    if isinstance(value, str):
        return value.strip() != ""
    if isinstance(value, (list, dict, tuple, set)):
        return len(value) > 0
    return True


def compute_coverage_summary(required_inputs: list[str], values: Mapping[str, Any]) -> dict:
    required_total = len(required_inputs)
    missing_required: list[str] = []
    for name in required_inputs:
        if not _is_valid(values.get(name)):
            missing_required.append(name)

    required_present = required_total - len(missing_required)
    coverage_pct = round((required_present / required_total * 100.0), 2) if required_total else 100.0

    return {
        "coverage_pct": coverage_pct,
        "required_total": required_total,
        "required_present": required_present,
        "missing_required": missing_required,
    }
