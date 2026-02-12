"""
Assessment API endpoints.

Handles code submission and execution using the Docker Sandbox service.
"""

from typing import Optional, Any
import json

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import CodeSubmission, Candidate, ProctoringLog
from app.services import execute_code_safely, is_docker_available, generate_hiring_rationale, analyze_chat_response
from app.services.baseline import evaluate_baseline, evaluate_resume_gate
from app.services.zone_parser import estimate_experience_years
from app.api.v1.auth import get_current_user
from app.models import User

router = APIRouter()


# ============== Pydantic Schemas ==============


class TestCase(BaseModel):
    """Schema for a single test case."""

    input: Any
    expected: Any
    function: Optional[str] = "solution"
    unpack: bool = False


class CodeHistoryEntry(BaseModel):
    """Schema for a code history snapshot."""

    timestamp: int  # epoch milliseconds
    code: str


class CharBreakdown(BaseModel):
    """Schema for character typing breakdown."""

    typed: int = 0
    pasted: int = 0


class CodeSubmitRequest(BaseModel):
    """Schema for code submission request."""

    code: str
    question_id: int
    candidate_id: int
    test_cases: list[TestCase]

    # Innovation Trinity fields
    code_history: Optional[list[CodeHistoryEntry]] = None
    char_breakdown: Optional[CharBreakdown] = None
    chat_response: Optional[str] = None


class ChatResponseRequest(BaseModel):
    """Schema for chat response submission (teammate test)."""

    candidate_id: int
    question_id: int
    chat_response: str


class CodeSubmitResponse(BaseModel):
    """Schema for code submission response."""

    submission_id: int
    status: str  # "success", "partial", "error"
    tests_passed: int
    tests_total: int
    execution_time_ms: float
    results: list[dict]
    is_passed: bool
    mock_mode: bool = False
    error: Optional[str] = None


class QuestionWithTests(BaseModel):
    """Schema for a coding question with test cases."""

    question_id: int
    title: str
    description: str
    test_cases: list[TestCase]
    difficulty: str = "medium"


# ============== Sample Questions (In production, this would be in DB) ==============

EXPECTED_CODING_QUESTION_IDS = {1, 2}

SAMPLE_QUESTIONS = {
    1: {
        "title": "Two Sum",
        "description": "Given a list of numbers, return the sum of all numbers.",
        "test_cases": [
            {"input": [1, 2, 3], "expected": 6, "function": "solution"},
            {"input": [10, 20], "expected": 30, "function": "solution"},
            {"input": [], "expected": 0, "function": "solution"},
        ],
        "difficulty": "easy",
    },
    2: {
        "title": "Reverse String",
        "description": "Write a function that reverses a string.",
        "test_cases": [
            {"input": "hello", "expected": "olleh", "function": "solution"},
            {"input": "python", "expected": "nohtyp", "function": "solution"},
            {"input": "", "expected": "", "function": "solution"},
        ],
        "difficulty": "easy",
    },
    3: {
        "title": "Fibonacci",
        "description": "Return the nth Fibonacci number (0-indexed).",
        "test_cases": [
            {"input": 0, "expected": 0, "function": "solution"},
            {"input": 1, "expected": 1, "function": "solution"},
            {"input": 10, "expected": 55, "function": "solution"},
        ],
        "difficulty": "medium",
    },
}


# ============== API Endpoints ==============


@router.post("/submit", response_model=CodeSubmitResponse)
async def submit_code(
    submission: CodeSubmitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submit code for execution and evaluation.

    Runs the submitted code against test cases in a secure Docker sandbox.
    Saves the result to the database for tracking.

    Returns: Execution results with pass/fail status and metrics.
    """
    # Validate candidate exists
    candidate = db.query(Candidate).filter(Candidate.id == submission.candidate_id).first()
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found",
        )

    # Enforce resume baseline gate before allowing assessment
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
        technical_score=0,
        integrity_score=100,
        resume_text_raw=candidate.resume_text_raw,
    )
    baseline_gate = evaluate_resume_gate(baseline_summary)
    if not baseline_gate.get("allowed", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": "Baseline requirements not met. Assessment access blocked.",
                "baseline_gate": baseline_gate,
            },
        )

    # Convert test cases to dict format
    test_cases = [tc.model_dump() for tc in submission.test_cases]

    # Execute code in sandbox
    result = execute_code_safely(submission.code, test_cases)

    # Determine if passed (all tests passed)
    tests_passed = result.get("tests_passed", 0)
    tests_total = result.get("tests_total", len(test_cases))
    is_passed = tests_passed == tests_total and result.get("status") == "success"

    # Analyze chat response if provided (Simulated Teammate feature)
    teamwork_score = 0
    if submission.chat_response:
        chat_analysis = analyze_chat_response(submission.chat_response)
        teamwork_score = chat_analysis.get("teamwork_score", 0)

    # Save submission to database
    code_submission = CodeSubmission(
        candidate_id=submission.candidate_id,
        question_id=submission.question_id,
        submitted_code=submission.code,
        is_passed=is_passed,
        tests_passed=tests_passed,
        tests_total=tests_total,
        execution_time_ms=result.get("execution_time_ms", 0),
        memory_usage_mb=result.get("memory_usage_mb"),
        error_log=result.get("message") if result.get("status") == "error" else None,
        # Innovation Trinity fields
        code_history=[entry.model_dump() for entry in submission.code_history] if submission.code_history else [],
        char_breakdown=submission.char_breakdown.model_dump() if submission.char_breakdown else {"typed": 0, "pasted": 0},
        chat_response=submission.chat_response,
        teamwork_score=teamwork_score,
    )

    db.add(code_submission)

    # Update candidate status if first submission
    if candidate.status == "Registered":
        candidate.status = "Assessment_Started"

    db.commit()
    db.refresh(code_submission)

    return CodeSubmitResponse(
        submission_id=code_submission.id,
        status=result.get("status", "error"),
        tests_passed=tests_passed,
        tests_total=tests_total,
        execution_time_ms=result.get("execution_time_ms", 0),
        results=result.get("results", []),
        is_passed=is_passed,
        mock_mode=result.get("mock_mode", False),
        error=result.get("message") if result.get("status") == "error" else None,
    )


@router.post("/chat-response")
async def submit_chat_response(
    request: ChatResponseRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Save teammate chat response even if no code submission is made.
    """
    candidate = db.query(Candidate).filter(Candidate.id == request.candidate_id).first()
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found",
        )

    chat_response = request.chat_response.strip()
    if not chat_response:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chat response cannot be empty",
        )

    chat_analysis = analyze_chat_response(chat_response)
    teamwork_score = chat_analysis.get("teamwork_score", 0)

    submission = (
        db.query(CodeSubmission)
        .filter(CodeSubmission.candidate_id == request.candidate_id)
        .order_by(CodeSubmission.id.desc())
        .first()
    )

    if submission:
        submission.chat_response = chat_response
        submission.teamwork_score = teamwork_score
    else:
        submission = CodeSubmission(
            candidate_id=request.candidate_id,
            question_id=request.question_id,
            submitted_code="",
            is_passed=False,
            tests_passed=0,
            tests_total=0,
            execution_time_ms=0,
            code_history=[],
            char_breakdown={"typed": 0, "pasted": 0},
            chat_response=chat_response,
            teamwork_score=teamwork_score,
        )
        db.add(submission)

    db.commit()

    return {
        "message": "Chat response saved",
        "teamwork_score": teamwork_score,
    }


@router.get("/questions")
async def get_questions():
    """
    Get list of available coding questions.

    Returns basic info without test cases (to prevent cheating).
    """
    questions = []
    for qid, q in SAMPLE_QUESTIONS.items():
        questions.append({
            "question_id": qid,
            "title": q["title"],
            "description": q["description"],
            "difficulty": q["difficulty"],
            "test_count": len(q["test_cases"]),
        })
    return {"questions": questions}


@router.get("/questions/{question_id}")
async def get_question(question_id: int):
    """
    Get a specific question with test cases.

    In production, you might want to hide some test cases.
    """
    if question_id not in SAMPLE_QUESTIONS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question not found",
        )

    q = SAMPLE_QUESTIONS[question_id]
    return {
        "question_id": question_id,
        "title": q["title"],
        "description": q["description"],
        "difficulty": q["difficulty"],
        "test_cases": q["test_cases"],
    }


@router.get("/status")
async def get_sandbox_status():
    """
    Check if the Docker sandbox is available.

    Returns sandbox status and mode (docker/mock).
    """
    docker_available = is_docker_available()
    return {
        "docker_available": docker_available,
        "mode": "docker" if docker_available else "mock",
        "message": (
            "Docker sandbox is ready for secure code execution"
            if docker_available
            else "Running in mock mode (Docker not available)"
        ),
    }


@router.get("/candidate/{candidate_id}/submissions")
async def get_candidate_submissions(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get all code submissions for a candidate.

    Returns submission history with results.
    """
    submissions = (
        db.query(CodeSubmission)
        .filter(CodeSubmission.candidate_id == candidate_id)
        .order_by(CodeSubmission.id.desc())
        .all()
    )

    return {
        "candidate_id": candidate_id,
        "total_submissions": len(submissions),
        "submissions": [
            {
                "id": s.id,
                "question_id": s.question_id,
                "is_passed": s.is_passed,
                "tests_passed": s.tests_passed,
                "tests_total": s.tests_total,
                "execution_time_ms": s.execution_time_ms,
                "error_log": s.error_log,
            }
            for s in submissions
        ],
    }


# ============== Assessment Completion ==============


class CompleteAssessmentRequest(BaseModel):
    """Schema for completing an assessment."""

    candidate_id: int
    behavioral_score: int = 0  # Score from behavioral/text questions (0-100)


class CompleteAssessmentResponse(BaseModel):
    """Schema for assessment completion response."""

    candidate_id: int
    status: str
    technical_score: int
    psychometric_score: int
    integrity_flags: int
    hiring_recommendation: str
    confidence_score: int
    ai_rationale: str
    message: str


@router.post("/complete", response_model=CompleteAssessmentResponse)
async def complete_assessment(
    request: CompleteAssessmentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Complete a candidate's assessment and generate AI hiring recommendation.

    This endpoint:
    1. Calculates final technical score from code submissions
    2. Counts proctoring integrity flags
    3. Generates Glass Box AI rationale using Gemini
    4. Saves results to the candidate record
    5. Updates candidate status to 'Completed'

    The AI recommendation is transparent and explainable (Glass Box approach).
    """
    # Get candidate
    candidate = db.query(Candidate).filter(Candidate.id == request.candidate_id).first()
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found",
        )

    # Get associated user for name
    user = db.query(User).filter(User.id == candidate.user_id).first()
    full_name = user.full_name if user else "Unknown"

    # Calculate technical score from submissions
    submissions = (
        db.query(CodeSubmission)
        .filter(CodeSubmission.candidate_id == request.candidate_id)
        .all()
    )

    technical_score = 0
    passed_submissions = 0
    if submissions and EXPECTED_CODING_QUESTION_IDS:
        scores_by_question = {qid: 0.0 for qid in EXPECTED_CODING_QUESTION_IDS}
        passed_questions = set()
        for sub in submissions:
            if sub.question_id in scores_by_question and sub.tests_total and sub.tests_total > 0:
                submission_score = (sub.tests_passed / sub.tests_total) * 100
                scores_by_question[sub.question_id] = max(scores_by_question[sub.question_id], submission_score)
                if sub.is_passed:
                    passed_questions.add(sub.question_id)

        technical_score = round(sum(scores_by_question.values()) / len(scores_by_question))
        passed_submissions = len(passed_questions)

    # Get proctoring logs and count flags
    logs = (
        db.query(ProctoringLog)
        .filter(ProctoringLog.candidate_id == request.candidate_id)
        .all()
    )

    integrity_flags = len(logs)
    high_severity_flags = 0
    medium_severity_flags = 0
    low_severity_flags = 0
    for log in logs:
        severity = (log.severity or "").upper()
        if severity == "HIGH":
            high_severity_flags += 1
        elif severity in {"MEDIUM", "MED"}:
            medium_severity_flags += 1
        elif severity == "LOW":
            low_severity_flags += 1

    integrity_score = max(
        0,
        100
        - (high_severity_flags * 10)
        - (medium_severity_flags * 5)
        - (low_severity_flags * 2),
    )

    # Extract skills from resume if available
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

    # Save the behavioral score from frontend
    if request.behavioral_score > 0:
        candidate.psychometric_score = request.behavioral_score

    # Calculate originality ratio from char_breakdown
    total_typed = 0
    total_pasted = 0
    chat_response = None
    teamwork_score = 0

    for sub in submissions:
        if sub.char_breakdown and isinstance(sub.char_breakdown, dict):
            total_typed += sub.char_breakdown.get("typed", 0)
            total_pasted += sub.char_breakdown.get("pasted", 0)
        # Get chat response from first submission that has it
        if sub.chat_response and not chat_response:
            chat_response = sub.chat_response
            teamwork_score = sub.teamwork_score or 0

    total_chars = total_typed + total_pasted
    originality_ratio = round((total_typed / total_chars) * 100) if total_chars > 0 else 100

    # Prepare data for Glass Box AI
    candidate_data = {
        "full_name": full_name,
        "technical_score": technical_score,
        "psychometric_score": request.behavioral_score if request.behavioral_score > 0 else (candidate.psychometric_score or 0),
        "integrity_flags": integrity_flags,
        "high_severity_flags": high_severity_flags,
        "medium_severity_flags": medium_severity_flags,
        "low_severity_flags": low_severity_flags,
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
        # Innovation Trinity metrics
        "chat_response": chat_response,
        "teamwork_score": teamwork_score,
        "originality_ratio": originality_ratio,
    }

    # Generate AI recommendation
    ai_result = generate_hiring_rationale(candidate_data)

    # Update candidate record
    candidate.technical_score = technical_score
    candidate.psychometric_score = request.behavioral_score if request.behavioral_score > 0 else (candidate.psychometric_score or 0)
    candidate.ai_rationale = ai_result["rationale"]
    candidate.hiring_recommendation = ai_result["recommendation"]
    candidate.confidence_score = ai_result["confidence_score"]
    candidate.status = "Completed"

    db.commit()
    db.refresh(candidate)

    return CompleteAssessmentResponse(
        candidate_id=candidate.id,
        status="Completed",
        technical_score=technical_score,
        psychometric_score=candidate.psychometric_score or 0,
        integrity_flags=integrity_flags,
        hiring_recommendation=ai_result["recommendation"],
        confidence_score=ai_result["confidence_score"],
        ai_rationale=ai_result["rationale"],
        message="Assessment completed successfully. AI recommendation generated.",
    )
