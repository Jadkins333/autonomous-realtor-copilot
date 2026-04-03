from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_LOCAL_DEFAULTS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Autonomous Realtor Intelligence Copilot API"
    environment: str = "development"
    debug_diag: bool = False
    log_level: str = "INFO"
    sandbox_mode: bool = True
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    # Comma-separated list of allowed CORS origins.  Set CORS_ALLOW_ORIGINS in
    # the environment; defaults to localhost dev origins when empty.
    cors_allow_origins: str = ""

    @property
    def cors_allow_origins_list(self) -> list[str]:
        """Return deduplicated list of CORS origins, falling back to local defaults."""
        if not self.cors_allow_origins or self.cors_allow_origins.strip() == "":
            return _LOCAL_DEFAULTS[:]
        if self.cors_allow_origins.strip() == "*":
            return ["*"]
        seen: set[str] = set()
        result: list[str] = []
        for origin in self.cors_allow_origins.split(","):
            o = origin.strip()
            if o and o not in seen:
                seen.add(o)
                result.append(o)
        return result or _LOCAL_DEFAULTS[:]

    database_url: str = "postgresql+psycopg2://postgres:postgres@db:5432/realtor_copilot"
    redis_url: str = "redis://redis:6379/0"

    default_tenant_name: str = "Demo Realty Columbus"
    default_tenant_slug: str = "demo-realty"
    default_locale: str = "columbus_oh"
    test_parcel_missing_signals_id: str = "11111111-1111-1111-1111-111111111111"
    demo_user_email: str = "agent@demo.local"
    demo_user_password: str = "demo123"

    franklin_auditor_base_url: str = "https://audr-api.franklincountyohio.gov/"
    franklin_auditor_path_by_address: str = "/v1/parcels/ByAddress"
    franklin_auditor_path_by_parcel: str = "/v1/parcels/ByParcelNumber"

    columbus_arcgis_base_url: str = (
        "https://services5.arcgis.com/54falWtcpty3V47Z/ArcGIS/rest/services/"
    )
    columbus_permits_layer_path: str = ""
    columbus_code_layer_path: str = ""
    fema_nfhl_arcgis_url: str = ""

    gtfs_url: str = ""
    overpass_url: str = "https://overpass-api.de/api/interpreter"

    enable_mls_sync: bool = False

    postmark_server_token: str = ""
    postmark_sender_email: str = ""

    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""

    quiet_hours_start: int = Field(default=8, ge=0, le=23)
    quiet_hours_end: int = Field(default=21, ge=0, le=23)
    frequency_cap_per_day: int = 3
    enforce_global_revocation: bool = False
    consent_max_age_days: int = 365
    proxy_timeout_seconds: int = 15
    ohio_market_enabled: bool = True
    ohio_website_update_window_days: int = 14
    ohio_public_update_window_days: int = 14

    # Data-retention window (days).  Records older than these thresholds are
    # pruned by the nightly Celery housekeeping task.
    retention_source_runs_days: int = 30
    retention_compliance_events_days: int = 90
    retention_schema_drift_dlq_days: int = 60


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
