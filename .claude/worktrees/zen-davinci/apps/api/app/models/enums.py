import enum


class UserRole(str, enum.Enum):
    agent = "agent"
    admin = "admin"


class SourceRunStatus(str, enum.Enum):
    success = "success"
    partial = "partial"
    failure = "failure"


class SourceMode(str, enum.Enum):
    live = "live"
    fixture = "fixture"


class SourceState(str, enum.Enum):
    ok = "ok"
    partial = "partial"
    failed = "failed"
    paused = "paused"


class Channel(str, enum.Enum):
    email = "email"
    sms = "sms"
    voice = "voice"


class ConsentStatus(str, enum.Enum):
    opt_in = "opt_in"
    opt_out = "opt_out"


class MessageDirection(str, enum.Enum):
    inbound = "inbound"
    outbound = "outbound"


class MessageStatus(str, enum.Enum):
    draft = "draft"
    queued = "queued"
    sent = "sent"
    delivered = "delivered"
    failed = "failed"
    blocked = "blocked"


class EnrollmentState(str, enum.Enum):
    active = "active"
    paused = "paused"
    completed = "completed"
    stopped = "stopped"
