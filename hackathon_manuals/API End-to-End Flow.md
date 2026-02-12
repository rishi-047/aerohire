# API End-to-End Flow

This guide explains how frontend actions map to backend APIs and database updates.

## 1. Authentication

Frontend:
- `authApi.register()` on `/auth/register`
- `authApi.login()` on `/auth/login`
- `authApi.me()` on `/auth/me`

Backend:
- `backend/app/api/v1/auth.py`

DB effects:
- Creating a candidate user also creates a `Candidate` record.

## 2. Resume Upload

Frontend:
- `resumeApi.upload(file, candidateId)`

Backend:
- `POST /resume/upload`

Flow:
- PDF is saved to a temp file.
- `parse_resume_zones()` extracts sections.
- Skills list is extracted.
- Candidate profile is updated:
  - `resume_parsed_data`
  - `resume_text_raw`

## 3. Assessment Questions

Frontend:
- `assessmentApi.getQuestions()`
- `assessmentApi.getQuestion(id)`

Backend:
- `GET /assessment/questions`
- `GET /assessment/questions/{id}`

Note:
- Sample questions are defined in `backend/app/api/v1/assessment.py`.

## 4. Code Submission

Frontend:
- `assessmentApi.submit()`

Backend:
- `POST /assessment/submit`

Flow:
- Code and test cases are sent.
- Sandbox runs code.
- Result stored in `CodeSubmission`.
- `candidate.status` becomes `Assessment_Started`.

Stored fields:
- `tests_passed`, `tests_total`, `execution_time_ms`
- `code_history`, `char_breakdown`, `chat_response`

## 5. Chat Response

Frontend:
- `assessmentApi.submitChatResponse()`

Backend:
- `POST /assessment/chat-response`

Flow:
- Saves the teammate response even if no code submission exists.
- Creates a minimal `CodeSubmission` if needed.

## 6. Telemetry Events

Frontend:
- `telemetryApi.log()`

Backend:
- `POST /telemetry/log`

Event types include:
- `TAB_SWITCH`
- `FACE_NOT_DETECTED`
- `MULTIPLE_FACES`
- `COPY_PASTE_DETECTED`
- `SUSPICIOUS_BEHAVIOR`

These populate the Session Integrity timeline.

## 7. Assessment Completion

Frontend:
- `assessmentApi.complete()`

Backend:
- `POST /assessment/complete`

Flow:
- Calculates technical score
- Calculates integrity score
- Computes originality ratio
- Builds candidate data payload
- Calls `generate_hiring_rationale()`
- Updates Candidate:
  - `technical_score`
  - `psychometric_score`
  - `ai_rationale`
  - `hiring_recommendation`
  - `confidence_score`

## 8. Recruiter Dashboard

Frontend:
- `dashboardApi.listCandidates()`
- `dashboardApi.getCandidate()`

Backend:
- `GET /dashboard/candidates`
- `GET /dashboard/candidate/{id}`

Data provided:
- Scores, AI report, submissions, integrity logs

## 9. Admin Console

Frontend:
- `adminApi.listCandidates()`
- `adminApi.deleteCandidate()`

Backend:
- `GET /admin/{secret}/candidates`
- `DELETE /admin/{secret}/candidates/{id}`

This is destructive and only intended for demos or local testing.
