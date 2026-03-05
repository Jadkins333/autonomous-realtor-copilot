from dataclasses import dataclass
from datetime import UTC, datetime, timedelta


@dataclass
class CircuitState:
    failures: int = 0
    opened_at: datetime | None = None
    state: str = "closed"


class CircuitBreaker:
    def __init__(self, failure_threshold: int = 3, recovery_seconds: int = 120) -> None:
        self.failure_threshold = failure_threshold
        self.recovery_seconds = recovery_seconds
        self.state = CircuitState()

    def allow(self) -> bool:
        now = datetime.now(tz=UTC)
        if self.state.state == "open" and self.state.opened_at:
            if now - self.state.opened_at > timedelta(seconds=self.recovery_seconds):
                self.state.state = "half-open"
                return True
            return False
        return True

    def success(self) -> None:
        self.state = CircuitState(state="closed")

    def failure(self) -> None:
        self.state.failures += 1
        if self.state.failures >= self.failure_threshold:
            self.state.state = "open"
            self.state.opened_at = datetime.now(tz=UTC)
