"""
Glass Box AI Service.

Provides transparent, explainable AI hiring recommendations using Google Gemini.
The "Glass Box" approach ensures all decisions are traceable and justifiable.
"""

import google.generativeai as genai
from typing import Optional
import logging
import re
import json
import hashlib

from app.core.config import settings
from app.services.baseline import evaluate_baseline, summarize_baseline_gaps, BASELINE_CONFIG

# Configure logging for Glass Box service
logger = logging.getLogger("glass_box")
logger.setLevel(logging.INFO)

# Console handler for terminal output
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(
        '\n🔮 [GLASS BOX] %(message)s'
    ))
    logger.addHandler(handler)


def configure_gemini() -> bool:
    """
    Configure the Gemini API with the API key.

    Returns True if configured successfully, False otherwise.
    """
    if not settings.GEMINI_API_KEY:
        logger.warning("❌ GEMINI_API_KEY not set - will use fallback logic")
        return False

    try:
        genai.configure(api_key=settings.GEMINI_API_KEY)
        logger.info("✅ Gemini API configured successfully")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to configure Gemini: {e}")
        return False


def _stable_hash(payload: dict) -> str:
    """
    Create a stable short hash for caching decisions.
    """
    try:
        normalized = json.dumps(payload, sort_keys=True, default=str)
    except TypeError:
        normalized = str(payload)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:12]


def _build_rationale_hashes(candidate_data: dict) -> tuple[str, str]:
    """
    Build resume + assessment hashes to decide if AI rationale should be regenerated.
    """
    resume_parsed_data = candidate_data.get("resume_parsed_data") or {}
    if not isinstance(resume_parsed_data, dict):
        resume_parsed_data = {}

    resume_text_raw = candidate_data.get("resume_text_raw") or ""

    resume_payload = {
        "resume_parsed_data": resume_parsed_data,
        "resume_text_raw": resume_text_raw,
    }
    resume_hash = _stable_hash(resume_payload)

    data_payload = {
        "technical_score": candidate_data.get("technical_score", 0),
        "psychometric_score": candidate_data.get("psychometric_score", 0),
        "integrity_flags": candidate_data.get("integrity_flags", 0),
        "high_severity_flags": candidate_data.get("high_severity_flags", 0),
        "medium_severity_flags": candidate_data.get("medium_severity_flags", 0),
        "low_severity_flags": candidate_data.get("low_severity_flags", 0),
        "integrity_score": candidate_data.get("integrity_score"),
        "submissions_count": candidate_data.get("submissions_count", 0),
        "passed_submissions": candidate_data.get("passed_submissions", 0),
        "experience_years": candidate_data.get("experience_years"),
        "originality_ratio": candidate_data.get("originality_ratio", 100),
        "teamwork_score": candidate_data.get("teamwork_score", 0),
        "chat_response": candidate_data.get("chat_response") or "",
        "resume_hash": resume_hash,
    }
    data_hash = _stable_hash(data_payload)
    return resume_hash, data_hash


def _extract_meta_hashes(rationale: str) -> tuple[Optional[str], Optional[str]]:
    resume_match = re.search(r"resume_hash=([a-f0-9]{6,})", rationale, re.IGNORECASE)
    data_match = re.search(r"data_hash=([a-f0-9]{6,})", rationale, re.IGNORECASE)
    resume_hash = resume_match.group(1) if resume_match else None
    data_hash = data_match.group(1) if data_match else None
    return resume_hash, data_hash


def _append_meta(rationale: str, resume_hash: str, data_hash: str) -> str:
    meta = f"\n[META]:\nresume_hash={resume_hash}\ndata_hash={data_hash}\n"
    return f"{rationale.strip()}{meta}"


def _extract_resume_consistency_flags(candidate_data: dict) -> list[str]:
    resume_parsed_data = candidate_data.get("resume_parsed_data") or {}
    if not isinstance(resume_parsed_data, dict):
        resume_parsed_data = {}

    technical_score = candidate_data.get("technical_score", 0)
    passed_submissions = candidate_data.get("passed_submissions", 0)
    experience_years = candidate_data.get("experience_years")
    resume_skills = candidate_data.get("skills") or resume_parsed_data.get("skills") or []

    flags: list[str] = []

    if experience_years is not None and experience_years >= 5 and (technical_score < 60 or passed_submissions == 0):
        flags.append("Experience claim (>5 years) does not align with low coding performance.")

    high_signal_skills = {
        "python",
        "java",
        "javascript",
        "sql",
        "c++",
        "c#",
        "fastapi",
        "react",
        "node",
        "nodejs",
    }
    normalized_skills = {str(skill).lower() for skill in resume_skills if isinstance(skill, str)}
    if normalized_skills.intersection(high_signal_skills) and (technical_score < 50 or passed_submissions == 0):
        flags.append("Resume lists core technical skills, but assessment performance is weak.")

    if _detect_identity_mismatch(candidate_data):
        flags.append("Resume name does not match candidate profile.")

    return flags


def generate_hiring_rationale(candidate_data: dict) -> dict:
    """
    Generate a transparent hiring recommendation using Gemini AI.

    Args:
        candidate_data: Dictionary containing:
            - full_name: Candidate's name
            - technical_score: Score from code submissions (0-100)
            - psychometric_score: Score from behavioral questions (0-100)
            - integrity_flags: Number of proctoring violations
            - high_severity_flags: Number of HIGH severity violations
            - submissions_count: Total code submissions
            - passed_submissions: Number of passed submissions
            - skills: List of skills from resume (optional)
            - chat_response: Response to simulated teammate (optional)
            - teamwork_score: Score from chat analysis (0-100, optional)
            - originality_ratio: Typed vs pasted code ratio (0-100, optional)

    Returns:
        Dictionary with:
            - rationale: Full explanation text
            - recommendation: "HIRE", "NO_HIRE", or "REVIEW"
            - confidence_score: 0-100 confidence level
    """
    resume_hash, data_hash = _build_rationale_hashes(candidate_data)

    existing_rationale = candidate_data.get("ai_rationale")
    if isinstance(existing_rationale, str) and existing_rationale.strip():
        stored_resume_hash, stored_data_hash = _extract_meta_hashes(existing_rationale)
        if stored_resume_hash and stored_data_hash:
            if stored_resume_hash == resume_hash and stored_data_hash == data_hash:
                existing_recommendation = candidate_data.get("hiring_recommendation")
                existing_confidence = candidate_data.get("confidence_score")

                if not existing_recommendation:
                    verdict_match = re.search(r"\[VERDICT\]:\s*(HIRE|NO_HIRE|REVIEW)", existing_rationale, re.IGNORECASE)
                    if verdict_match:
                        existing_recommendation = verdict_match.group(1).upper()

                if existing_confidence is None:
                    confidence_match = re.search(r"\[CONFIDENCE\]:\s*([0-9]{1,3})", existing_rationale)
                    if confidence_match:
                        try:
                            existing_confidence = int(confidence_match.group(1))
                        except ValueError:
                            existing_confidence = None

                return {
                    "rationale": existing_rationale,
                    "recommendation": existing_recommendation or "REVIEW",
                    "confidence_score": existing_confidence if existing_confidence is not None else 50,
                }

            logger.info("🧠 AI rationale cache mismatch — regenerating report.")
        else:
            logger.info("🧠 AI rationale missing meta — regenerating report.")

    logger.info("="*50)
    logger.info("🚀 GENERATING HIRING RATIONALE")
    logger.info(f"📋 Candidate: {candidate_data.get('full_name', 'Unknown')}")
    logger.info(f"📊 Technical Score: {candidate_data.get('technical_score', 0)}%")
    logger.info(f"🚩 Integrity Flags: {candidate_data.get('integrity_flags', 0)} (High: {candidate_data.get('high_severity_flags', 0)})")

    # Configure Gemini
    if not configure_gemini():
        logger.warning("⚠️ Using FALLBACK rule-based logic (Gemini unavailable)")
        return _generate_fallback_rationale(candidate_data)

    try:
        # Initialize the model
        logger.info("🤖 Initializing Gemini 2.0 Flash model...")
        model = genai.GenerativeModel('gemini-2.0-flash')

        # Extract data with defaults
        full_name = candidate_data.get("full_name", "Candidate")
        technical_score = candidate_data.get("technical_score", 0)
        psychometric_score = candidate_data.get("psychometric_score", 0)
        integrity_flags = candidate_data.get("integrity_flags", 0)
        high_severity_flags = candidate_data.get("high_severity_flags", 0)
        medium_severity_flags = candidate_data.get("medium_severity_flags", 0)
        low_severity_flags = candidate_data.get("low_severity_flags", 0)
        submissions_count = candidate_data.get("submissions_count", 0)
        passed_submissions = candidate_data.get("passed_submissions", 0)
        skills = candidate_data.get("skills", [])
        experience_years = candidate_data.get("experience_years")
        resume_parsed_data = candidate_data.get("resume_parsed_data") or {}
        resume_experience = resume_parsed_data.get("experience_zone") if isinstance(resume_parsed_data, dict) else None
        resume_education = resume_parsed_data.get("education_zone") if isinstance(resume_parsed_data, dict) else None
        resume_skills = resume_parsed_data.get("skills") if isinstance(resume_parsed_data, dict) else None
        if not resume_skills:
            resume_skills = skills
        resume_text_raw = candidate_data.get("resume_text_raw", "")

        # Innovation Trinity: Teamwork & Collaboration
        chat_response = candidate_data.get("chat_response", "")
        teamwork_score = candidate_data.get("teamwork_score", 0)
        originality_ratio = candidate_data.get("originality_ratio", 100)

        integrity_score = candidate_data.get("integrity_score")
        if integrity_score is None:
            integrity_score = max(
                0,
                100
                - (high_severity_flags * 10)
                - (medium_severity_flags * 5)
                - (low_severity_flags * 2),
            )

        baseline_summary = candidate_data.get("baseline_summary") or evaluate_baseline(
            resume_skills=resume_skills if isinstance(resume_skills, list) else [],
            experience_years=experience_years if isinstance(experience_years, int) else None,
            technical_score=technical_score,
            integrity_score=integrity_score,
            resume_text_raw=resume_text_raw,
        )
        baseline_gaps = summarize_baseline_gaps(baseline_summary)
        baseline_note = (
            "; ".join([f"{gap['label']}: {gap['detail']}" for gap in baseline_gaps])
            if baseline_gaps
            else "All baseline checks met."
        )
        baseline_role = baseline_summary.get("role", BASELINE_CONFIG.get("role"))
        baseline_required = baseline_summary.get("required_skills", BASELINE_CONFIG.get("required_skills", []))
        baseline_preferred = baseline_summary.get("preferred_skills", BASELINE_CONFIG.get("preferred_skills", []))
        baseline_min_code = baseline_summary.get("min_code_score", BASELINE_CONFIG.get("min_code_score"))
        baseline_min_integrity = baseline_summary.get("min_integrity", BASELINE_CONFIG.get("min_integrity"))
        baseline_experience = baseline_summary.get("experience_level", BASELINE_CONFIG.get("experience_level"))

        consistency_flags = _extract_resume_consistency_flags(candidate_data)
        consistency_note = (
            "; ".join(consistency_flags)
            if consistency_flags
            else "No mismatches detected between resume claims and assessment performance."
        )

        # Build teamwork assessment section
        teamwork_section = ""
        if chat_response:
            teamwork_section = f"""
**Teamwork & Collaboration (Simulated Teammate Test):**
- Teammate Chat Response: "{chat_response[:200]}{'...' if len(chat_response) > 200 else ''}"
- Teamwork Score: {teamwork_score}% (AI-evaluated empathy and helpfulness)
- Note: Candidate responded to a simulated junior developer asking for help during coding"""
        else:
            teamwork_section = """
**Teamwork & Collaboration:**
- No teammate interaction recorded"""

        # Build originality section
        originality_section = f"""
**Code Originality:**
- Originality Ratio: {originality_ratio}% (typed vs pasted code)
- Note: Higher ratio indicates more original typing, lower ratio suggests copy-paste behavior"""

        # Build the prompt
        prompt = f"""Role: You are a ruthless HR Auditor AI for AeroHire. Be direct, skeptical, and evidence-first.
Your task is to deliver a hard-nosed, transparent hiring recommendation.

## Candidate Assessment Data

**Candidate:** {full_name}

[CANDIDATE PROFILE]
Skills: {', '.join(resume_skills) if resume_skills else 'Not provided'}
Experience: {resume_experience[:600] + '...' if isinstance(resume_experience, str) and len(resume_experience) > 600 else (resume_experience or 'Not provided')}
Resume Snippet: {resume_text_raw[:600] + '...' if isinstance(resume_text_raw, str) and len(resume_text_raw) > 600 else (resume_text_raw or 'Not provided')}
Instruction: Compare their code quality to their claimed experience; flag mismatches as resume inflation or overstatement.
Instruction: If the resume name (if detected) does not match the candidate name, flag identity mismatch.
Instruction: Use the Resume Consistency Findings section to guide your [RISKS] and [SUMMARY].

**Technical Performance:**
- Technical Score: {technical_score}% (based on code execution tests)
- Code Submissions: {submissions_count} total, {passed_submissions} passed
- Estimated Years of Experience: {experience_years if experience_years is not None else 'Unknown'}

**Behavioral Assessment:**
- Psychometric Score: {psychometric_score}% (based on scenario responses and written answers)
- Note: Score of 0% indicates behavioral assessment was not completed
{teamwork_section}
{originality_section}

**Session Integrity:**
- Total Integrity Flags: {integrity_flags}
- High Severity Violations: {high_severity_flags}
- Calculated Integrity Score: {integrity_score}%
- Note: Flags include tab switches, browser unfocus events, and other proctoring alerts

**Resume Evidence (Parsed):**
- Education: {resume_education[:400] + '...' if isinstance(resume_education, str) and len(resume_education) > 400 else (resume_education or 'Not provided')}

**Role Baseline (Company Requirements):**
- Role: {baseline_role}
- Required Skills: {', '.join(baseline_required) if baseline_required else 'None'}
- Preferred Skills: {', '.join(baseline_preferred) if baseline_preferred else 'None'}
- Min Technical Score: {baseline_min_code}
- Min Integrity Score: {baseline_min_integrity}
- Experience Level: {baseline_experience}

**Baseline Evaluation:**
- {baseline_note}

**Resume Consistency Findings:**
- {consistency_note}

## Decision Guidelines (IMPORTANT - AGGRESSIVE MODE)

Apply these rules in order:

1. **TAB SWITCH PENALTY**:
   - 1-2 flags = minor
   - 3-5 flags = red flag (negative signal)
   - >5 flags = automatic integrity failure -> NO_HIRE
2. **HIGH SEVERITY VIOLATIONS (3+)**: Recommend NO_HIRE regardless of other scores
3. **EXCELLENT CANDIDATE**: If Integrity Score >= 80% AND Technical Score >= 70% AND Psychometric Score >= 50% -> Recommend HIRE
4. **MISSING DATA**: If Psychometric Score is 0% -> Recommend REVIEW with note about missing behavioral data
5. **GOOD TECHNICAL, LOW INTEGRITY**: If Technical >= 70% but Integrity < 70% -> Recommend REVIEW
6. **LOW TECHNICAL**: If Technical Score < 50% -> Recommend NO_HIRE
7. **LOW ORIGINALITY**: If Originality Ratio < 30% -> Flag for REVIEW due to potential copy-paste behavior
8. **POOR TEAMWORK**: If Teamwork Score < 30% with valid chat response -> Consider REVIEW
9. **RESUME INFLATION CHECK**: If Experience > 5 years but code fails basic tests (Technical < 50% or Passed Submissions = 0) -> Flag as "Resume Inflation"
10. **IDENTITY MISMATCH**: If resume name does not match candidate name -> Recommend REVIEW and flag
11. **MIXED SIGNALS**: All other cases -> Recommend REVIEW

## Your Task

Analyze this candidate and provide:

1. **RECOMMENDATION**: Choose exactly one: HIRE, NO_HIRE, or REVIEW
   - HIRE: Strong candidate with good technical, behavioral, AND integrity scores
   - NO_HIRE: Significant concerns (low scores or integrity violations)
   - REVIEW: Mixed signals or missing data, needs human review

2. **CONFIDENCE**: A score from 0-100 indicating how confident you are

3. **RATIONALE**: A detailed report with explicit sections:
   - Under [STRENGTHS], list 3 bullets. At least one bullet MUST cite resume skills or experience if available.
     Do NOT list "Integrity Flags" as a strength.
   - Under [RISKS], focus on integrity violations, missing skills, resume vs performance mismatches,
     and identity mismatches. If resume data is missing, say so explicitly.
   - Under [SUMMARY], provide a holistic 2-sentence verdict that explicitly states whether resume claims align with assessment results.
     If verdict is HIRE and risks are minimal/none, do NOT add “pending review” language.
   - Every bullet in [STRENGTHS] and [RISKS] MUST end with an evidence tag in the form:
     "EVIDENCE: resume.skills" or "EVIDENCE: integrity.flags" or "EVIDENCE: submissions.tests"
     Use one of: resume.skills, resume.experience, resume.name, submissions.tests, integrity.flags,
     originality.ratio, teamwork.response, psychometric.score.

## Response Format (IMPORTANT - Follow exactly)

[VERDICT]: HIRE
[CONFIDENCE]: 0-100
[STRENGTHS]:
- Strength 1. EVIDENCE: resume.skills
- Strength 2. EVIDENCE: submissions.tests
- Strength 3. EVIDENCE: psychometric.score
[RISKS]:
- Risk 1. EVIDENCE: integrity.flags
- Risk 2. EVIDENCE: originality.ratio
[SUMMARY]:
Final summary text.
"""

        # Generate response
        logger.info("📡 Sending request to Gemini API...")
        response = model.generate_content(prompt)
        response_text = _append_meta(response.text.strip(), resume_hash, data_hash)

        logger.info("✅ GEMINI RESPONSE RECEIVED!")
        logger.info("-"*40)
        logger.info(f"Raw Response:\n{response_text[:500]}...")
        logger.info("-"*40)

        # Parse the response
        result = _parse_gemini_response(response_text, candidate_data)
        logger.info(f"🎯 FINAL RECOMMENDATION: {result['recommendation']}")
        logger.info(f"📈 Confidence: {result['confidence_score']}%")
        logger.info("="*50)
        return result

    except Exception as e:
        logger.error(f"❌ Gemini API error: {e}")
        logger.warning("⚠️ Falling back to rule-based logic")
        return _generate_fallback_rationale(candidate_data)


def _parse_gemini_response(response_text: str, candidate_data: dict) -> dict:
    """
    Parse the structured response from Gemini.

    Falls back to rule-based logic if parsing fails.
    """
    try:
        verdict_match = re.search(r"\[VERDICT\]:\s*(HIRE|NO_HIRE|REVIEW)", response_text, re.IGNORECASE)
        confidence_match = re.search(r"\[CONFIDENCE\]:\s*([0-9]{1,3})", response_text)

        recommendation = verdict_match.group(1).upper() if verdict_match else "REVIEW"
        confidence = 50
        if confidence_match:
            try:
                confidence = max(0, min(100, int(confidence_match.group(1))))
            except ValueError:
                confidence = 50

        rationale = response_text.strip()
        if not rationale:
            rationale = _generate_fallback_rationale(candidate_data)["rationale"]

        confidence, confidence_note = _apply_confidence_caps(confidence, candidate_data)
        if confidence_note:
            rationale = _append_confidence_note(rationale, confidence_note)

        consistency_flags = _extract_resume_consistency_flags(candidate_data)
        if consistency_flags:
            if not _contains_resume_consistency_risk(rationale):
                rationale = _ensure_risk_line(
                    rationale,
                    f"Resume consistency concern: {consistency_flags[0]} EVIDENCE: resume.experience",
                    "resume.experience",
                )

        baseline_summary = candidate_data.get("baseline_summary")
        if baseline_summary:
            baseline_gaps = summarize_baseline_gaps(baseline_summary)
            if baseline_gaps and not _contains_baseline_risk(rationale):
                gap = baseline_gaps[0]
                rationale = _ensure_risk_line(
                    rationale,
                    f"Baseline mismatch: {gap['label']} ({gap['detail']}). EVIDENCE: {gap['evidence']}",
                    gap["evidence"],
                )

        if _detect_identity_mismatch(candidate_data):
            rationale = _ensure_risk_line(
                rationale,
                "Resume name does not match candidate profile. EVIDENCE: resume.name",
                "resume.name",
            )

        return {
            "rationale": rationale,
            "recommendation": recommendation,
            "confidence_score": confidence,
        }

    except Exception as e:
        print(f"Failed to parse Gemini response: {e}")
        return _generate_fallback_rationale(candidate_data)


def _contains_resume_consistency_risk(rationale: str) -> bool:
    return "resume consistency" in rationale.lower() or "resume inflation" in rationale.lower()


def _contains_baseline_risk(rationale: str) -> bool:
    return "baseline" in rationale.lower()


def _generate_fallback_rationale(candidate_data: dict) -> dict:
    """
    Generate a rule-based rationale when Gemini is unavailable.

    Uses deterministic logic based on scores and flags.
    Decision rules:
    1. HIGH SEVERITY VIOLATIONS (3+) -> NO_HIRE
    2. Integrity >= 80% AND Tech >= 70% AND Psych >= 50% -> HIRE
    3. Psych == 0 (missing data) -> REVIEW
    4. Tech >= 70% but Integrity < 70% -> REVIEW
    5. Tech < 50% -> NO_HIRE
    6. Otherwise -> REVIEW
    """
    resume_hash, data_hash = _build_rationale_hashes(candidate_data)

    technical_score = candidate_data.get("technical_score", 0)
    psychometric_score = candidate_data.get("psychometric_score", 0)
    integrity_flags = candidate_data.get("integrity_flags", 0)
    high_severity_flags = candidate_data.get("high_severity_flags", 0)
    medium_severity_flags = candidate_data.get("medium_severity_flags", 0)
    low_severity_flags = candidate_data.get("low_severity_flags", 0)
    passed_submissions = candidate_data.get("passed_submissions", 0)
    experience_years = candidate_data.get("experience_years")
    originality_ratio = candidate_data.get("originality_ratio", 100)
    teamwork_score = candidate_data.get("teamwork_score", 0)
    resume_parsed_data = candidate_data.get("resume_parsed_data") or {}
    if not isinstance(resume_parsed_data, dict):
        resume_parsed_data = {}
    resume_skills = candidate_data.get("skills") or resume_parsed_data.get("skills") or []
    resume_experience = resume_parsed_data.get("experience_zone") or resume_parsed_data.get("experience") or ""
    resume_parsed_data = candidate_data.get("resume_parsed_data") or {}
    resume_skills = candidate_data.get("skills") or resume_parsed_data.get("skills") or []
    resume_experience = ""
    if isinstance(resume_parsed_data, dict):
        resume_experience = (
            resume_parsed_data.get("experience_zone")
            or resume_parsed_data.get("experience")
            or ""
        )
    identity_mismatch = _detect_identity_mismatch(candidate_data)
    consistency_flags = _extract_resume_consistency_flags(candidate_data)

    integrity_score = candidate_data.get("integrity_score")
    if integrity_score is None:
        integrity_score = max(
            0,
            100
            - (high_severity_flags * 10)
            - (medium_severity_flags * 5)
            - (low_severity_flags * 2),
        )

    resume_inflation = bool(
        experience_years is not None
        and experience_years > 5
        and (technical_score < 50 or passed_submissions == 0)
    )
    baseline_summary = candidate_data.get("baseline_summary") or evaluate_baseline(
        resume_skills=resume_skills if isinstance(resume_skills, list) else [],
        experience_years=experience_years if isinstance(experience_years, int) else None,
        technical_score=technical_score,
        integrity_score=integrity_score,
        resume_text_raw=candidate_data.get("resume_text_raw"),
    )
    baseline_gaps = summarize_baseline_gaps(baseline_summary)

    red_flags: list[str] = []
    integrity_note = f"{integrity_flags} integrity flags (score: {integrity_score}%)"

    if integrity_flags > 5:
        red_flags.append("Integrity failure: >5 flags (automatic fail)")
    elif 3 <= integrity_flags <= 5:
        red_flags.append("Integrity red flag: 3-5 tab switches/flags")

    if high_severity_flags >= 3:
        red_flags.append(f"{high_severity_flags} high-severity violations")

    if originality_ratio < 30:
        red_flags.append("Low originality ratio (<30%)")

    if teamwork_score and teamwork_score < 30:
        red_flags.append("Poor teamwork response")

    if resume_inflation:
        red_flags.append("Resume Inflation risk (experience >5 yrs vs low code performance)")
    if identity_mismatch:
        red_flags.append("Resume name mismatch with candidate profile")
    if consistency_flags and not resume_inflation and not identity_mismatch:
        red_flags.append("Resume consistency concern detected")
    if baseline_gaps:
        red_flags.append("Baseline mismatch detected")

    # Rule 1: Integrity auto-fail
    if integrity_flags > 5 or high_severity_flags >= 3:
        recommendation = "NO_HIRE"
        confidence = 92
    # Rule 2: Excellent candidate (all scores good) -> HIRE
    elif integrity_score >= 80 and technical_score >= 70 and psychometric_score >= 50 and not resume_inflation:
        recommendation = "HIRE"
        confidence = 85
    # Rule 3: Missing behavioral data -> REVIEW
    elif psychometric_score == 0:
        recommendation = "REVIEW"
        confidence = 60
    # Rule 4: Low technical score -> NO_HIRE
    elif technical_score < 50:
        recommendation = "NO_HIRE"
        confidence = 80
    # Rule 5: Good tech but integrity concerns -> REVIEW
    elif technical_score >= 70 and integrity_score < 70:
        recommendation = "REVIEW"
        confidence = 65
    elif identity_mismatch:
        recommendation = "REVIEW"
        confidence = 70
    # Rule 6: Mixed signals -> REVIEW
    else:
        recommendation = "REVIEW"
        confidence = 55

    strengths = []
    if resume_skills:
        strengths.append(f"Resume skills include {', '.join(resume_skills[:6])}. EVIDENCE: resume.skills")
    if isinstance(resume_experience, str) and resume_experience.strip():
        trimmed = " ".join(resume_experience.split())
        snippet = f"{trimmed[:140]}..." if len(trimmed) > 140 else trimmed
        strengths.append(f"Experience highlights: {snippet}. EVIDENCE: resume.experience")
    strengths.append(
        f"Technical score of {technical_score}% with {passed_submissions} passed submissions. "
        "EVIDENCE: submissions.tests"
    )
    if experience_years is not None:
        strengths.append(f"Estimated {experience_years} years of experience. EVIDENCE: resume.experience")

    risks = []
    if integrity_flags > 2:
        risks.append(f"{integrity_flags} integrity flags recorded. EVIDENCE: integrity.flags")
    if originality_ratio < 30:
        risks.append("Low originality ratio suggests heavy copy-paste. EVIDENCE: originality.ratio")
    if resume_inflation:
        risks.append("Resume inflation risk: high experience but weak code results. EVIDENCE: resume.experience")
    if identity_mismatch:
        risks.append("Resume name does not match candidate profile. EVIDENCE: resume.name")
    if consistency_flags and not resume_inflation and not identity_mismatch:
        risks.append(f"Resume consistency concern: {consistency_flags[0]} EVIDENCE: resume.experience")
    if baseline_gaps:
        gap = baseline_gaps[0]
        risks.append(f"Baseline mismatch: {gap['label']} ({gap['detail']}). EVIDENCE: {gap['evidence']}")
    if not risks:
        risks.append("No major risks detected. EVIDENCE: integrity.flags")

    resume_alignment = "Resume claims appear consistent with assessment results."
    if resume_inflation:
        resume_alignment = "Resume claims appear inflated relative to assessment results."
    elif not resume_skills and not resume_experience:
        resume_alignment = "Resume data was not available for cross-checking."
    elif consistency_flags:
        resume_alignment = "Resume claims show potential inconsistencies with assessment results."
    elif baseline_gaps:
        resume_alignment = "Candidate performance falls below the role baseline requirements."

    summary_suffix = "pending review of highlighted risks."
    if recommendation == "HIRE" and not risks:
        summary_suffix = "recommendation aligns with the observed evidence."

    summary = (
        f"Overall technical performance is {technical_score}%, with integrity score {integrity_score}%. "
        f"{resume_alignment} Recommendation: {recommendation} {summary_suffix}"
    )

    strengths_section = "\n".join([f"- {item}" for item in strengths[:3]])
    risks_section = "\n".join([f"- {item}" for item in risks[:3]])

    confidence, confidence_note = _apply_confidence_caps(confidence, candidate_data)

    rationale = "\n".join([
        f"[VERDICT]: {recommendation}",
        f"[CONFIDENCE]: {confidence}",
        "[STRENGTHS]:",
        strengths_section,
        "[RISKS]:",
        risks_section,
        "[SUMMARY]:",
        summary,
    ])

    if confidence_note:
        rationale = _append_confidence_note(rationale, confidence_note)

    rationale = _append_meta(rationale, resume_hash, data_hash)

    return {
        "rationale": rationale,
        "recommendation": recommendation,
        "confidence_score": confidence,
    }


def analyze_chat_response(chat_response: str) -> dict:
    """
    Analyze a candidate's chat response for teamwork and empathy.

    Uses Gemini to evaluate the quality of the response when a simulated
    junior developer asks for help during the coding assessment.

    Args:
        chat_response: The candidate's reply to the teammate chat

    Returns:
        Dictionary with:
            - teamwork_score: 0-100 score for empathy/helpfulness
            - analysis: Brief explanation of the score
    """
    if not chat_response or len(chat_response.strip()) < 5:
        return {
            "teamwork_score": 0,
            "analysis": "No meaningful response provided to teammate."
        }

    logger.info("="*50)
    logger.info("🤝 ANALYZING CHAT RESPONSE FOR TEAMWORK")
    logger.info(f"📝 Response: {chat_response[:100]}...")

    # Configure Gemini
    if not configure_gemini():
        logger.warning("⚠️ Using FALLBACK rule-based logic for chat analysis")
        return _analyze_chat_fallback(chat_response)

    try:
        model = genai.GenerativeModel('gemini-2.0-flash')

        prompt = f"""Role: You are evaluating a job candidate's teamwork and collaboration skills.

## Context
During a coding assessment, a simulated "junior developer named Alex" sent the candidate a chat message asking for help:

"Hey, sorry to interrupt. I see you're working on the string logic. I'm stuck on the database migration. Any quick tips?"

The candidate responded with:
"{chat_response}"

## Evaluation Criteria

Score the response from 0-100 based on:
1. **Empathy (30%)**: Does the response acknowledge the teammate's struggle?
2. **Helpfulness (40%)**: Does the response provide actionable guidance or tips?
3. **Professionalism (15%)**: Is the tone appropriate for a work environment?
4. **Time Management (15%)**: Does the response balance helping vs their own work?

## Scoring Guide
- 80-100: Excellent - Empathetic, helpful, provides specific guidance
- 60-79: Good - Helpful but could be more specific or empathetic
- 40-59: Average - Basic response, lacks depth or empathy
- 20-39: Poor - Dismissive, unhelpful, or inappropriate
- 0-19: Very Poor - Rude, ignores the request, or inappropriate

## Response Format (IMPORTANT)

SCORE: [0-100]
ANALYSIS: [One sentence explaining the score]
"""

        response = model.generate_content(prompt)
        response_text = response.text.strip()

        # Parse score
        score = 50  # Default
        analysis = "Response evaluated for teamwork."

        for line in response_text.split('\n'):
            line = line.strip()
            if line.upper().startswith("SCORE:"):
                try:
                    score = int(line.split(":", 1)[1].strip().replace("%", ""))
                    score = max(0, min(100, score))
                except:
                    pass
            elif line.upper().startswith("ANALYSIS:"):
                analysis = line.split(":", 1)[1].strip()

        logger.info(f"✅ Teamwork Score: {score}%")
        logger.info(f"📊 Analysis: {analysis}")
        logger.info("="*50)

        return {
            "teamwork_score": score,
            "analysis": analysis
        }

    except Exception as e:
        logger.error(f"❌ Chat analysis error: {e}")
        return _analyze_chat_fallback(chat_response)


def _apply_confidence_caps(confidence: int, candidate_data: dict) -> tuple[int, str]:
    """
    Cap confidence based on data completeness and integrity risk.
    Returns adjusted confidence and a note to append to the rationale.
    """
    note_parts: list[str] = []
    adjusted = confidence

    psychometric_score = candidate_data.get("psychometric_score", 0) or 0
    resume_parsed_data = candidate_data.get("resume_parsed_data") or {}
    originality_ratio = candidate_data.get("originality_ratio", 100)
    integrity_flags = candidate_data.get("integrity_flags", 0) or 0

    has_resume = isinstance(resume_parsed_data, dict) and bool(resume_parsed_data)

    if psychometric_score == 0:
        adjusted = min(adjusted, 70)
        note_parts.append("confidence capped due to missing behavioral data")

    if not has_resume:
        adjusted = min(adjusted, 60)
        note_parts.append("confidence capped due to missing resume data")

    if integrity_flags > 5:
        adjusted = min(adjusted, 80)
        note_parts.append("confidence capped due to high integrity flags")

    if originality_ratio < 30:
        adjusted = min(adjusted, 75)
        note_parts.append("confidence capped due to low originality ratio")

    note = "; ".join(note_parts)
    return adjusted, note


def _append_confidence_note(rationale: str, note: str) -> str:
    """
    Append a confidence note to the summary section.
    """
    if not note:
        return rationale

    if "[SUMMARY]:" in rationale:
        return rationale.replace("[SUMMARY]:", f"[SUMMARY]:\nNote: {note}\n", 1)
    return f"{rationale}\nNote: {note}"


def _detect_identity_mismatch(candidate_data: dict) -> bool:
    resume_parsed_data = candidate_data.get("resume_parsed_data") or {}
    if not isinstance(resume_parsed_data, dict):
        resume_parsed_data = {}

    resume_name = (
        resume_parsed_data.get("name")
        or resume_parsed_data.get("full_name")
        or resume_parsed_data.get("candidate_name")
        or ""
    )

    candidate_name = str(candidate_data.get("full_name") or "").strip()
    resume_name_normalized = resume_name.strip().lower()
    candidate_name_normalized = candidate_name.lower()

    def _tokenize(name: str) -> list[str]:
        return [part for part in re.split(r"\s+", name.strip().lower()) if part]

    resume_tokens = _tokenize(resume_name_normalized)
    candidate_tokens = _tokenize(candidate_name_normalized)

    if not resume_tokens or not candidate_tokens:
        return False

    resume_set = set(resume_tokens)
    candidate_set = set(candidate_tokens)
    name_overlap = len(resume_set.intersection(candidate_set)) > 0

    return bool(resume_name_normalized and candidate_name_normalized and not name_overlap)


def _ensure_risk_line(rationale: str, line: str, evidence_tag: str) -> str:
    if evidence_tag and evidence_tag.lower() in rationale.lower():
        return rationale

    match = re.search(r"(\[RISKS\]:)([\s\S]*?)(\n\[[A-Z ]+\]:)", rationale, re.IGNORECASE)
    if not match:
        return rationale

    risks_block = match.group(2).rstrip()
    updated_risks = f"{risks_block}\n- {line}" if risks_block else f"\n- {line}"
    return rationale.replace(match.group(2), updated_risks, 1)


def _analyze_chat_fallback(chat_response: str) -> dict:
    """
    Fallback rule-based analysis for chat responses.
    """
    response_lower = chat_response.lower()
    score = 50  # Start at average

    # Positive indicators
    positive_keywords = [
        "happy to help", "glad to", "sure", "of course", "let me",
        "try this", "you could", "maybe try", "have you tried",
        "good luck", "hope this helps", "let me know", "feel free",
        "no problem", "absolutely", "definitely"
    ]

    # Empathy indicators
    empathy_keywords = [
        "understand", "tough", "tricky", "frustrating", "been there",
        "i know", "that can be", "sorry to hear"
    ]

    # Negative indicators
    negative_keywords = [
        "busy", "can't help", "don't know", "not my problem",
        "figure it out", "google it", "leave me alone", "later"
    ]

    # Score adjustments
    for keyword in positive_keywords:
        if keyword in response_lower:
            score += 8

    for keyword in empathy_keywords:
        if keyword in response_lower:
            score += 10

    for keyword in negative_keywords:
        if keyword in response_lower:
            score -= 15

    # Length bonus (longer responses show effort)
    if len(chat_response) > 100:
        score += 10
    elif len(chat_response) > 50:
        score += 5
    elif len(chat_response) < 20:
        score -= 10

    # Clamp score
    score = max(0, min(100, score))

    # Generate analysis
    if score >= 70:
        analysis = "Response demonstrates strong collaboration and helpfulness."
    elif score >= 50:
        analysis = "Response shows basic willingness to help teammate."
    elif score >= 30:
        analysis = "Response lacks empathy or specific guidance."
    else:
        analysis = "Response indicates poor teamwork attitude."

    return {
        "teamwork_score": score,
        "analysis": analysis
    }
