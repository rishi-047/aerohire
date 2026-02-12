# Decisions and Alternatives

This document records key design choices and the alternative paths considered.

## Resume Parsing

Chosen:
- Anchor‑based parsing using section headers.

Alternatives:
- Full NLP parser or LLM extraction.

Why:
- PoC needed speed, predictability, and low cost.
- Anchors are transparent and easy to debug.

## Code Execution

Chosen:
- Docker sandbox execution for isolation.

Alternatives:
- Remote judge service.
- Local execution only.

Why:
- Docker provides safer isolation.
- Mock mode allows development without Docker installed.

## Integrity Detection

Chosen:
- Browser FaceDetector if available.
- Motion diff fallback when FaceDetector is unavailable.

Alternatives:
- MediaPipe or face‑api.js in the frontend bundle.

Why:
- FaceDetector avoids extra dependencies and installs.
- Motion diff ensures behavior even without face detection.

## AI Audit Design

Chosen:
- Gemini with strict output schema.
- Hash‑based caching to avoid repeated calls.

Alternatives:
- Rule‑based only.
- Free‑form LLM output.

Why:
- Judges need a structured, explainable report.
- Caching reduces API cost and ensures repeatability.

## Assessment Scoring

Chosen:
- Average of expected question IDs.
- Missing questions count as 0.

Alternatives:
- Score only attempted questions.

Why:
- Ensures fairness and avoids inflated scores.

## Admin Controls

Chosen:
- Secret URL, no authentication.

Alternatives:
- Admin role + password.

Why:
- Hackathon speed and ease of testing.
- Intended for local demo only.
