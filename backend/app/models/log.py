from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.db.base import Base


class ProctoringLog(Base):
    """
    Proctoring/Telemetry logs for F1-style timeline tracking.

    Powers the Timeline Graph in the recruiter UI.
    """

    __tablename__ = "proctoring_logs"

    id = Column(Integer, primary_key=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"))

    event_type = Column(String)  # "TAB_SWITCH", "FACE_NOT_DETECTED", "MULTIPLE_FACES"
    severity = Column(String)    # "LOW", "MEDIUM", "HIGH"

    # Snapshot: If we capture a webcam frame, store base64 or URL here
    evidence_snapshot = Column(String, nullable=True)

    timestamp = Column(DateTime, default=datetime.utcnow)

    # Relationships
    candidate = relationship("Candidate", back_populates="logs")


class CandidateActionLog(Base):
    """
    Recruiter action history for candidate state transitions.

    Keeps a transparent audit trail for fast actions taken on the pipeline view.
    """

    __tablename__ = "candidate_action_logs"

    id = Column(Integer, primary_key=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), index=True)
    recruiter_id = Column(Integer, ForeignKey("users.id"), index=True)
    action = Column(String)  # "ACCEPT", "REJECT", "REVIEW"
    note = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    candidate = relationship("Candidate", back_populates="action_logs")
