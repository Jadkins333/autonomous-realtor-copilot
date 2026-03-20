from __future__ import annotations

from importlib import import_module

__all__ = [
    "ActivityEvent",
    "ComplianceEvent",
    "ConsentEvent",
    "Contact",
    "Conversation",
    "DisclosureAcknowledgement",
    "DisclosureDefinition",
    "DisclosureGate",
    "DisclosureVersion",
    "FloodZone",
    "Message",
    "MetricDefinition",
    "MetricValue",
    "OutreachSendAttempt",
    "OpportunityEvent",
    "Parcel",
    "Permit",
    "PoiFeature",
    "ProvenanceRecord",
    "SchemaDriftDLQ",
    "Sequence",
    "SequenceEnrollment",
    "SequenceStep",
    "Source",
    "SourceRun",
    "SuppressionList",
    "Tenant",
    "TransitStop",
    "User",
    "VowAccessProfile",
]


def __getattr__(name: str):
    if name not in __all__:
        raise AttributeError(f"module 'app.models' has no attribute {name!r}")
    entities = import_module("app.models.entities")
    return getattr(entities, name)
