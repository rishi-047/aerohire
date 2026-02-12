"""
API Router Aggregator.

Combines all v1 API routers into a single router for the main app.
"""

from fastapi import APIRouter

from app.api.v1 import auth, resume, assessment, telemetry, dashboard, admin

api_router = APIRouter()

# Include all v1 routers with their prefixes and tags
api_router.include_router(
    auth.router,
    prefix="/auth",
    tags=["Authentication"],
)

api_router.include_router(
    resume.router,
    prefix="/resume",
    tags=["Resume"],
)

api_router.include_router(
    assessment.router,
    prefix="/assessment",
    tags=["Assessment"],
)

api_router.include_router(
    telemetry.router,
    prefix="/telemetry",
    tags=["Telemetry"],
)

api_router.include_router(
    dashboard.router,
    prefix="/dashboard",
    tags=["Dashboard"],
)

api_router.include_router(
    admin.router,
    prefix="/admin",
    tags=["Admin"],
)
