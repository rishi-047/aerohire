# User Manual - Candidate

This manual explains the candidate experience end‑to‑end, including resume upload, assessments, integrity checks, and status tracking.

## Login and Registration

Entry points:
- `http://127.0.0.1:5174/login`
- `http://127.0.0.1:5174/register`

Registration supports:
- Candidate role
- Recruiter role

Candidate registration automatically creates a candidate profile in the backend.

## Candidate Dashboard

Route:
- `/candidate/dashboard`

Core actions:
- Upload resume (PDF only)
- View parsed skills and summary
- Start assessment
- Request assessment reset if a technical issue occurred

Resume upload behavior:
- Drag and drop or click to upload
- PDF text is parsed into skills, experience, education
- Raw resume text is stored for audit and search

Reset request:
- If assessment is no longer in “Registered” or “Assessment Started”
- Click “Request Assessment Reset”
- Provide a reason
- Recruiter must approve reset

## Assessment Flow

Route:
- `/assessment/start`

Questions:
1. Coding (Easy): Reverse a String
2. Coding (Hard): Detect Cycle in Linked List
3. Psychometric (MCQ): Deadline scenario
4. Behavioral (Text): Diverse team prompt
5. Logic (MCQ): Logic puzzle

Coding workflow:
- Write code in Monaco editor
- Click “Run Tests”
- Submissions are saved with test results
- Code history and originality are tracked automatically

Behavioral workflow:
- Q3 is multiple choice
- Q4 requires a text response
- Scores are computed from answer quality and completion

Logic workflow:
- Q5 is multiple choice

### Simulated Teammate Chat

During Q2, a simulated teammate chat appears.
This is a collaboration test that contributes to “Culture Fit.”
Submit a response to ensure it appears in the recruiter review.

## Integrity and Monitoring

Integrity checks include:
- Tab switching (LOW severity)
- Camera status (HIGH severity if disabled)
- Face detection (MEDIUM if no face, HIGH if multiple faces)
- Movement detection (MEDIUM if significant shifts)
- Copy‑paste detection (MEDIUM)

If you are testing, intentionally trigger events so the recruiter graph shows MED and HIGH levels.

## Ending the Assessment

Click “End Test” to finalize the session.
The backend computes:
- Technical score
- Psychometric score
- Integrity score
- AI audit report

The candidate status becomes “Completed.”

## Application Status Page

Route:
- `/candidate/status`

This shows a vertical timeline:
- Registered
- Assessment
- Review
- Interview
- Decision

## Tips for a Smooth Demo

- Use seeded accounts from `seed_db.py` when needed.
- Upload any valid PDF to populate resume data.
- Submit at least one coding question to generate test results.
- Trigger a few integrity events to populate the timeline chart.
