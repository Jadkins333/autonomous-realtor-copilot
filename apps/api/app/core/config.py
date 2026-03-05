from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    database_url: str = "postgresql+psycopg2://postgres:postgres@db:5432/realtor_copilot"
    redis_url: str = "redis://redis:6379/0"

    default_tenant_name: str = "Demo Realty Columbus"
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


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
