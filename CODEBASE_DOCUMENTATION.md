# AeroHire Codebase Documentation

This document is a comprehensive, single‑file guide to the AeroHire codebase. It is intended to help new contributors, AI coding agents, and teammates understand the architecture, data flow, and key implementation details without needing to reconstruct context from scratch.

The repo is a full‑stack application.
Frontend: React + Vite + TypeScript + Tailwind CSS + Recharts.
Backend: FastAPI + SQLite + SQLAlchemy + Gemini SDK.

The documentation is organized into sections that map to how the system is built and how data moves through it.

## Repository Layout

Top‑level structure:
- `backend/` FastAPI app, services, models, and database.
- `frontend/` React app and UI.
- `aerohire.db` SQLite database at repo root (legacy artifact, can appear after resets).
- `backend/aerohire.db` Primary SQLite database used by the backend.

Important generated folders:
- `frontend/node_modules/` Installed dependencies.
- `frontend/dist/` Production build output.

## Architecture Overview

The system is split into a backend API and a frontend SPA.
The frontend authenticates with JWT and calls `http://localhost:8000/api/v1`.
The backend owns all business logic, assessment scoring, resume parsing, telemetry logging, and AI rationale generation.
SQLite is the only persistence layer and is created at runtime via SQLAlchemy metadata.

High‑level data flow:
1. A user registers and logs in.
2. If the user is a candidate, a `Candidate` profile is created automatically.
3. Candidate uploads a resume, which is parsed and stored on their profile.
4. Candidate completes the assessment. Code submissions, telemetry, chat responses, and behavioral answers are stored and evaluated.
5. Backend calculates scores and generates a Glass Box AI report.
6. Recruiters view candidate detail, charts, and AI audit on the recruiter dashboard.

## Backend Deep Dive

### Entry Point and Lifecycle
File: `backend/app/main.py`
- Creates the FastAPI app and registers the `/api/v1` router.
- Uses FastAPI `lifespan` to call `Base.metadata.create_all` at startup.
- Sets permissive CORS for local development.

### Configuration and Environment
File: `backend/app/core/config.py`
- `DATABASE_URL` defaults to `sqlite:///./aerohire.db`.
- `GEMINI_API_KEY` used by Gemini SDK.
- JWT settings: `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`.

File: `backend/.env`
- Optional environment overrides. In production, replace the default secret.

### Security
File: `backend/app/core/security.py`
- Password hashing via bcrypt.
- JWT encode/decode utilities.
- `create_access_token` embeds `sub` as user email.

### Database Layer
File: `backend/app/db/session.py`
- SQLAlchemy engine uses SQLite with `check_same_thread=False`.
- Dependency `get_db()` is injected into API routes.

File: `backend/app/db/base.py`
- Declares the SQLAlchemy `Base`.

### Models

All models are in `backend/app/models/` and are imported in `backend/app/models/__init__.py`.

User
File: `backend/app/models/user.py`

| Field | Type | Notes |
| --- | --- | --- |
| id | Integer | Primary key |
| email | String | Unique, indexed |
| hashed_password | String | BCrypt hash |
| full_name | String | Display name |
| role | String | `candidate` or `recruiter` |

Candidate
File: `backend/app/models/candidate.py`

| Field | Type | Notes |
| --- | --- | --- |
| id | Integer | Primary key |
| user_id | Integer | FK to `users.id` |
| resume_parsed_data | JSON | Parsed resume payload |
| resume_text_raw | String | Raw extracted resume text |
| technical_score | Integer | 0‑100 |
| psychometric_score | Integer | 0‑100 |
| ai_rationale | String | Glass Box rationale text |
| hiring_recommendation | String | `HIRE`, `NO_HIRE`, `REVIEW` |
| confidence_score | Integer | 0‑100 |
| status | String | Pipeline status |
| reset_requested | Boolean | Candidate‑initiated reset |
| reset_reason | String | Candidate‑provided reason |

CodeSubmission
File: `backend/app/models/assessment.py`

| Field | Type | Notes |
| --- | --- | --- |
| id | Integer | Primary key |
| candidate_id | Integer | FK to `candidates.id` |
| question_id | Integer | Assessment question id |
| submitted_code | String | Code string |
| is_passed | Boolean | All tests passed |
| tests_passed | Integer | Count |
| tests_total | Integer | Count |
| execution_time_ms | Float | Runtime ms |
| memory_usage_mb | Float | Memory usage |
| error_log | String | Error/trace |
| code_history | JSON | Array of snapshots |
| char_breakdown | JSON | `{ typed, pasted }` |
| chat_response | Text | Teammate response |
| teamwork_score | Integer | 0‑100 |

ProctoringLog
File: `backend/app/models/log.py`

| Field | Type | Notes |
| --- | --- | --- |
| id | Integer | Primary key |
| candidate_id | Integer | FK to `candidates.id` |
| event_type | String | Tab switch, etc |
| severity | String | `LOW`, `MEDIUM`, `HIGH` |
| evidence_snapshot | String | Optional |
| timestamp | DateTime | Auto UTC |

### Services

Docker Sandbox
File: `backend/app/services/docker_sandbox.py`
- Runs user code in an isolated Docker container with strict CPU/memory limits.
- `execute_code_safely()` wraps the code and executes test cases.
- Falls back to mock execution if Docker is unavailable.
- `is_docker_available()` reports runtime availability.

Zone Parser (Resume Parsing)
File: `backend/app/services/zone_parser.py`
- Extracts `skills`, `experience`, `education` from PDF using anchor keywords.
- `parse_resume_zones()` uses `pdfplumber` to extract text.
- `extract_skills_list()` tokenizes the skills section into a list.
- `_estimate_years_experience()` uses regex heuristics to compute experience years.

Glass Box AI
File: `backend/app/services/glass_box.py`
- Generates AI audit reports with Gemini.
- Includes a caching strategy using `[META]` hashes to avoid regenerating rationale.
- Builds a structured prompt with Resume + Assessment + Integrity data.
- Enforces a strict output format with `[VERDICT]`, `[CONFIDENCE]`, `[STRENGTHS]`, `[RISKS]`, `[SUMMARY]`.
- Fallback logic mirrors the same decision rules if Gemini is unavailable.
- `analyze_chat_response()` scores the simulated teammate response and returns teamwork score.

### API Routers
All endpoints are mounted under `/api/v1` in `backend/app/api/api.py`.

Authentication
File: `backend/app/api/v1/auth.py`

Endpoints:
- `POST /auth/register` Create user and candidate profile when role is `candidate`.
- `POST /auth/login` OAuth2 password login, returns JWT.
- `GET /auth/me` Returns current user and candidate_id.

Assessment
File: `backend/app/api/v1/assessment.py`

Endpoints:
- `POST /assessment/submit` Execute code, save submission, update candidate status.
- `POST /assessment/chat-response` Save chat response even without a submission.
- `GET /assessment/questions` Returns sample questions without test cases.
- `GET /assessment/questions/{id}` Returns question with test cases.
- `GET /assessment/status` Reports Docker sandbox status.
- `GET /assessment/candidate/{id}/submissions` Returns submission list.
- `POST /assessment/complete` Computes scores, generates AI rationale, sets `Completed`.

Important scoring logic:
- Technical score is computed over `EXPECTED_CODING_QUESTION_IDS = {1,2}`.
- Missing questions count as 0 in the average.
- Integrity score uses weighted severity counts.
- Originality ratio is computed from aggregated `char_breakdown`.

Resume
File: `backend/app/api/v1/resume.py`

Endpoints:
- `POST /resume/upload` Parses PDF, stores `resume_parsed_data` and `resume_text_raw`.
- `POST /resume/parse-text` Parses raw resume text (testing).
- `PUT /resume/candidate/{id}/resume-data` Manual overrides.

Telemetry
File: `backend/app/api/v1/telemetry.py`

Endpoints:
- `POST /telemetry/log` Create a single proctoring event.
- `POST /telemetry/log/batch` Create multiple events.
- `GET /telemetry/candidate/{id}/logs` Filtered logs.
- `GET /telemetry/candidate/{id}/summary` Aggregated counts.
- `GET /telemetry/event-types` Valid event types.

Dashboard
File: `backend/app/api/v1/dashboard.py`

Endpoints:
- `GET /dashboard/candidates` Recruiter list.
- `GET /dashboard/candidate/{id}` Recruiter detail view.
- `GET /dashboard/stats` Dashboard stats.
- `PUT /dashboard/candidate/{id}/scores` Manual score update.
- `GET /dashboard/candidate/me/status` Candidate status (candidate only).
- `PUT /dashboard/candidate/{id}/status` Recruiter status update.
- `POST /dashboard/candidate/request-reset` Candidate reset request.
- `POST /dashboard/candidate/{id}/approve-reset` Recruiter reset approval.

Deep reset behavior:
- Clears scores, AI rationale, confidence, resets status to `Registered`.
- Deletes `CodeSubmission` and `ProctoringLog` rows for candidate.
- Resets `code_history`, `char_breakdown`, `chat_response`.

### Scoring and Integrity

Technical Score
- Uses `tests_passed / tests_total` per question.
- Uses max score per question id (best attempt).
- Averages across expected question IDs.

Integrity Score
- Starts at 100.
- LOW: minus 2.
- MEDIUM: minus 5.
- HIGH: minus 10.
- Minimum score is 0.

Behavioral Score
- Set by frontend based on MCQ and text response.
- Stored in `candidate.psychometric_score`.

Originality
- Aggregated from `char_breakdown` across submissions.
- Stored in AI report as `originality_ratio`.

### Seed Data
File: `backend/seed_db.py`
- Seeds one recruiter and two candidates.
- Includes a completed candidate with sample code history and chat response.
- Uses `get_password_hash` for stored passwords.

## Frontend Deep Dive

### Application Bootstrapping

Entry
File: `frontend/src/main.tsx`
- Mounts React app and injects the `App` component.
- Pulls global styles from `frontend/src/index.css`.

Routing
File: `frontend/src/App.tsx`
- Public routes: `/login`, `/register`.
- Candidate routes: `/candidate/dashboard`, `/candidate/status`.
- Recruiter routes: `/recruiter/dashboard`, `/recruiter/candidate/:id`.
- Assessment routes: `/assessment/start`, `/assessment/:id` (no layout wrapper).
- Protected routes use `RequireAuth`.

### Authentication Guard
File: `frontend/src/components/RequireAuth.tsx`
- Checks JWT existence.
- Calls `/auth/me` to validate token and role.
- Redirects to role‑correct dashboard if role mismatch.

### Global Layout
File: `frontend/src/components/Layout.tsx`
- Collapsible sidebar with role‑based navigation.
- Candidate menu: Dashboard, Application Status.
- Recruiter menu: Pipeline.
- Stores collapsed state in localStorage.

### API Client
File: `frontend/src/lib/api.ts`
- Axios client with JWT request interceptor.
- Handles 401 auto‑logout.
- Strongly typed request/response shapes.
- Exposes `authApi`, `resumeApi`, `assessmentApi`, `telemetryApi`, `dashboardApi`.

### Candidate Experience

Login
File: `frontend/src/pages/Login.tsx`
- Simple login form.
- After login, fetches `/auth/me` to redirect to correct dashboard.

Register
File: `frontend/src/pages/Register.tsx`
- Supports `candidate` or `recruiter` roles.
- Auto‑login after successful registration.

Candidate Dashboard
File: `frontend/src/pages/CandidateDashboard.tsx`
- Drag‑and‑drop PDF resume upload.
- Calls `resumeApi.upload()` with `candidateId` if available.
- Displays parsed skills and summary.
- Start Assessment button is disabled if status is not `Registered` or `Assessment Started`.
- Allows reset request with a modal and reason input.

Application Status
File: `frontend/src/pages/ApplicationStatus.tsx`
- Vertical timeline showing registered → assessment → review → interview → decision.
- Pulls status from `/dashboard/candidate/me/status`.

Assessment
File: `frontend/src/pages/Assessment.tsx`
- 5‑question flow:
  1. Coding Easy: Reverse a String.
  2. Coding Hard: Detect Cycle in Linked List.
  3. Psychometric MCQ: Deadline scenario.
  4. Text response: Diverse team collaboration.
  5. Logic puzzle MCQ.
- Monaco editor for coding questions.
- Submissions call `/assessment/submit` with `code_history`, `char_breakdown`, and optional `chat_response`.
- Auto‑saves code state when switching questions.
- Proctoring: tab switch logs to `/telemetry/log`.
- Simulated teammate chatbot appears on Q2 after 15 seconds or when running tests.
- Chat response is saved through `/assessment/chat-response` to ensure recruiter visibility.
- Code originality tracking:
  - Monaco `onDidPaste` and `onDidChangeModelContent`.
  - Counts typed vs pasted characters.
- Behavioral score:
  - MCQ correctness and text length influence the final behavioral score.

### Recruiter Experience

Recruiter Dashboard
File: `frontend/src/pages/RecruiterDashboard.tsx`
- Lists candidates with status, scores, and flags.
- Calculates summary stats (total, in progress, flagged, average score).

Candidate Detail
File: `frontend/src/pages/CandidateDetail.tsx`
- Two tabs: `Assessment` and `AI Audit`.
- Left column shows:
  - Scores (technical, behavioral).
  - Code submissions list.
  - Code playback (code snapshots).
  - Originality chart (typed vs pasted).
  - Culture fit card (chat response).
- Right column shows Session Integrity:
  - Time‑series chart built from proctoring logs.
  - Severity mapping to numeric levels for Y‑axis.
  - Brush slider for zooming into the time range.
  - High severity points highlighted.
- AI Audit tab:
  - Parses `[STRENGTHS]`, `[RISKS]`, `[SUMMARY]` from AI report.
  - Merges resume skills and experience into strengths.
  - Displays verdict badge and confidence bar.
- Resume Viewer:
  - Modal showing skills badges, experience timeline, and raw resume text.

### Telemetry Component (Legacy)
File: `frontend/src/components/TelemetryTimeline.tsx`
- A lightweight chart component for telemetry logs.
- Not currently used in the main candidate detail view.

### Styling
File: `frontend/src/index.css`
- Tailwind v4 with custom CSS variables for AeroHire theme.
- Defines colors, panels, gradients, and typography helpers.

## Key Data Contracts

Candidate Detail Response
File: `frontend/src/lib/api.ts` and `backend/app/api/v1/dashboard.py`
- Includes candidate metadata, resume data, scores, AI report, and submissions.
- Contains `recent_logs` for telemetry charting.
- Contains `submissions` with `code_history`, `char_breakdown`, and `chat_response`.

Assessment Submit Request
File: `frontend/src/lib/api.ts`
- `code`, `question_id`, `candidate_id`, `test_cases`.
- `code_history`, `char_breakdown`, `chat_response` are optional.

Telemetry Log Request
File: `frontend/src/lib/api.ts`
- `candidate_id`, `event_type`, `severity`, optional evidence.

## Runtime and Development

Backend
- Install dependencies from `backend/requirements.txt`.
- Run with:
  `uvicorn app.main:app --reload`
  from `backend/`.

Frontend
- Install dependencies from `frontend/package.json`.
- Run with:
  `npm run dev`
  from `frontend/`.
- You can specify a port:
  `npm run dev -- --port 5174`

Database Reset
- Remove `backend/aerohire.db`.
- Recreate and seed with:
  `python backend/seed_db.py`

## Design Decisions and Notable Behaviors

Status Normalization
- Backend uses strings like `Registered`, `Assessment Started`, `Completed`.
- Frontend normalizes underscores and spaces for display.

AI Rationale Caching
- The AI report embeds `[META]` hashes.
- The report is only regenerated if resume or assessment data changes.

Assessment Scoring
- Technical score uses expected question IDs {1,2}.
- Missing questions count as 0 in the average.

Integrity Scoring
- Weighted by severity using a fixed formula.
- Both recruiter view and AI audit use the same calculation.

Originality
- Based on typed vs pasted counts from the Monaco editor.
- Aggregated over all submissions for the candidate.

Resume Parsing
- Relies on anchor‑based section detection.
- Experience years are heuristic and optional.
- Parsed resume is stored in `candidate.resume_parsed_data`.

Chat Response
- Always saved through `/assessment/chat-response` to prevent missing responses.
- If no submission exists, a minimal `CodeSubmission` entry is created.

## File Reference Index

Backend
- `backend/app/main.py` App initialization and CORS.
- `backend/app/core/config.py` Environment config.
- `backend/app/core/security.py` JWT and password hashing.
- `backend/app/models/candidate.py` Candidate model.
- `backend/app/models/assessment.py` CodeSubmission model.
- `backend/app/models/log.py` ProctoringLog model.
- `backend/app/api/v1/assessment.py` Assessment endpoints and scoring.
- `backend/app/api/v1/resume.py` Resume upload and parsing.
- `backend/app/api/v1/telemetry.py` Proctoring logs.
- `backend/app/api/v1/dashboard.py` Recruiter APIs.
- `backend/app/services/glass_box.py` Gemini AI logic.
- `backend/app/services/zone_parser.py` Resume parsing.
- `backend/app/services/docker_sandbox.py` Secure code execution.
- `backend/seed_db.py` Seed data.

Frontend
- `frontend/src/App.tsx` Router configuration.
- `frontend/src/components/Layout.tsx` Sidebar layout.
- `frontend/src/components/RequireAuth.tsx` Auth guard.
- `frontend/src/pages/Login.tsx` Login page.
- `frontend/src/pages/Register.tsx` Register page.
- `frontend/src/pages/CandidateDashboard.tsx` Candidate dashboard.
- `frontend/src/pages/ApplicationStatus.tsx` Status timeline.
- `frontend/src/pages/Assessment.tsx` Assessment flow.
- `frontend/src/pages/RecruiterDashboard.tsx` Recruiter pipeline.
- `frontend/src/pages/CandidateDetail.tsx` Candidate detail and AI audit.
- `frontend/src/lib/api.ts` API client and types.

## How to Use This Document

When onboarding or resuming work:
1. Start with the Architecture Overview to understand the system boundaries.
2. Review Models and API Endpoints to understand stored data.
3. Walk through Candidate and Recruiter flows to see UI and API interactions.
4. Use the File Reference Index to jump directly to relevant code.
