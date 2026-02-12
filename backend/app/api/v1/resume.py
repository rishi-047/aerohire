"""
Resume API endpoints.

Handles resume upload and parsing using the Zone Parser service.
"""

import os
import tempfile
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import Candidate
from app.services import (
    parse_resume_zones,
    parse_resume_docx,
    parse_resume_text,
    extract_skills_list,
    extract_skills_from_text,
)
from app.services.baseline import evaluate_baseline, evaluate_resume_gate
from app.api.v1.auth import get_current_user
from app.models import User

router = APIRouter()


# ============== Pydantic Schemas ==============


class ResumeParseResponse(BaseModel):
    """Schema for resume parsing response."""

    skills_zone: Optional[str] = None
    experience_zone: Optional[str] = None
    education_zone: Optional[str] = None
    raw_text: str
    experience_years: Optional[int] = None
    zones_found: list[str]
    parsing_success: bool
    extracted_skills: list[str] = []
    error: Optional[str] = None


class ResumeUpdateRequest(BaseModel):
    """Schema for manual resume data update."""

    skills: list[str] = []
    experience_years: Optional[int] = None
    education: Optional[str] = None


# ============== API Endpoints ==============


@router.post("/upload", response_model=ResumeParseResponse)
async def upload_resume(
    file: UploadFile = File(...),
    candidate_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload and parse a resume PDF or DOCX.

    Extracts structured zones (skills, experience, education) from the PDF.
    If candidate_id is provided, updates the candidate's profile with parsed data.

    Accepts: PDF or DOCX files
    Returns: Parsed zones and extracted skills list
    """
    # Validate file type
    if not (file.filename.lower().endswith(".pdf") or file.filename.lower().endswith(".docx")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF or DOCX files are accepted",
        )

    # Save uploaded file to temp location
    try:
        suffix = ".pdf" if file.filename.lower().endswith(".pdf") else ".docx"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_path = temp_file.name

        # Parse the resume using zone parser
        if suffix == ".docx":
            parse_result = parse_resume_docx(temp_path)
        else:
            parse_result = parse_resume_zones(temp_path)

        # Extract individual skills from skills zone
        extracted_skills: list[str] = []
        if parse_result.get("skills_zone"):
            extracted_skills.extend(extract_skills_list(parse_result["skills_zone"]))
        extracted_skills.extend(extract_skills_from_text(parse_result.get("raw_text", "")))
        if extracted_skills:
            extracted_skills = sorted(set(extracted_skills))

        # If candidate_id provided, update their profile.
        # Otherwise, fall back to the current candidate user.
        target_candidate_id = candidate_id
        if not target_candidate_id and current_user.role == "candidate":
            candidate = db.query(Candidate).filter(Candidate.user_id == current_user.id).first()
            if candidate:
                target_candidate_id = candidate.id

        if target_candidate_id:
            candidate = db.query(Candidate).filter(Candidate.id == target_candidate_id).first()
            if candidate:
                experience_years = parse_result.get("experience_years")
                baseline_summary = evaluate_baseline(
                    resume_skills=extracted_skills,
                    experience_years=experience_years if isinstance(experience_years, int) else None,
                    technical_score=0,
                    integrity_score=100,
                    resume_text_raw=parse_result.get("raw_text", ""),
                )
                baseline_gate = evaluate_resume_gate(baseline_summary)

                # Store parsed data as JSON
                candidate.resume_parsed_data = {
                    "name": parse_result.get("name"),
                    "skills": extracted_skills,
                    "skills_zone": parse_result.get("skills_zone"),
                    "experience_zone": parse_result.get("experience_zone"),
                    "education_zone": parse_result.get("education_zone"),
                    "experience_years": parse_result.get("experience_years"),
                    "zones_found": parse_result.get("zones_found", []),
                    "baseline_gate": baseline_gate,
                }
                candidate.resume_text_raw = parse_result.get("raw_text", "")
                db.commit()

        # Build response
        response = ResumeParseResponse(
            skills_zone=parse_result.get("skills_zone"),
            experience_zone=parse_result.get("experience_zone"),
            education_zone=parse_result.get("education_zone"),
            raw_text=parse_result.get("raw_text", ""),
            experience_years=parse_result.get("experience_years"),
            zones_found=parse_result.get("zones_found", []),
            parsing_success=parse_result.get("parsing_success", False),
            extracted_skills=extracted_skills,
            error=parse_result.get("error"),
        )

        return response

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing resume: {str(e)}",
        )

    finally:
        # Clean up temp file
        if "temp_path" in locals() and os.path.exists(temp_path):
            os.unlink(temp_path)


@router.post("/parse-text", response_model=ResumeParseResponse)
async def parse_resume_text_endpoint(
    text: str,
    db: Session = Depends(get_db),
):
    """
    Parse resume from raw text (for testing or copy-paste input).

    Useful when PDF upload is not available or for testing the parser.
    """
    parse_result = parse_resume_text(text)

    extracted_skills: list[str] = []
    if parse_result.get("skills_zone"):
        extracted_skills.extend(extract_skills_list(parse_result["skills_zone"]))
    extracted_skills.extend(extract_skills_from_text(parse_result.get("raw_text", "")))
    if extracted_skills:
        extracted_skills = sorted(set(extracted_skills))

    return ResumeParseResponse(
        skills_zone=parse_result.get("skills_zone"),
        experience_zone=parse_result.get("experience_zone"),
        education_zone=parse_result.get("education_zone"),
        raw_text=parse_result.get("raw_text", ""),
        experience_years=parse_result.get("experience_years"),
        zones_found=parse_result.get("zones_found", []),
        parsing_success=parse_result.get("parsing_success", False),
        extracted_skills=extracted_skills,
        error=parse_result.get("error"),
    )


@router.put("/candidate/{candidate_id}/resume-data")
async def update_resume_data(
    candidate_id: int,
    data: ResumeUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Manually update candidate's resume data.

    Useful for corrections or when automatic parsing fails.
    """
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()

    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found",
        )

    # Update resume parsed data
    current_data = candidate.resume_parsed_data or {}
    current_data.update({
        "skills": data.skills,
        "experience_years": data.experience_years,
        "education": data.education,
        "manual_update": True,
    })
    baseline_summary = evaluate_baseline(
        resume_skills=data.skills,
        experience_years=data.experience_years,
        technical_score=candidate.technical_score or 0,
        integrity_score=100,
        resume_text_raw=candidate.resume_text_raw,
    )
    current_data["baseline_gate"] = evaluate_resume_gate(baseline_summary)
    candidate.resume_parsed_data = current_data

    db.commit()
    db.refresh(candidate)

    return {"message": "Resume data updated", "candidate_id": candidate_id}
