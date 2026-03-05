from fastapi import APIRouter

from app.api import (
    routes_auth,
    routes_contacts,
    routes_copilot,
    routes_health,
    routes_ingest,
    routes_insights,
    routes_outreach,
    routes_opportunities,
    routes_parcels,
    routes_sources,
    routes_sequences,
    routes_system,
    routes_webhooks,
)

api_router = APIRouter()
api_router.include_router(routes_health.router)
api_router.include_router(routes_auth.router)
api_router.include_router(routes_parcels.router)
api_router.include_router(routes_opportunities.router)
api_router.include_router(routes_ingest.router)
api_router.include_router(routes_insights.router)
api_router.include_router(routes_contacts.router)
api_router.include_router(routes_sequences.router)
api_router.include_router(routes_outreach.router)
api_router.include_router(routes_webhooks.router)
api_router.include_router(routes_copilot.router)
api_router.include_router(routes_sources.router)
api_router.include_router(routes_system.router)
