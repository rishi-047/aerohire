from sqlalchemy import Column, Integer, String, Boolean, Float, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship

from app.db.base import Base


class CodeSubmission(Base):
    """
    Code submission with execution metrics.

    Stores Performance + Accuracy data for technical assessments.
    Includes Innovation Trinity features: code history, forensics, and chat analysis.
    """

    __tablename__ = "code_submissions"

    id = Column(Integer, primary_key=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"))
    question_id = Column(Integer)

    submitted_code = Column(String)

    # Execution Metrics
    is_passed = Column(Boolean)
    tests_passed = Column(Integer)
    tests_total = Column(Integer)
    execution_time_ms = Column(Float)  # For "Code Velocity" telemetry
    memory_usage_mb = Column(Float)

    error_log = Column(String)  # Stack trace if failed

    # Innovation Trinity: Code Playback
    # List of code snapshots captured every 5 seconds
    # Format: [{ "timestamp": epoch_ms, "code": "..." }, ...]
    code_history = Column(JSON, default=list)

    # Innovation Trinity: Paste Forensics
    # Character breakdown tracking typed vs pasted code
    # Format: { "typed": int, "pasted": int }
    char_breakdown = Column(JSON, default=dict)

    # Innovation Trinity: Simulated Teammate Chat
    # The candidate's response to the "Alex" junior dev chat prompt
    chat_response = Column(Text, nullable=True)

    # Teamwork score from chat analysis (0-100)
    teamwork_score = Column(Integer, default=0)

    # Relationships
    candidate = relationship("Candidate", back_populates="submissions")
