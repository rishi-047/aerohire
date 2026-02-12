"""
Admin API endpoints.

Secret admin utilities for nuking candidate/recruiter data.
Use with caution - destructive operations.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import User, Candidate, CodeSubmission, ProctoringLog

router = APIRouter()

ADMIN_SECRET = "aerohire-internal-ops-2026"


class AdminCandidate(BaseModel):
    candidate_id: int
    user_id: int
    full_name: str
    email: str
    status: str
    has_resume: bool


class AdminRecruiter(BaseModel):
    user_id: int
    full_name: str
    email: str


def _ensure_secret(secret: str) -> None:
    if secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Invalid admin secret")


@router.get("/{secret}/candidates")
def list_candidates(secret: str, db: Session = Depends(get_db)):
    _ensure_secret(secret)
    candidates = db.query(Candidate).all()

    result: list[AdminCandidate] = []
    for candidate in candidates:
        user = db.query(User).filter(User.id == candidate.user_id).first()
        if not user:
            continue
        result.append(
            AdminCandidate(
                candidate_id=candidate.id,
                user_id=user.id,
                full_name=user.full_name or "",
                email=user.email or "",
                status=candidate.status or "Registered",
                has_resume=bool(candidate.resume_text_raw),
            )
        )

    return {"total": len(result), "candidates": result}


@router.get("/{secret}/recruiters")
def list_recruiters(secret: str, db: Session = Depends(get_db)):
    _ensure_secret(secret)
    recruiters = db.query(User).filter(User.role == "recruiter").all()

    result: list[AdminRecruiter] = [
        AdminRecruiter(
            user_id=user.id,
            full_name=user.full_name or "",
            email=user.email or "",
        )
        for user in recruiters
    ]

    return {"total": len(result), "recruiters": result}


@router.delete("/{secret}/candidates/{candidate_id}")
def delete_candidate(secret: str, candidate_id: int, db: Session = Depends(get_db)):
    _ensure_secret(secret)
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    user_id = candidate.user_id

    db.query(CodeSubmission).filter(CodeSubmission.candidate_id == candidate_id).delete(
        synchronize_session=False
    )
    db.query(ProctoringLog).filter(ProctoringLog.candidate_id == candidate_id).delete(
        synchronize_session=False
    )
    db.delete(candidate)
    if user_id:
        db.query(User).filter(User.id == user_id).delete(synchronize_session=False)

    db.commit()

    return {"message": "Candidate deleted", "candidate_id": candidate_id}


@router.delete("/{secret}/recruiters/{user_id}")
def delete_recruiter(secret: str, user_id: int, db: Session = Depends(get_db)):
    _ensure_secret(secret)
    recruiter = db.query(User).filter(User.id == user_id, User.role == "recruiter").first()
    if not recruiter:
        raise HTTPException(status_code=404, detail="Recruiter not found")

    db.delete(recruiter)
    db.commit()

    return {"message": "Recruiter deleted", "user_id": user_id}


@router.delete("/{secret}/candidates")
def delete_all_candidates(secret: str, db: Session = Depends(get_db)):
    _ensure_secret(secret)

    candidates = db.query(Candidate).all()
    candidate_ids = [c.id for c in candidates]
    user_ids = [c.user_id for c in candidates if c.user_id]

    if candidate_ids:
        db.query(CodeSubmission).filter(CodeSubmission.candidate_id.in_(candidate_ids)).delete(
            synchronize_session=False
        )
        db.query(ProctoringLog).filter(ProctoringLog.candidate_id.in_(candidate_ids)).delete(
            synchronize_session=False
        )
        db.query(Candidate).filter(Candidate.id.in_(candidate_ids)).delete(
            synchronize_session=False
        )

    if user_ids:
        db.query(User).filter(User.id.in_(user_ids)).delete(synchronize_session=False)

    db.commit()

    return {"message": "All candidates deleted", "count": len(candidate_ids)}


@router.delete("/{secret}/recruiters")
def delete_all_recruiters(secret: str, db: Session = Depends(get_db)):
    _ensure_secret(secret)

    recruiters = db.query(User).filter(User.role == "recruiter").all()
    recruiter_ids = [r.id for r in recruiters]

    if recruiter_ids:
        db.query(User).filter(User.id.in_(recruiter_ids)).delete(synchronize_session=False)

    db.commit()

    return {"message": "All recruiters deleted", "count": len(recruiter_ids)}
