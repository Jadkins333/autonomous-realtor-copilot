from app.services.coverage import compute_coverage_summary


def test_coverage_summary_math_is_deterministic() -> None:
    payload = compute_coverage_summary(
        ["a", "b", "c", "d"],
        {"a": 1, "b": None, "c": "ok", "d": ""},
    )
    assert payload["required_total"] == 4
    assert payload["required_present"] == 2
    assert payload["coverage_pct"] == 50.0
    assert payload["missing_required"] == ["b", "d"]
