"""
Dashboard API endpoints.

Provides the recruiter view with comprehensive candidate data.
"""

from typing import Optional, Any
import json
from datetime import datetime
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError

from app.db.session import get_db
from app.models import User, Candidate, ProctoringLog, CodeSubmission, CandidateActionLog
from app.api.v1.auth import get_current_user
from app.services import generate_hiring_rationale
from app.services.baseline import evaluate_baseline, evaluate_resume_gate
from app.services.zone_parser import estimate_experience_years

# Configure logger
logger = logging.getLogger("dashboard")

router = APIRouter()


# ============== Pydantic Schemas ==============


class SubmissionSummary(BaseModel):
    """Schema for code submission summary."""

    id: int
    question_id: int
    is_passed: bool
    tests_passed: int
    tests_total: int
    execution_time_ms: Optional[float]

    # Innovation Trinity fields
    code_history: Optional[list[dict]] = None  # Code playback snapshots
    char_breakdown: Optional[dict] = None  # Typed vs pasted stats
    chat_response: Optional[str] = None  # Teammate chat reply
    teamwork_score: Optional[int] = None  # AI-evaluated teamwork score
    submitted_code: Optional[str] = None  # The actual code for playback

    class Config:
        from_attributes = True


class LogSummary(BaseModel):
    """Schema for proctoring log summary."""

    id: int
    event_type: str
    severity: str
    timestamp: datetime
    has_evidence: bool

    class Config:
        from_attributes = True


class CandidateDetailResponse(BaseModel):
    """Schema for full candidate detail (mega-endpoint response)."""

    # Basic Info
    id: int
    user_id: int
    email: str
    full_name: str
    status: str
    reset_requested: bool
    reset_reason: Optional[str]
    decision_note: Optional[str]
    decision_updated_at: Optional[datetime]
    baseline_summary: Optional[dict]
    recommended_role_tags: Optional[list[str]] = None

    # Resume Data
    resume_parsed_data: Optional[dict]
    has_resume: bool
    resume_text_raw: Optional[str]

    # Assessment Scores
    technical_score: int
    psychometric_score: int

    # Glass Box Decision
    ai_rationale: Optional[str]
    hiring_recommendation: Optional[str]
    confidence_score: Optional[int]

    # Telemetry Summary
    total_proctoring_events: int
    high_severity_events: int
    integrity_score: int  # 100 - (weighted events)

    # Related Data
    submissions: list[SubmissionSummary]
    recent_logs: list[LogSummary]


class CandidateListItem(BaseModel):
    """Schema for candidate list item."""

    id: int
    email: str
    full_name: str
    status: str
    technical_score: int
    psychometric_score: int
    hiring_recommendation: Optional[str]
    total_submissions: int
    total_flags: int
    skill_match_percent: Optional[int] = None
    matched_skills: Optional[list[str]] = None
    missing_skills: Optional[list[str]] = None
    candidate_skills: Optional[list[str]] = None
    overall_rank_score: Optional[float] = None
    overall_rank_position: Optional[int] = None
    skill_rank_position: Optional[int] = None
    role_tags: Optional[list[str]] = None
    last_action: Optional[str] = None
    last_action_at: Optional[datetime] = None


class RankingListItem(BaseModel):
    """Schema for dedicated ranking page rows."""

    candidate_id: int
    email: str
    full_name: str
    status: str
    hiring_recommendation: Optional[str]
    technical_score: int
    psychometric_score: int
    integrity_score: int
    teamwork_score: int
    overall_rank_score: float
    overall_rank_position: int
    role_rank_position: Optional[int] = None
    role_tags: list[str]
    candidate_skills: list[str]


class DashboardStats(BaseModel):
    """Schema for dashboard overview stats."""

    total_candidates: int
    completed_assessments: int
    pending_review: int
    recommended_hire: int
    recommended_no_hire: int


class StatusUpdateRequest(BaseModel):
    """Schema for updating candidate status."""

    status: str
    decision_note: Optional[str] = None

    @property
    def valid_statuses(self) -> list[str]:
        return [
            "Registered",
            "Assessment Started",
            "Completed",
            "Under Review",
            "Interview Scheduled",
            "Hired",
            "Rejected",
        ]


class ResetRequest(BaseModel):
    """Schema for candidate reset request."""

    reason: str


class QuickActionRequest(BaseModel):
    """Schema for recruiter quick actions."""

    action: str
    note: Optional[str] = None


# ============== Helper Functions ==============

EXPECTED_CODING_QUESTION_IDS = {1, 2}
ACTION_TO_STATUS = {
    "ACCEPT": "Hired",
    "REJECT": "Rejected",
    "REVIEW": "Under Review",
}
ACTION_TO_RECOMMENDATION = {
    "ACCEPT": "HIRE",
    "REJECT": "NO_HIRE",
    "REVIEW": "REVIEW",
}

ROLE_TAG_PRIORITY = [
    "SWE Core",
    "Backend Intern",
    "Full-Stack Intern",
    "Cloud/DevOps Intern",
    "Data/Analytics Intern",
    "Leadership Potential",
    "Operations/Support Fit",
    "Needs Mentorship",
    "Integrity Risk",
]

BACKEND_SKILLS = {"python", "sql", "postgresql", "mysql", "fastapi", "django", "flask"}
FULLSTACK_SKILLS = {"javascript", "typescript", "react", "node.js", "node", "express", "html", "css"}
DEVOPS_SKILLS = {"linux", "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "vmware"}
DATA_SKILLS = {"python", "sql", "pandas", "numpy", "machine learning", "power bi", "tableau"}


def _avg_teamwork_score(submissions: list[CodeSubmission]) -> int:
    if not submissions:
        return 0
    scores = [int(sub.teamwork_score or 0) for sub in submissions if sub.teamwork_score is not None]
    if not scores:
        return 0
    return round(sum(scores) / len(scores))


def _derive_role_tags(
    *,
    candidate_skills_norm: list[str],
    technical_score: int,
    psychometric_score: int,
    integrity_score: int,
    teamwork_score: int,
) -> list[str]:
    skill_set = set(candidate_skills_norm)
    tags: list[str] = []

    if technical_score >= 75 and integrity_score >= 70:
        tags.append("SWE Core")
    if len(skill_set.intersection(BACKEND_SKILLS)) >= 2:
        tags.append("Backend Intern")
    if len(skill_set.intersection(FULLSTACK_SKILLS)) >= 2:
        tags.append("Full-Stack Intern")
    if len(skill_set.intersection(DEVOPS_SKILLS)) >= 2:
        tags.append("Cloud/DevOps Intern")
    if len(skill_set.intersection(DATA_SKILLS)) >= 2:
        tags.append("Data/Analytics Intern")
    if psychometric_score >= 70 and teamwork_score >= 60 and integrity_score >= 65:
        tags.append("Leadership Potential")
    if technical_score < 55 and psychometric_score >= 65:
        tags.append("Operations/Support Fit")
    if technical_score < 55 and psychometric_score < 55:
        tags.append("Needs Mentorship")
    if integrity_score < 60:
        tags.append("Integrity Risk")
    if not tags:
        tags.append("Generalist Candidate")

    tags_sorted = sorted(
        set(tags),
        key=lambda item: ROLE_TAG_PRIORITY.index(item) if item in ROLE_TAG_PRIORITY else 999,
    )
    return tags_sorted


def calculate_integrity_score(logs: list[ProctoringLog]) -> int:
    """
    Calculate an integrity score based on proctoring events.

    Score starts at 100 and decreases based on events:
    - HIGH severity: -10 points each
    - MEDIUM severity: -5 points each
    - LOW severity: -2 points each

    Minimum score is 0.
    """
    score = 100

    for log in logs:
        severity = (log.severity or "").upper()
        if severity == "HIGH":
            score -= 10
        elif severity in {"MEDIUM", "MED"}:
            score -= 5
        elif severity == "LOW":
            score -= 2

    return max(0, score)


def calculate_technical_score(submissions: list[CodeSubmission]) -> int:
    """
    Calculate technical score from code submissions.

    Score is calculated as the weighted average of test pass rates:
    - For each submission: (tests_passed / tests_total) * 100
    - Final score is the average of all submission scores

    Returns 0 if no submissions exist.
    """
    if not submissions:
        return 0

    if not EXPECTED_CODING_QUESTION_IDS:
        return 0

    scores_by_question = {qid: 0.0 for qid in EXPECTED_CODING_QUESTION_IDS}

    for sub in submissions:
        if sub.question_id in scores_by_question and sub.tests_total and sub.tests_total > 0:
            submission_score = (sub.tests_passed / sub.tests_total) * 100
            scores_by_question[sub.question_id] = max(scores_by_question[sub.question_id], submission_score)

    total_score = sum(scores_by_question.values())
    return round(total_score / len(scores_by_question))


def _parse_candidate_skills(candidate: Candidate) -> list[str]:
    resume_parsed = candidate.resume_parsed_data
    if isinstance(resume_parsed, str):
        try:
            resume_parsed = json.loads(resume_parsed)
        except json.JSONDecodeError:
            resume_parsed = {}
    if not isinstance(resume_parsed, dict):
        resume_parsed = {}

    raw_skills = resume_parsed.get("skills", [])
    if isinstance(raw_skills, str):
        parsed = [s.strip() for s in raw_skills.split(",") if s.strip()]
    elif isinstance(raw_skills, list):
        parsed = [str(s).strip() for s in raw_skills if str(s).strip()]
    else:
        parsed = []

    normalized: list[str] = []
    seen: set[str] = set()
    for skill in parsed:
        key = skill.lower()
        if key not in seen:
            normalized.append(skill)
            seen.add(key)
    return normalized


def _calculate_rank_score(
    *,
    technical_score: int,
    psychometric_score: int,
    integrity_score: int,
    skill_signal: int,
    teamwork_score: int = 0,
) -> float:
    score = (
        technical_score * 0.42
        + psychometric_score * 0.22
        + integrity_score * 0.21
        + teamwork_score * 0.10
        + skill_signal * 0.05
    )
    return round(score, 2)


# ============== API Endpoints ==============


@router.get("/candidate/{candidate_id}", response_model=CandidateDetailResponse)
async def get_candidate_detail(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get full candidate profile with all related data.

    This is the "Mega-Endpoint" for the recruiter detail view.
    Returns everything needed to display a complete candidate profile:
    - Basic info (name, email, status)
    - Resume data (parsed zones, skills)
    - Assessment scores (technical, psychometric)
    - Glass Box AI decision (rationale, recommendation, confidence)
    - Code submissions history
    - Proctoring timeline (recent events)
    - Integrity score (calculated from events)
    """
    # Get candidate with user info
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()

    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found",
        )

    # Get associated user
    user = db.query(User).filter(User.id == candidate.user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found for candidate",
        )

    # Get code submissions
    submissions = (
        db.query(CodeSubmission)
        .filter(CodeSubmission.candidate_id == candidate_id)
        .order_by(CodeSubmission.id.desc())
        .all()
    )

    # Get proctoring logs (sorted by timestamp ascending for chart display)
    logs = (
        db.query(ProctoringLog)
        .filter(ProctoringLog.candidate_id == candidate_id)
        .order_by(ProctoringLog.timestamp.asc())
        .all()
    )

    # Calculate metrics in real-time from related data
    high_severity_count = 0
    medium_severity_count = 0
    low_severity_count = 0
    for log in logs:
        severity = (log.severity or "").upper()
        if severity == "HIGH":
            high_severity_count += 1
        elif severity in {"MEDIUM", "MED"}:
            medium_severity_count += 1
        elif severity == "LOW":
            low_severity_count += 1
    integrity_score = calculate_integrity_score(logs)
    technical_score = calculate_technical_score(submissions)

    # Parse resume data safely
    resume_parsed_data = candidate.resume_parsed_data
    if isinstance(resume_parsed_data, str):
        try:
            resume_parsed_data = json.loads(resume_parsed_data)
        except json.JSONDecodeError:
            resume_parsed_data = {}
    if not isinstance(resume_parsed_data, dict):
        resume_parsed_data = {}

    skills = resume_parsed_data.get("skills", [])
    experience_years = resume_parsed_data.get("experience_years")
    experience_zone = resume_parsed_data.get("experience_zone")
    if isinstance(experience_zone, str):
        # Prefer derived value from EXPERIENCE zone to avoid stale/wrong values
        # that may have been computed from whole-document year spans.
        experience_years = estimate_experience_years(experience_zone)

    passed_questions = {
        sub.question_id
        for sub in submissions
        if sub.is_passed and sub.question_id in EXPECTED_CODING_QUESTION_IDS
    }
    passed_submissions = len(passed_questions)

    # Calculate originality ratio + pull chat response
    total_typed = 0
    total_pasted = 0
    chat_response = None
    teamwork_score = 0
    for sub in submissions:
        if sub.char_breakdown and isinstance(sub.char_breakdown, dict):
            total_typed += sub.char_breakdown.get("typed", 0)
            total_pasted += sub.char_breakdown.get("pasted", 0)
        if sub.chat_response and not chat_response:
            chat_response = sub.chat_response
            teamwork_score = sub.teamwork_score or 0

    total_chars = total_typed + total_pasted
    originality_ratio = round((total_typed / total_chars) * 100) if total_chars > 0 else 100

    baseline_summary = evaluate_baseline(
        resume_skills=skills if isinstance(skills, list) else [],
        experience_years=experience_years if isinstance(experience_years, int) else None,
        technical_score=technical_score,
        integrity_score=integrity_score,
        resume_text_raw=candidate.resume_text_raw,
    )
    candidate_skills_norm = [str(s).strip().lower() for s in skills] if isinstance(skills, list) else []
    role_tags = _derive_role_tags(
        candidate_skills_norm=candidate_skills_norm,
        technical_score=technical_score,
        psychometric_score=candidate.psychometric_score or 0,
        integrity_score=integrity_score,
        teamwork_score=teamwork_score,
    )

    # Ensure AI rationale is resume-aware and up to date
    candidate_data = {
        "full_name": user.full_name,
        "technical_score": technical_score,
        "psychometric_score": candidate.psychometric_score or 0,
        "integrity_flags": len(logs),
        "high_severity_flags": high_severity_count,
        "medium_severity_flags": medium_severity_count,
        "low_severity_flags": low_severity_count,
        "integrity_score": integrity_score,
        "submissions_count": len(submissions),
        "passed_submissions": passed_submissions,
        "skills": skills,
        "experience_years": experience_years,
        "resume_parsed_data": resume_parsed_data,
        "resume_text_raw": candidate.resume_text_raw,
        "ai_rationale": candidate.ai_rationale,
        "hiring_recommendation": candidate.hiring_recommendation,
        "confidence_score": candidate.confidence_score,
        "chat_response": chat_response,
        "teamwork_score": teamwork_score,
        "originality_ratio": originality_ratio,
        "baseline_summary": baseline_summary,
    }

    ai_result = generate_hiring_rationale(candidate_data)
    if (
        candidate.ai_rationale != ai_result["rationale"]
        or candidate.hiring_recommendation != ai_result["recommendation"]
        or candidate.confidence_score != ai_result["confidence_score"]
    ):
        candidate.ai_rationale = ai_result["rationale"]
        candidate.hiring_recommendation = ai_result["recommendation"]
        candidate.confidence_score = ai_result["confidence_score"]
        db.commit()
        db.refresh(candidate)

    # Update candidate record with calculated scores (for fast list view queries)
    if technical_score != candidate.technical_score:
        candidate.technical_score = technical_score
        db.commit()
        db.refresh(candidate)

    # Build response with real-time aggregated data
    return CandidateDetailResponse(
        id=candidate.id,
        user_id=candidate.user_id,
        email=user.email,
        full_name=user.full_name,
        status=candidate.status or "Registered",
        reset_requested=bool(candidate.reset_requested),
        reset_reason=candidate.reset_reason,
        decision_note=candidate.decision_note,
        decision_updated_at=candidate.decision_updated_at,
        baseline_summary=baseline_summary,
        recommended_role_tags=role_tags,
        resume_parsed_data=resume_parsed_data,
        has_resume=bool(candidate.resume_text_raw),
        resume_text_raw=candidate.resume_text_raw,
        technical_score=technical_score,
        psychometric_score=candidate.psychometric_score or 0,
        ai_rationale=candidate.ai_rationale,
        hiring_recommendation=candidate.hiring_recommendation,
        confidence_score=candidate.confidence_score,
        total_proctoring_events=len(logs),
        high_severity_events=high_severity_count,
        integrity_score=integrity_score,
        submissions=[
            SubmissionSummary(
                id=s.id,
                question_id=s.question_id,
                is_passed=s.is_passed or False,
                tests_passed=s.tests_passed or 0,
                tests_total=s.tests_total or 0,
                execution_time_ms=s.execution_time_ms,
                # Innovation Trinity fields
                code_history=s.code_history if s.code_history else [],
                char_breakdown=s.char_breakdown if s.char_breakdown else {"typed": 0, "pasted": 0},
                chat_response=s.chat_response,
                teamwork_score=s.teamwork_score,
                submitted_code=s.submitted_code,
            )
            for s in submissions
        ],
        recent_logs=[
            LogSummary(
                id=log.id,
                event_type=log.event_type,
                severity=log.severity,
                timestamp=log.timestamp,
                has_evidence=log.evidence_snapshot is not None,
            )
            for log in logs[-20:]  # Most recent 20 logs (end of asc-sorted list)
        ],
    )


@router.get("/candidates")
async def list_candidates(
    status_filter: Optional[str] = None,
    recommendation: Optional[str] = None,
    skills: Optional[str] = None,
    match_mode: Optional[str] = "any",
    min_skill_match: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all candidates with basic info.

    Optional filters:
    - status_filter: Filter by candidate status
    - recommendation: Filter by hiring recommendation
    - limit/offset: Pagination
    """
    # Log the request for debugging
    print(f"📋 [DASHBOARD] Fetching candidates for user {current_user.id} (role: {current_user.role})")
    logger.info(f"Fetching candidates for user {current_user.id}")

    # Only recruiters can view candidate list
    if current_user.role != "recruiter":
        print(f"❌ [DASHBOARD] Access denied - user {current_user.id} is not a recruiter")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only recruiters can access the candidate list",
        )

    try:
        query = db.query(Candidate)

        if status_filter:
            query = query.filter(Candidate.status == status_filter)

        if recommendation:
            query = query.filter(Candidate.hiring_recommendation == recommendation)

        required_skills = []
        if skills:
            required_skills = [
                s.strip().lower() for s in skills.split(",") if s.strip()
            ]
        normalized_match_mode = (match_mode or "any").strip().lower()
        if normalized_match_mode not in {"any", "all"}:
            normalized_match_mode = "any"

        skill_match_floor = None
        if min_skill_match is not None:
            try:
                skill_match_floor = max(0, min(100, int(min_skill_match)))
            except (TypeError, ValueError):
                skill_match_floor = None

        candidates_pool = query.all()
        available_skills_map: dict[str, str] = {}
        available_role_tags: set[str] = set()
        candidate_meta: dict[int, dict] = {}
        filtered_candidates: list[Candidate] = []

        for candidate in candidates_pool:
            user = db.query(User).filter(User.id == candidate.user_id).first()
            candidate_skills_display = _parse_candidate_skills(candidate)
            candidate_skills_norm = [s.lower() for s in candidate_skills_display]
            for skill in candidate_skills_display:
                key = skill.lower()
                if key not in available_skills_map:
                    available_skills_map[key] = skill

            matched_skills = [s for s in required_skills if s in candidate_skills_norm]
            missing_skills = [s for s in required_skills if s not in candidate_skills_norm]
            skill_match_percent = (
                round((len(matched_skills) / len(required_skills)) * 100)
                if required_skills
                else None
            )

            if required_skills:
                if normalized_match_mode == "all" and missing_skills:
                    include_candidate = False
                elif normalized_match_mode == "any" and not matched_skills:
                    include_candidate = False
                else:
                    include_candidate = True
                if include_candidate and skill_match_floor is not None:
                    include_candidate = (skill_match_percent or 0) >= skill_match_floor
            else:
                include_candidate = True

            logs = db.query(ProctoringLog).filter(ProctoringLog.candidate_id == candidate.id).all()
            flags_count = sum(
                1 for log in logs if (log.severity or "").upper() in {"HIGH", "MEDIUM", "MED"}
            )
            integrity_score = calculate_integrity_score(logs)
            submissions = db.query(CodeSubmission).filter(CodeSubmission.candidate_id == candidate.id).all()
            submissions_count = len(submissions)
            teamwork_score = _avg_teamwork_score(submissions)

            tech_score = candidate.technical_score if candidate.technical_score is not None else 0
            psych_score = candidate.psychometric_score if candidate.psychometric_score is not None else 0
            skill_signal = (
                skill_match_percent
                if skill_match_percent is not None
                else min(100, len(candidate_skills_norm) * 15)
            )
            role_tags = _derive_role_tags(
                candidate_skills_norm=candidate_skills_norm,
                technical_score=tech_score,
                psychometric_score=psych_score,
                integrity_score=integrity_score,
                teamwork_score=teamwork_score,
            )
            available_role_tags.update(role_tags)
            rank_score = _calculate_rank_score(
                technical_score=tech_score,
                psychometric_score=psych_score,
                integrity_score=integrity_score,
                skill_signal=skill_signal,
                teamwork_score=teamwork_score,
            )

            try:
                last_action = (
                    db.query(CandidateActionLog)
                    .filter(CandidateActionLog.candidate_id == candidate.id)
                    .order_by(CandidateActionLog.created_at.desc())
                    .first()
                )
            except OperationalError:
                # Some local/dev DB snapshots may not include this table yet.
                # Keep listing candidates instead of failing the entire dashboard.
                last_action = None

            candidate_meta[candidate.id] = {
                "user": user,
                "tech_score": tech_score,
                "psych_score": psych_score,
                "submissions_count": submissions_count,
                "flags_count": flags_count,
                "candidate_skills_display": candidate_skills_display,
                "candidate_skills_norm": candidate_skills_norm,
                "matched_skills": matched_skills if required_skills else None,
                "missing_skills": missing_skills if required_skills else None,
                "skill_match_percent": skill_match_percent,
                "teamwork_score": teamwork_score,
                "integrity_score": integrity_score,
                "role_tags": role_tags,
                "rank_score": rank_score,
                "last_action": last_action,
            }
            if include_candidate:
                filtered_candidates.append(candidate)

        global_rank_map: dict[int, int] = {}
        for idx, (cid, _) in enumerate(
            sorted(
                ((cid, data["rank_score"]) for cid, data in candidate_meta.items()),
                key=lambda item: item[1],
                reverse=True,
            ),
            start=1,
        ):
            global_rank_map[cid] = idx

        selected_rank_skill = required_skills[0] if required_skills else None
        skill_rank_map: dict[int, int] = {}
        if selected_rank_skill:
            skill_candidates = [
                (cid, data["rank_score"])
                for cid, data in candidate_meta.items()
                if selected_rank_skill in data["candidate_skills_norm"]
            ]
            for idx, (cid, _) in enumerate(
                sorted(skill_candidates, key=lambda item: item[1], reverse=True), start=1
            ):
                skill_rank_map[cid] = idx

        filtered_candidates = sorted(
            filtered_candidates,
            key=lambda c: candidate_meta[c.id]["rank_score"],
            reverse=True,
        )
        total = len(filtered_candidates)
        candidates = filtered_candidates[offset : offset + limit]

        print(f"✅ [DASHBOARD] Found {total} candidates")

        result = []
        for candidate in candidates:
            meta = candidate_meta[candidate.id]
            user = meta["user"]
            last_action = meta["last_action"]
            result.append(
                CandidateListItem(
                    id=candidate.id,
                    email=user.email if user else "",
                    full_name=user.full_name if user else "Unknown",
                    status=candidate.status or "Registered",
                    technical_score=meta["tech_score"],
                    psychometric_score=meta["psych_score"],
                    hiring_recommendation=candidate.hiring_recommendation,
                    total_submissions=meta["submissions_count"],
                    total_flags=meta["flags_count"],
                    skill_match_percent=meta["skill_match_percent"],
                    matched_skills=meta["matched_skills"],
                    missing_skills=meta["missing_skills"],
                    candidate_skills=meta["candidate_skills_display"],
                    overall_rank_score=meta["rank_score"],
                    overall_rank_position=global_rank_map.get(candidate.id),
                    skill_rank_position=skill_rank_map.get(candidate.id),
                    role_tags=meta["role_tags"],
                    last_action=last_action.action if last_action else None,
                    last_action_at=last_action.created_at if last_action else None,
                )
            )

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "candidates": result,
            "available_skills": sorted(available_skills_map.values(), key=lambda x: x.lower()),
            "available_role_tags": sorted(available_role_tags),
            "skill_ranking_for": selected_rank_skill,
        }

    except Exception as e:
        print(f"❌ [DASHBOARD] Error fetching candidates: {str(e)}")
        logger.error(f"Error fetching candidates: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch candidates: {str(e)}",
        )


@router.get("/rankings")
async def get_candidate_rankings(
    role_tag: Optional[str] = None,
    skills: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Dedicated rankings endpoint for recruiter ranking view.

    Returns:
    - Global ranking of all candidates
    - Optional role-tag specific ranking
    - Optional skill-filtered ranking slice
    """
    if current_user.role != "recruiter":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only recruiters can access candidate rankings",
        )

    requested_skills = [s.strip().lower() for s in (skills or "").split(",") if s.strip()]
    selected_role_tag = (role_tag or "").strip()

    candidates = db.query(Candidate).all()
    available_skills_map: dict[str, str] = {}
    available_role_tags: set[str] = set()
    snapshots: list[dict[str, Any]] = []

    for candidate in candidates:
        user = db.query(User).filter(User.id == candidate.user_id).first()
        if not user:
            continue

        candidate_skills_display = _parse_candidate_skills(candidate)
        candidate_skills_norm = [s.lower() for s in candidate_skills_display]
        for skill in candidate_skills_display:
            key = skill.lower()
            if key not in available_skills_map:
                available_skills_map[key] = skill

        logs = db.query(ProctoringLog).filter(ProctoringLog.candidate_id == candidate.id).all()
        submissions = db.query(CodeSubmission).filter(CodeSubmission.candidate_id == candidate.id).all()

        integrity_score = calculate_integrity_score(logs)
        teamwork_score = _avg_teamwork_score(submissions)
        technical_score = candidate.technical_score if candidate.technical_score is not None else 0
        psychometric_score = candidate.psychometric_score if candidate.psychometric_score is not None else 0

        matched_skills = [s for s in requested_skills if s in candidate_skills_norm]
        skill_signal = (
            round((len(matched_skills) / len(requested_skills)) * 100)
            if requested_skills
            else min(100, len(candidate_skills_norm) * 15)
        )

        role_tags = _derive_role_tags(
            candidate_skills_norm=candidate_skills_norm,
            technical_score=technical_score,
            psychometric_score=psychometric_score,
            integrity_score=integrity_score,
            teamwork_score=teamwork_score,
        )
        available_role_tags.update(role_tags)

        rank_score = _calculate_rank_score(
            technical_score=technical_score,
            psychometric_score=psychometric_score,
            integrity_score=integrity_score,
            skill_signal=skill_signal,
            teamwork_score=teamwork_score,
        )

        snapshots.append(
            {
                "candidate_id": candidate.id,
                "email": user.email,
                "full_name": user.full_name,
                "status": candidate.status or "Registered",
                "hiring_recommendation": candidate.hiring_recommendation,
                "technical_score": technical_score,
                "psychometric_score": psychometric_score,
                "integrity_score": integrity_score,
                "teamwork_score": teamwork_score,
                "overall_rank_score": rank_score,
                "role_tags": role_tags,
                "candidate_skills": candidate_skills_display,
                "candidate_skills_norm": candidate_skills_norm,
            }
        )

    sorted_all = sorted(snapshots, key=lambda row: row["overall_rank_score"], reverse=True)
    global_rank_map: dict[int, int] = {
        row["candidate_id"]: idx for idx, row in enumerate(sorted_all, start=1)
    }

    role_rank_maps: dict[str, dict[int, int]] = {}
    for tag in available_role_tags:
        role_rows = [row for row in sorted_all if tag in row["role_tags"]]
        role_rank_maps[tag] = {
            row["candidate_id"]: idx for idx, row in enumerate(role_rows, start=1)
        }

    filtered_rows = sorted_all
    if selected_role_tag:
        filtered_rows = [row for row in filtered_rows if selected_role_tag in row["role_tags"]]
    if requested_skills:
        filtered_rows = [
            row
            for row in filtered_rows
            if any(skill in row["candidate_skills_norm"] for skill in requested_skills)
        ]

    total = len(filtered_rows)
    rows_page = filtered_rows[offset : offset + limit]
    ranking_rows: list[RankingListItem] = []

    for row in rows_page:
        ranking_rows.append(
            RankingListItem(
                candidate_id=row["candidate_id"],
                email=row["email"],
                full_name=row["full_name"],
                status=row["status"],
                hiring_recommendation=row["hiring_recommendation"],
                technical_score=row["technical_score"],
                psychometric_score=row["psychometric_score"],
                integrity_score=row["integrity_score"],
                teamwork_score=row["teamwork_score"],
                overall_rank_score=row["overall_rank_score"],
                overall_rank_position=global_rank_map[row["candidate_id"]],
                role_rank_position=(
                    role_rank_maps.get(selected_role_tag, {}).get(row["candidate_id"])
                    if selected_role_tag
                    else None
                ),
                role_tags=row["role_tags"],
                candidate_skills=row["candidate_skills"],
            )
        )

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "ranking": ranking_rows,
        "role_ranking_for": selected_role_tag or None,
        "available_role_tags": sorted(available_role_tags),
        "available_skills": sorted(available_skills_map.values(), key=lambda x: x.lower()),
        "generated_at": datetime.utcnow().isoformat(),
    }


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get dashboard overview statistics.

    Returns aggregate counts for quick dashboard overview.
    """
    if current_user.role != "recruiter":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only recruiters can access dashboard stats",
        )

    total = db.query(Candidate).count()
    completed = db.query(Candidate).filter(Candidate.status == "Completed").count()
    pending = db.query(Candidate).filter(Candidate.hiring_recommendation == "REVIEW").count()
    hire = db.query(Candidate).filter(Candidate.hiring_recommendation == "HIRE").count()
    no_hire = db.query(Candidate).filter(Candidate.hiring_recommendation == "NO_HIRE").count()

    return DashboardStats(
        total_candidates=total,
        completed_assessments=completed,
        pending_review=pending,
        recommended_hire=hire,
        recommended_no_hire=no_hire,
    )


@router.put("/candidate/{candidate_id}/scores")
async def update_candidate_scores(
    candidate_id: int,
    technical_score: Optional[int] = None,
    psychometric_score: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update candidate assessment scores.

    Scores should be 0-100.
    """
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()

    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found",
        )

    if technical_score is not None:
        if not 0 <= technical_score <= 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Technical score must be between 0 and 100",
            )
        candidate.technical_score = technical_score

    if psychometric_score is not None:
        if not 0 <= psychometric_score <= 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Psychometric score must be between 0 and 100",
            )
        candidate.psychometric_score = psychometric_score

    db.commit()
    db.refresh(candidate)

    return {
        "message": "Scores updated",
        "candidate_id": candidate_id,
        "technical_score": candidate.technical_score,
        "psychometric_score": candidate.psychometric_score,
    }


@router.get("/candidate/me/status")
async def get_my_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get current candidate's status (Candidate only).

    Returns the candidate's current status in the hiring pipeline.
    """
    if current_user.role != "candidate":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only candidates can access their own status",
        )

    candidate = db.query(Candidate).filter(Candidate.user_id == current_user.id).first()
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate profile not found",
        )

    resume_parsed_data = candidate.resume_parsed_data
    if isinstance(resume_parsed_data, str):
        try:
            resume_parsed_data = json.loads(resume_parsed_data)
        except json.JSONDecodeError:
            resume_parsed_data = {}
    if not isinstance(resume_parsed_data, dict):
        resume_parsed_data = {}

    skills = resume_parsed_data.get("skills", [])
    experience_years = resume_parsed_data.get("experience_years")
    experience_zone = resume_parsed_data.get("experience_zone")
    if isinstance(experience_zone, str):
        experience_years = estimate_experience_years(experience_zone)

    baseline_summary = evaluate_baseline(
        resume_skills=skills if isinstance(skills, list) else [],
        experience_years=experience_years if isinstance(experience_years, int) else None,
        technical_score=candidate.technical_score or 0,
        integrity_score=100,
        resume_text_raw=candidate.resume_text_raw,
    )
    baseline_gate = evaluate_resume_gate(baseline_summary)

    return {
        "status": candidate.status or "Registered",
        "candidate_id": candidate.id,
        "has_resume": bool(candidate.resume_text_raw),
        "decision_note": candidate.decision_note,
        "decision_updated_at": candidate.decision_updated_at,
        "baseline_gate": baseline_gate,
    }


@router.put("/candidate/{candidate_id}/status")
async def update_candidate_status(
    candidate_id: int,
    request: StatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update a candidate's status (Recruiter only).

    Valid statuses: 'Assessment Started', 'Completed', 'Under Review',
    'Interview Scheduled', 'Hired', 'Rejected'
    """
    if current_user.role != "recruiter":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only recruiters can update candidate status",
        )

    # Validate status
    valid_statuses = [
        "Registered",
        "Assessment Started",
        "Completed",
        "Under Review",
        "Interview Scheduled",
        "Hired",
        "Rejected",
    ]
    if request.status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {valid_statuses}",
        )

    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found",
        )

    status_changed = candidate.status != request.status
    candidate.status = request.status

    note_changed = False
    if request.decision_note is not None:
        cleaned_note = request.decision_note.strip()
        if cleaned_note == "":
            cleaned_note = None
        note_changed = (candidate.decision_note or None) != (cleaned_note or None)
        candidate.decision_note = cleaned_note

    if status_changed or note_changed:
        candidate.decision_updated_at = datetime.utcnow()
    db.commit()
    db.refresh(candidate)

    logger.info(f"Updated candidate {candidate_id} status to: {request.status}")

    return {
        "message": "Status updated",
        "status": candidate.status,
        "decision_note": candidate.decision_note,
        "decision_updated_at": candidate.decision_updated_at,
    }


@router.post("/candidate/{candidate_id}/action")
async def quick_candidate_action(
    candidate_id: int,
    request: QuickActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Quick recruiter actions on the pipeline list.
    Maps to status + hiring recommendation and logs an audit record.
    """
    if current_user.role != "recruiter":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only recruiters can take actions",
        )

    action = (request.action or "").strip().upper()
    if action not in ACTION_TO_STATUS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid action. Must be one of: ACCEPT, REJECT, REVIEW",
        )

    cleaned_note = None
    if request.note is not None:
        cleaned_note = request.note.strip() or None

    if action == "REJECT" and not cleaned_note:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reject action requires a note",
        )

    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found",
        )

    candidate.status = ACTION_TO_STATUS[action]
    candidate.hiring_recommendation = ACTION_TO_RECOMMENDATION[action]
    candidate.decision_note = cleaned_note
    candidate.decision_updated_at = datetime.utcnow()

    action_log = CandidateActionLog(
        candidate_id=candidate.id,
        recruiter_id=current_user.id,
        action=action,
        note=cleaned_note,
    )
    db.add(action_log)

    db.commit()
    db.refresh(candidate)

    return {
        "message": "Action recorded",
        "candidate_id": candidate.id,
        "status": candidate.status,
        "hiring_recommendation": candidate.hiring_recommendation,
        "decision_note": candidate.decision_note,
        "decision_updated_at": candidate.decision_updated_at,
        "action": action,
    }


@router.post("/candidate/request-reset")
async def request_assessment_reset(
    request: ResetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Candidate request to reset assessment (Candidate only).
    """
    if current_user.role != "candidate":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only candidates can request an assessment reset",
        )

    candidate = db.query(Candidate).filter(Candidate.user_id == current_user.id).first()
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate profile not found",
        )

    candidate.reset_requested = True
    candidate.reset_reason = request.reason
    db.commit()
    db.refresh(candidate)

    return {"message": "Reset request submitted"}


@router.post("/candidate/{candidate_id}/approve-reset")
async def approve_assessment_reset(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Approve a candidate reset request (Recruiter only).
    Resets status and clears assessment scores.
    """
    if current_user.role != "recruiter":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only recruiters can approve assessment resets",
        )

    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found",
        )

    candidate.status = "Registered"
    candidate.technical_score = 0
    candidate.psychometric_score = 0
    candidate.hiring_recommendation = None
    candidate.ai_rationale = None
    candidate.confidence_score = None
    candidate.reset_requested = False
    candidate.reset_reason = None

    # Deep reset: clear submissions and proctoring logs
    db.query(CodeSubmission).filter(CodeSubmission.candidate_id == candidate_id).update(
        {
            CodeSubmission.code_history: None,
            CodeSubmission.char_breakdown: None,
            CodeSubmission.chat_response: None,
        },
        synchronize_session=False,
    )
    db.query(CodeSubmission).filter(CodeSubmission.candidate_id == candidate_id).delete(
        synchronize_session=False
    )
    db.query(ProctoringLog).filter(ProctoringLog.candidate_id == candidate_id).delete(
        synchronize_session=False
    )

    db.commit()
    db.refresh(candidate)

    return {"message": "Reset approved", "status": candidate.status}
