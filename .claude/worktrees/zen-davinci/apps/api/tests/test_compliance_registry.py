from __future__ import annotations

from pathlib import Path

from sqlalchemy import select

from app.compliance.registry import COMPLIANCE_RULE_REGISTRY
from app.db.session import SessionLocal
from app.models.entities import ComplianceEvent

def _resolve_repo_root() -> Path:
    current = Path(__file__).resolve()
    for candidate in [current.parent, *current.parents]:
        if (candidate / "docs" / "compliance").exists() and (candidate / "apps").exists():
            return candidate
    # Docker API image uses /app as repo root.
    return Path("/app")


REPO_ROOT = _resolve_repo_root()


def test_rule_keys_used_in_code_are_registered() -> None:
    service_root = REPO_ROOT / "apps" / "api" / "app" / "services"
    if not service_root.exists():
        service_root = REPO_ROOT / "app" / "services"
    combined = "\n".join(path.read_text(encoding="utf-8") for path in service_root.rglob("*.py"))
    used_rule_keys = {key for key in COMPLIANCE_RULE_REGISTRY if key in combined}
    expected_major_rules = {
        "consent_required",
        "suppressed_contact",
        "quiet_hours",
        "frequency_cap",
        "stop_opt_out",
        "sandbox_default",
    }
    missing_major = sorted(expected_major_rules - used_rule_keys)
    assert not missing_major, f"Major compliance rules are not referenced in service code: {missing_major}"
    missing = sorted(key for key in used_rule_keys if key not in COMPLIANCE_RULE_REGISTRY)
    assert not missing, f"Unregistered compliance rule keys: {missing}"


def test_registry_docs_exist_and_have_authoritative_links() -> None:
    for key, meta in COMPLIANCE_RULE_REGISTRY.items():
        doc_path = REPO_ROOT / meta.doc_path
        if not doc_path.exists():
            doc_path = Path("/workspace-docs/compliance") / Path(meta.doc_path).name
        assert doc_path.exists(), f"Missing doc for {key}: {meta.doc_path}"

        doc_text = doc_path.read_text(encoding="utf-8").lower()
        assert any(domain in doc_text for domain in ["ftc.gov", "fcc.gov", "hud.gov"]), (
            f"Doc for {key} should include at least one authoritative link"
        )
        assert meta.authoritative_links, f"Registry entry {key} must include authoritative_links"


def test_recorded_compliance_events_reference_registered_rule_keys() -> None:
    db = SessionLocal()
    try:
        rows = db.execute(select(ComplianceEvent.rule_key).distinct()).scalars().all()
    finally:
        db.close()

    unknown = sorted({row for row in rows if row and row not in COMPLIANCE_RULE_REGISTRY})
    assert not unknown, f"Compliance events have unknown rule_key values: {unknown}"
