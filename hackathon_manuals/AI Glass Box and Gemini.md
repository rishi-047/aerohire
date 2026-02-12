# AI Glass Box and Gemini

This manual explains how the AI audit report is generated and why it is designed to be transparent.

## Purpose

Most hiring AI is a black box.
AeroHire uses a “Glass Box” approach:
- The AI must explain why it recommends HIRE or NO_HIRE.
- Outputs are structured and human‑readable.
- Resume and assessment performance are explicitly compared.

## Where the Logic Lives

Backend file:
- `backend/app/services/glass_box.py`

## Gemini Configuration

Configuration is handled in:
- `configure_gemini()`  
It loads the `GEMINI_API_KEY` from environment.

If Gemini is unavailable:
- The system falls back to rule‑based logic.

## Prompt Highlights

The prompt includes:
- Technical score
- Psychometric score
- Integrity flags and integrity score
- Resume parsed data (skills, experience)
- Raw resume text
- Code originality ratio
- Simulated teammate response and teamwork score

Key instruction:
- Compare resume claims vs performance.
- Flag “Resume Inflation” if experience is high but code fails.

## Output Format

Strict output schema:

```
[VERDICT]: HIRE | NO_HIRE | REVIEW
[CONFIDENCE]: 0-100
[STRENGTHS]:
- Strength 1
- Strength 2
- Strength 3
[RISKS]:
- Risk 1
- Risk 2
[SUMMARY]:
Final summary text.
```

The frontend parser relies on these exact headers.

## Caching Strategy

The AI rationale is cached to avoid API costs.
`[META]` tags are appended to each rationale:
- `resume_hash`
- `data_hash`

If the hashes match current data:
- The AI report is reused.

If they differ:
- Gemini is called again.

## Fallback Logic

When Gemini is unavailable:
- Rule‑based logic generates the report.
- It still produces the same formatted output.

Decision rules include:
- High integrity violations → NO_HIRE
- Strong technical and integrity → HIRE
- Missing behavioral data → REVIEW
- Low technical score → NO_HIRE

## Why Judges Like This

It is explainable, deterministic when needed, and aligns with fairness expectations.
The report is easy to read and grounded in actual resume and assessment data.
