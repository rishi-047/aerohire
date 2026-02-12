from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.db.base import Base
from app.db.session import engine

# Import all models so SQLAlchemy can discover them for table creation
from app.models import User, Candidate, ProctoringLog, CandidateActionLog, CodeSubmission  # noqa: F401

# Import API router
from app.api.api import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup."""
    Base.metadata.create_all(bind=engine)
    ensure_candidate_columns()
    yield


def ensure_candidate_columns() -> None:
    """Ensure new columns exist without forcing a DB reset."""
    with engine.begin() as connection:
        candidate_rows = connection.execute(text("PRAGMA table_info(candidates)")).fetchall()
        existing_candidates = {row[1] for row in candidate_rows}

        if "decision_note" not in existing_candidates:
            connection.execute(text("ALTER TABLE candidates ADD COLUMN decision_note VARCHAR"))
        if "decision_updated_at" not in existing_candidates:
            connection.execute(text("ALTER TABLE candidates ADD COLUMN decision_updated_at DATETIME"))


app = FastAPI(
    title=settings.APP_NAME,
    description="AI-Powered Hiring Platform with Explainable Decisions",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS Middleware - allowlist from env (comma-separated)
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in settings.BACKEND_CORS_ORIGINS.split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.get("/", tags=["Root"])
async def root():
    """Root endpoint."""
    return {"message": f"Welcome to {settings.APP_NAME} API"}


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


# Include API router with /api/v1 prefix
app.include_router(api_router, prefix="/api/v1")
