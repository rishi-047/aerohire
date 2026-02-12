# Claude Context - AeroHire Hackathon PPT (Round 2)

You are building a PPT for the Round 2 evaluation. Judges want a working product demo and how AeroHire differs from existing industry systems.

## Product Summary

AeroHire is an end‑to‑end, trust‑first hiring pipeline that combines:
- Resume parsing (skills, experience, education)
- Assessment engine (coding + behavioral + logic)
- Integrity telemetry (tab switches, copy‑paste, webcam anomalies)
- Glass Box AI audit (structured and explainable)
- Recruiter dashboard with evidence and timeline

## Tech Stack

Frontend: React + Vite + TypeScript + Tailwind + Recharts + Monaco Editor  
Backend: FastAPI + SQLite + SQLAlchemy + Gemini SDK  
Key services: Docker sandbox, resume zone parser, Glass Box AI

## Demo Path (What to Show)

1. Candidate uploads resume  
2. Candidate completes assessment  
3. Recruiter views scores, originality, integrity chart  
4. AI Audit report shows strengths, risks, summary with evidence tags  
5. Admin console for rapid resets (optional)

## Key Differentiators vs Industry

- Explainability: strict report format with evidence tags
- Multi‑signal fusion: resume + test results + integrity + originality + teamwork
- Integrity telemetry integrated into scoring
- AI caching with data hashes to avoid drift/cost
- Rule‑based fallback if LLM unavailable

## URLs (Local)

Frontend: http://127.0.0.1:5174  
Backend: http://127.0.0.1:8000  
Admin console: /admin/aerohire-internal-ops-2026

## Screens to Capture

1. Assessment IDE (candidate)  
2. Recruiter Candidate Detail (Assessment tab)  
3. AI Audit tab with evidence lines  
4. Resume Viewer modal  

## Diagram Requests

Use SVG‑based diagrams (vector). Include:
- End‑to‑end data flow
- System architecture
- Integrity signal pipeline

## Messaging Tone

Engineer‑level clarity, narratively coherent, confident.  
Emphasize PoC scope with a clear roadmap to production.
