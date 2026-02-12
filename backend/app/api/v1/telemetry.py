"""
Telemetry API endpoints.

Handles proctoring event logging for the F1-style timeline tracking.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import ProctoringLog, Candidate

router = APIRouter()


# ============== Pydantic Schemas ==============


class TelemetryLogRequest(BaseModel):
    """Schema for telemetry log request."""

    candidate_id: int
    event_type: str  # "TAB_SWITCH", "FACE_NOT_DETECTED", "MULTIPLE_FACES", etc.
    severity: str = "LOW"  # "LOW", "MEDIUM", "HIGH"
    evidence_snapshot: Optional[str] = None  # Base64 encoded image or URL


class TelemetryLogResponse(BaseModel):
    """Schema for telemetry log response."""

    log_id: int
    candidate_id: int
    event_type: str
    severity: str
    timestamp: datetime
    message: str = "Event logged successfully"


class TelemetryBatchRequest(BaseModel):
    """Schema for batch telemetry logging."""

    candidate_id: int
    events: list[dict]  # List of {event_type, severity, evidence_snapshot?, timestamp?}


class CandidateTelemetrySummary(BaseModel):
    """Schema for candidate telemetry summary."""

    candidate_id: int
    total_events: int
    high_severity_count: int
    medium_severity_count: int
    low_severity_count: int
    event_breakdown: dict[str, int]


# ============== Valid Event Types ==============

VALID_EVENT_TYPES = [
    "TAB_SWITCH",
    "FACE_NOT_DETECTED",
    "MULTIPLE_FACES",
    "BROWSER_UNFOCUSED",
    "COPY_PASTE_DETECTED",
    "SCREEN_SHARE_STOPPED",
    "WEBCAM_DISABLED",
    "AUDIO_DETECTED",
    "SUSPICIOUS_BEHAVIOR",
    "SESSION_START",
    "SESSION_END",
]

VALID_SEVERITIES = ["LOW", "MEDIUM", "HIGH"]


# ============== API Endpoints ==============


@router.post("/log", response_model=TelemetryLogResponse)
async def log_event(
    event: TelemetryLogRequest,
    db: Session = Depends(get_db),
):
    """
    Log a proctoring/telemetry event.

    This endpoint is called by the frontend proctoring system to record
    suspicious activities during the assessment.

    Event Types:
    - TAB_SWITCH: Candidate switched browser tabs
    - FACE_NOT_DETECTED: No face detected in webcam
    - MULTIPLE_FACES: More than one face detected
    - BROWSER_UNFOCUSED: Browser window lost focus
    - COPY_PASTE_DETECTED: Copy/paste action detected
    - SCREEN_SHARE_STOPPED: Screen sharing was stopped
    - WEBCAM_DISABLED: Webcam was turned off
    - AUDIO_DETECTED: Background audio/voices detected
    - SUSPICIOUS_BEHAVIOR: General suspicious behavior flag

    Severity Levels:
    - LOW: Minor concern (e.g., brief tab switch)
    - MEDIUM: Moderate concern (e.g., face not detected)
    - HIGH: Serious concern (e.g., multiple faces, prolonged absence)
    """
    # Validate candidate exists
    candidate = db.query(Candidate).filter(Candidate.id == event.candidate_id).first()
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found",
        )

    # Validate event type
    if event.event_type not in VALID_EVENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid event_type. Must be one of: {VALID_EVENT_TYPES}",
        )

    # Validate severity
    if event.severity not in VALID_SEVERITIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid severity. Must be one of: {VALID_SEVERITIES}",
        )

    # Create log entry
    log_entry = ProctoringLog(
        candidate_id=event.candidate_id,
        event_type=event.event_type,
        severity=event.severity,
        evidence_snapshot=event.evidence_snapshot,
        timestamp=datetime.utcnow(),
    )

    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)

    return TelemetryLogResponse(
        log_id=log_entry.id,
        candidate_id=log_entry.candidate_id,
        event_type=log_entry.event_type,
        severity=log_entry.severity,
        timestamp=log_entry.timestamp,
    )


@router.post("/log/batch")
async def log_events_batch(
    batch: TelemetryBatchRequest,
    db: Session = Depends(get_db),
):
    """
    Log multiple proctoring events in a single request.

    Useful for batch uploading events when connectivity is intermittent.
    """
    # Validate candidate exists
    candidate = db.query(Candidate).filter(Candidate.id == batch.candidate_id).first()
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found",
        )

    logged_count = 0
    errors = []

    for i, event in enumerate(batch.events):
        event_type = event.get("event_type")
        severity = event.get("severity", "LOW")

        # Validate
        if event_type not in VALID_EVENT_TYPES:
            errors.append(f"Event {i}: Invalid event_type '{event_type}'")
            continue

        if severity not in VALID_SEVERITIES:
            errors.append(f"Event {i}: Invalid severity '{severity}'")
            continue

        # Create log entry
        log_entry = ProctoringLog(
            candidate_id=batch.candidate_id,
            event_type=event_type,
            severity=severity,
            evidence_snapshot=event.get("evidence_snapshot"),
            timestamp=datetime.utcnow(),
        )
        db.add(log_entry)
        logged_count += 1

    db.commit()

    return {
        "message": f"Logged {logged_count} events",
        "logged_count": logged_count,
        "errors": errors if errors else None,
    }


@router.get("/candidate/{candidate_id}/logs")
async def get_candidate_logs(
    candidate_id: int,
    severity: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """
    Get proctoring logs for a candidate.

    Optional filters:
    - severity: Filter by severity level
    - event_type: Filter by event type
    - limit: Max number of logs to return (default 100)
    """
    query = db.query(ProctoringLog).filter(ProctoringLog.candidate_id == candidate_id)

    if severity:
        query = query.filter(ProctoringLog.severity == severity)

    if event_type:
        query = query.filter(ProctoringLog.event_type == event_type)

    logs = query.order_by(ProctoringLog.timestamp.desc()).limit(limit).all()

    return {
        "candidate_id": candidate_id,
        "total_logs": len(logs),
        "logs": [
            {
                "id": log.id,
                "event_type": log.event_type,
                "severity": log.severity,
                "timestamp": log.timestamp.isoformat(),
                "has_evidence": log.evidence_snapshot is not None,
            }
            for log in logs
        ],
    }


@router.get("/candidate/{candidate_id}/summary", response_model=CandidateTelemetrySummary)
async def get_candidate_telemetry_summary(
    candidate_id: int,
    db: Session = Depends(get_db),
):
    """
    Get a summary of telemetry events for a candidate.

    Returns counts by severity and event type for quick overview.
    """
    logs = (
        db.query(ProctoringLog)
        .filter(ProctoringLog.candidate_id == candidate_id)
        .all()
    )

    # Count by severity
    high_count = sum(1 for log in logs if log.severity == "HIGH")
    medium_count = sum(1 for log in logs if log.severity == "MEDIUM")
    low_count = sum(1 for log in logs if log.severity == "LOW")

    # Count by event type
    event_breakdown = {}
    for log in logs:
        event_breakdown[log.event_type] = event_breakdown.get(log.event_type, 0) + 1

    return CandidateTelemetrySummary(
        candidate_id=candidate_id,
        total_events=len(logs),
        high_severity_count=high_count,
        medium_severity_count=medium_count,
        low_severity_count=low_count,
        event_breakdown=event_breakdown,
    )


@router.get("/event-types")
async def get_event_types():
    """
    Get list of valid event types and severities.

    Useful for frontend to display options.
    """
    return {
        "event_types": VALID_EVENT_TYPES,
        "severities": VALID_SEVERITIES,
    }
