from __future__ import annotations

import re
from typing import Any, Optional


BASELINE_CONFIG: dict[str, Any] = {
    "role": "Engineering Intern",
    "required_skills": ["Python", "SQL"],
    "preferred_skills": ["FastAPI", "Linux", "AWS", "Java"],
    "min_code_score": 50,
    "min_integrity": 65,
    "experience_level": "0-5 years",
    "required_skill_threshold": 0.34,
    "resume_gate_min_required_matches": 1,
    "resume_gate_min_required_ratio": 0.34,
    "allow_experience_gate_block": False,
}

# Dynamic baseline profiles make the gate less brittle across mixed datasets.
BASELINE_PROFILES: list[dict[str, Any]] = [
    {
        "id": "backend",
        "role": "Backend Intern",
        "required_skills": ["Python", "SQL"],
        "preferred_skills": ["FastAPI", "Django", "Flask", "PostgreSQL"],
        "experience_level": "0-4 years",
        "signals": ["python", "sql", "fastapi", "django", "flask", "api", "postgresql"],
    },
    {
        "id": "fullstack",
        "role": "Full-Stack Intern",
        "required_skills": ["JavaScript", "SQL"],
        "preferred_skills": ["React", "Node.js", "TypeScript", "Express"],
        "experience_level": "0-4 years",
        "signals": ["javascript", "react", "node.js", "typescript", "express", "frontend"],
    },
    {
        "id": "devops",
        "role": "Cloud / DevOps Intern",
        "required_skills": ["Linux", "AWS"],
        "preferred_skills": ["Docker", "Kubernetes", "Terraform", "VMware"],
        "experience_level": "0-5 years",
        "signals": ["linux", "aws", "azure", "gcp", "docker", "kubernetes", "vmware", "devops"],
    },
    {
        "id": "data",
        "role": "Data / Analytics Intern",
        "required_skills": ["Python", "SQL"],
        "preferred_skills": ["Pandas", "Power BI", "Machine Learning", "Tableau"],
        "experience_level": "0-4 years",
        "signals": ["python", "sql", "pandas", "machine learning", "power bi", "tableau", "analytics"],
    },
]

SKILL_SYNONYMS: dict[str, set[str]] = {
    "sql": {"postgresql", "mysql", "sqlite", "mssql", "ms sql", "maria", "mariadb"},
    "javascript": {"js", "typescript", "node", "node.js", "nodejs", "react", "express"},
    "python": {"django", "flask", "fastapi"},
    "java": {"spring", "spring boot"},
    "c++": {"cpp"},
    "aws": {"ec2", "s3", "lambda", "cloudformation"},
    "linux": {"rhel", "ubuntu", "redhat", "red hat"},
}


def _parse_experience_range(level: str) -> tuple[Optional[int], Optional[int]]:
    numbers = [int(value) for value in re.findall(r"\d+", level or "")]
    if len(numbers) >= 2:
        return numbers[0], numbers[1]
    if len(numbers) == 1:
        return numbers[0], None
    return None, None


def _normalize_skill(value: str) -> str:
    return value.lower().strip()


def _expand_skill(skill: str) -> set[str]:
    normalized = _normalize_skill(skill)
    expansions = {normalized}
    for key, synonyms in SKILL_SYNONYMS.items():
        if normalized == key or normalized in synonyms:
            expansions.update({key, *synonyms})
    return expansions


def _select_profile(normalized_skills: set[str], resume_text: str) -> tuple[dict[str, Any], float]:
    best_profile: Optional[dict[str, Any]] = None
    best_score = 0.0

    for profile in BASELINE_PROFILES:
        signals = profile.get("signals", [])
        if not signals:
            continue
        matches = 0
        for signal in signals:
            expansions = _expand_skill(signal)
            if any(exp in normalized_skills for exp in expansions):
                matches += 1
                continue
            if resume_text and any(exp in resume_text for exp in expansions):
                matches += 1
        score = matches / len(signals)
        if score > best_score:
            best_score = score
            best_profile = profile

    if best_profile and best_score > 0:
        return best_profile, round(best_score, 2)

    fallback_profile = {
        "id": "default",
        "role": BASELINE_CONFIG.get("role"),
        "required_skills": BASELINE_CONFIG.get("required_skills", []),
        "preferred_skills": BASELINE_CONFIG.get("preferred_skills", []),
        "experience_level": BASELINE_CONFIG.get("experience_level", ""),
    }
    return fallback_profile, 0.0


def evaluate_baseline(
    *,
    resume_skills: list[str],
    experience_years: Optional[int],
    technical_score: int,
    integrity_score: int,
    resume_text_raw: str | None = None,
) -> dict[str, Any]:
    normalized_skills = {_normalize_skill(skill) for skill in resume_skills if isinstance(skill, str)}
    resume_text = (resume_text_raw or "").lower()

    profile, profile_confidence = _select_profile(normalized_skills, resume_text)
    required = profile.get("required_skills", BASELINE_CONFIG.get("required_skills", []))
    preferred = profile.get("preferred_skills", BASELINE_CONFIG.get("preferred_skills", []))
    role = profile.get("role", BASELINE_CONFIG.get("role"))
    experience_level = str(profile.get("experience_level", BASELINE_CONFIG.get("experience_level", "")))

    def has_skill(skill: str) -> bool:
        expansions = _expand_skill(skill)
        if any(exp in normalized_skills for exp in expansions):
            return True
        if resume_text:
            return any(exp in resume_text for exp in expansions)
        return False

    matched_required = [skill for skill in required if has_skill(skill)]
    missing_required = [skill for skill in required if skill not in matched_required]
    required_total = len(required)
    required_ratio = (len(matched_required) / required_total) if required_total > 0 else 0.0

    # Keep threshold generous for mixed real-world resumes.
    required_threshold = float(BASELINE_CONFIG.get("required_skill_threshold", 0.34))
    if len(normalized_skills) >= 8:
        required_threshold = min(required_threshold, 0.34)
    elif len(normalized_skills) <= 2:
        required_threshold = min(required_threshold + 0.1, 0.5)

    if not required:
        required_status = "unknown"
        required_detail = "No required skills configured."
    elif required_ratio >= required_threshold:
        required_status = "met"
        required_detail = (
            f"Matched: {', '.join(matched_required)}"
            + (f" | Missing: {', '.join(missing_required)}" if missing_required else "")
        )
    elif matched_required:
        required_status = "partial"
        required_detail = (
            f"Matched: {', '.join(matched_required)}"
            + (f" | Missing: {', '.join(missing_required)}" if missing_required else "")
        )
    else:
        required_status = "missing"
        required_detail = f"Missing: {', '.join(missing_required or required)}"

    preferred_matched = [skill for skill in preferred if has_skill(skill)]
    if not preferred:
        preferred_status = "unknown"
        preferred_detail = "No preferred skills configured."
    elif preferred_matched:
        preferred_status = "met"
        preferred_detail = f"Matched: {', '.join(preferred_matched)}"
    else:
        preferred_status = "missing"
        preferred_detail = "No preferred skills detected."

    min_code_score = int(BASELINE_CONFIG.get("min_code_score", 0))
    technical_status = "met" if technical_score >= min_code_score else "missing"
    technical_detail = (
        f"{technical_score}% >= {min_code_score}%"
        if technical_status == "met"
        else f"{technical_score}% < {min_code_score}%"
    )

    min_integrity = int(BASELINE_CONFIG.get("min_integrity", 0))
    integrity_status = "met" if integrity_score >= min_integrity else "missing"
    integrity_detail = (
        f"{integrity_score}% >= {min_integrity}%"
        if integrity_status == "met"
        else f"{integrity_score}% < {min_integrity}%"
    )

    exp_min, exp_max = _parse_experience_range(experience_level)
    if experience_years is None:
        experience_status = "unknown"
        experience_detail = "Experience years not parsed."
    elif exp_min is not None and exp_max is not None:
        if exp_min <= experience_years <= exp_max:
            experience_status = "met"
            experience_detail = f"{experience_years} yrs within {exp_min}-{exp_max} yrs"
        else:
            # Outside range is advisory, not a hard fail for fresher/mixed resumes.
            experience_status = "partial"
            experience_detail = f"{experience_years} yrs outside {exp_min}-{exp_max} yrs"
    elif exp_min is not None:
        if experience_years >= exp_min:
            experience_status = "met"
            experience_detail = f"{experience_years} yrs >= {exp_min} yrs"
        else:
            experience_status = "partial"
            experience_detail = f"{experience_years} yrs < {exp_min} yrs"
    else:
        experience_status = "unknown"
        experience_detail = "Experience baseline not configured."

    checks = [
        {
            "key": "role",
            "label": "Role baseline",
            "status": "met",
            "detail": role,
            "evidence": "baseline.role",
        },
        {
            "key": "required_skills",
            "label": "Required skills",
            "status": required_status,
            "detail": required_detail,
            "evidence": "resume.skills",
        },
        {
            "key": "preferred_skills",
            "label": "Preferred skills",
            "status": preferred_status,
            "detail": preferred_detail,
            "evidence": "resume.skills",
        },
        {
            "key": "min_code_score",
            "label": "Min technical score",
            "status": technical_status,
            "detail": technical_detail,
            "evidence": "submissions.tests",
        },
        {
            "key": "min_integrity",
            "label": "Min integrity score",
            "status": integrity_status,
            "detail": integrity_detail,
            "evidence": "integrity.flags",
        },
        {
            "key": "experience_range",
            "label": "Experience range",
            "status": experience_status,
            "detail": experience_detail,
            "evidence": "resume.experience",
        },
    ]

    return {
        "profile_id": profile.get("id", "default"),
        "profile_confidence": profile_confidence,
        "role": role,
        "required_skills": required,
        "preferred_skills": preferred,
        "min_code_score": min_code_score,
        "min_integrity": min_integrity,
        "experience_level": experience_level,
        "metrics": {
            "required_total": required_total,
            "required_matched": len(matched_required),
            "required_ratio": round(required_ratio, 2),
            "preferred_matched": len(preferred_matched),
            "resume_skill_count": len(normalized_skills),
            "required_threshold": round(required_threshold, 2),
        },
        "checks": checks,
    }


def summarize_baseline_gaps(summary: dict[str, Any]) -> list[dict[str, str]]:
    checks = summary.get("checks") or []
    gaps: list[dict[str, str]] = []
    for check in checks:
        status = check.get("status")
        if status in {"missing", "partial"}:
            gaps.append(
                {
                    "label": check.get("label", "Baseline"),
                    "detail": check.get("detail", "Baseline mismatch"),
                    "evidence": check.get("evidence", "resume.skills"),
                }
            )
    return gaps


def evaluate_resume_gate(summary: dict[str, Any]) -> dict[str, Any]:
    """
    Resume gate for assessment access.

    Dynamic and generous behavior:
    - Allow with at least one required skill match OR a healthy required ratio.
    - Allow domain override if preferred skills are matched.
    - Keep experience-range as advisory by default.
    """
    checks = summary.get("checks") or []
    metrics = summary.get("metrics") or {}

    required_matched = int(metrics.get("required_matched", 0))
    required_ratio = float(metrics.get("required_ratio", 0.0))
    preferred_matched = int(metrics.get("preferred_matched", 0))
    resume_skill_count = int(metrics.get("resume_skill_count", 0))

    min_required_matches = int(BASELINE_CONFIG.get("resume_gate_min_required_matches", 1))
    min_required_ratio = float(BASELINE_CONFIG.get("resume_gate_min_required_ratio", 0.34))

    blocking: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []

    required_check = next((c for c in checks if c.get("key") == "required_skills"), None)
    experience_check = next((c for c in checks if c.get("key") == "experience_range"), None)

    # Generous pass criteria for diverse resume datasets.
    required_pass = (
        required_matched >= min_required_matches
        or required_ratio >= min_required_ratio
        or preferred_matched > 0
        or resume_skill_count >= 6
    )

    if required_check and not required_pass:
        blocking.append(
            {
                "label": required_check.get("label", "Required skills"),
                "detail": required_check.get("detail", "Required skills not matched"),
                "evidence": required_check.get("evidence", "resume.skills"),
            }
        )
    elif required_check and required_check.get("status") in {"missing", "partial"}:
        warnings.append(
            {
                "label": required_check.get("label", "Required skills"),
                "detail": required_check.get("detail", "Some required skills are missing"),
                "evidence": required_check.get("evidence", "resume.skills"),
            }
        )

    # Experience is advisory unless explicitly configured as hard-blocking.
    if experience_check and experience_check.get("status") in {"missing", "partial"}:
        if bool(BASELINE_CONFIG.get("allow_experience_gate_block", False)):
            blocking.append(
                {
                    "label": experience_check.get("label", "Experience range"),
                    "detail": experience_check.get("detail", "Experience requirement not met"),
                    "evidence": experience_check.get("evidence", "resume.experience"),
                }
            )
        else:
            warnings.append(
                {
                    "label": experience_check.get("label", "Experience range"),
                    "detail": experience_check.get("detail", "Experience is advisory for this role"),
                    "evidence": experience_check.get("evidence", "resume.experience"),
                }
            )

    allowed = len(blocking) == 0
    reason = "Baseline gate passed" if allowed else "Baseline requirements not met"
    return {
        "allowed": allowed,
        "reason": reason,
        "blocking": blocking,
        "warnings": warnings,
    }
