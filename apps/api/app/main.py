from __future__ import annotations

import logging
import time
import uuid
from collections.abc import Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging

from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.staticfiles import StaticFiles

settings = get_settings()
configure_logging(settings.log_level)
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.app_name, 
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
)

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
    allow_origins=["*"],
    allow_credentials=True,
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
