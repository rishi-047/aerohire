# Claude Context - AeroHire Final Demo Deck

## Objective
Create a polished, technical demo deck for final company judging.  
Audience: engineers, hiring leaders, and evaluators who want working proof and defensible architecture.

## Product Snapshot
AeroHire is an end-to-end hiring intelligence platform with explainable scoring:
1. Candidate uploads resume (PDF).
2. Resume parser extracts skills, experience, education, and estimated experience years.
3. Candidate completes 5-question assessment (coding, behavioral, written, logic).
4. Integrity telemetry logs tab switches, copy/paste, camera anomalies.
5. Recruiter dashboard shows scores, integrity timeline, code originality, culture fit, and AI rationale.
6. Glass Box AI outputs strict structured decision with strengths, risks, summary, and evidence tags.

## Current Implemented Features (Latest)
1. Recruiter decision note visible to candidate in Application Status.
2. Integrity timeline with severity rationale tooltip (why LOW/MED/HIGH).
3. Resume vs assessment consistency checks and risk injection.
4. Company baseline 3-way comparison:
   - Resume claims
   - Assessment performance
   - Role baseline requirements
5. Baseline checklist UI with element-wise status (Met/Partial/Missing/Unknown).
6. Dynamic baseline skill matching:
   - 70 percent required-skill threshold
   - Synonym-aware matching (example: SQL <-> PostgreSQL/MySQL/SQLite)
   - Raw resume text fallback match
7. Secret admin console for controlled candidate/recruiter deletion and rapid demo reset.

## Stack
- Frontend: React, Vite, TypeScript, Tailwind CSS, Recharts, Monaco Editor
- Backend: FastAPI, SQLAlchemy, SQLite
- AI: Google Gemini via structured prompt + deterministic fallback rules
- Telemetry: ProctoringLog pipeline + weighted integrity scoring

## Architecture Notes
1. Transparent AI is enforced by format:
   - `[VERDICT]`, `[CONFIDENCE]`, `[STRENGTHS]`, `[RISKS]`, `[SUMMARY]`
   - Evidence tags attached to bullets (example: `EVIDENCE: resume.skills`)
2. AI cost/control:
   - Hash-based rationale reuse to avoid unnecessary regeneration
3. Baseline model:
   - Default role baseline in backend
   - Checklist cards surfaced in recruiter AI Audit

## Local Demo URLs
- Frontend: http://127.0.0.1:5174
- Backend: http://127.0.0.1:8000
- Secret admin route: /admin/aerohire-internal-ops-2026

## Demo Candidates and Resume Files
Use these files for deterministic showcase:
1. `/Users/junixr/Documents/SRM Innovation Hackathon V2/AeroHire Product/Demo/Syed_Abdullah_HIRE_Resume.pdf`
2. `/Users/junixr/Documents/SRM Innovation Hackathon V2/AeroHire Product/Demo/Aarya_Rishi_Mondal_REVIEW_Resume.pdf`
3. `/Users/junixr/Documents/SRM Innovation Hackathon V2/AeroHire Product/Demo/Aradhya_Dutta_NO_HIRE_Resume.pdf`

Planned outcomes:
1. Syed Abdullah -> HIRE
2. Aarya Rishi Mondal -> REVIEW
3. Aradhya Dutta -> NO_HIRE

## Key Competitive Positioning
1. Most systems rank candidates; AeroHire explains each decision with traceable evidence.
2. Most systems are black-box scorecards; AeroHire fuses resume, code, integrity, originality, and collaboration signals.
3. Most systems lack explicit role baseline checks; AeroHire evaluates candidate fit against baseline criteria and shows checklist-level gaps.

## Slide Design Direction
1. Dark technical theme, high contrast, clean typography.
2. Use SVG/vector diagrams for architecture and data flow.
3. Keep text dense enough for technical evaluators but cleanly structured.
4. Include side-by-side differentiator table against typical ATS workflows.

## Required Diagrams (SVG)
1. End-to-end event flow (Candidate -> APIs -> AI -> Recruiter).
2. System architecture (Frontend modules, Backend services, DB, AI service).
3. Integrity signal pipeline (event capture -> severity rules -> dashboard chart + AI input).
4. 3-way comparator diagram (Resume vs Assessment vs Baseline).

## Constraints
1. No exaggerated claims about production compliance.
2. Clearly label what is production-ready PoC vs roadmap.
3. Keep all claims directly tied to implemented behavior.
