from sqlalchemy import Column, Integer, String, ForeignKey, JSON, Boolean, DateTime
from sqlalchemy.orm import relationship

from app.db.base import Base


class Candidate(Base):
    """Candidate profile with resume data, scores, and Glass Box decision."""

    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))

    # 1. Resume Data (Stored as JSON to allow flexible parsing)
    # Example: {"skills": ["Python", "React"], "experience_years": 3}
    resume_parsed_data = Column(JSON, default=dict)
    resume_text_raw = Column(String)  # Full text for search

    # 2. Assessment Scores (The Dual Track)
    technical_score = Column(Integer, default=0)    # 0-100
    psychometric_score = Column(Integer, default=0)  # 0-100

    # 3. The "Glass Box" Decision
    ai_rationale = Column(String)  # Full text explanation
    hiring_recommendation = Column(String)  # "HIRE", "NO_HIRE", "REVIEW"
    confidence_score = Column(Integer)  # 0-100

    # 4. Meta
    status = Column(String, default="Registered")  # "Assessment_Started", "Completed"
    reset_requested = Column(Boolean, default=False)
    reset_reason = Column(String)
    decision_note = Column(String)
    decision_updated_at = Column(DateTime)

    # Relationships
    user = relationship("User", back_populates="candidate_profile")
    logs = relationship("ProctoringLog", back_populates="candidate")
    submissions = relationship("CodeSubmission", back_populates="candidate")
    action_logs = relationship("CandidateActionLog", back_populates="candidate")
