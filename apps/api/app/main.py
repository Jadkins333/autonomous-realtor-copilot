from __future__ import annotations

import logging
import time
import uuid
from collections.abc import Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.api.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging

settings = get_settings()
configure_logging(settings.log_level)
logger = logging.getLogger(__name__)

_INSECURE_SECRET_DEFAULT = "change-me"  # noqa: S105 – this is the sentinel value, not a real secret
if settings.jwt_secret == _INSECURE_SECRET_DEFAULT:
    if settings.environment.lower() == "production":
        raise RuntimeError(
            "JWT_SECRET is still set to the insecure default 'change-me'. "
            "Set a strong random secret before running in production."
        )
    logger.warning(
        "insecure_jwt_secret_default",
        extra={"environment": settings.environment},
    )

# Rate limiter: 60 requests / minute per IP by default.
# Individual routes may override with a tighter @limiter.limit() decorator.
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

cors_allow_origins_list = settings.cors_allow_origins_list
# When wildcard is configured, credentials cannot be sent (CORS spec).
cors_allow_credentials = "*" not in cors_allow_origins_list

app = FastAPI(
    title=settings.app_name, 
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html():
    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=app.title + " - Interactive Intelligence Hub",
        oauth2_redirect_url=app.swagger_ui_oauth2_redirect_url,
        swagger_js_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js",
        swagger_css_url="https://cdn.jsdelivr.net/npm/swagger-ui-themes@3.0.1/themes/3.x/theme-monokai.css",
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins_list,
    allow_credentials=cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next: Callable) -> Response:
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    request.state.request_id = request_id

    started = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - started) * 1000, 2)

    logger.info(
        "request_complete",
        extra={
            "request_id": request_id,
            "path": request.url.path,
            "method": request.method,
            "status": response.status_code,
            "duration_ms": duration_ms,
        },
    )
    response.headers["x-request-id"] = request_id
    return response


app.include_router(api_router)
