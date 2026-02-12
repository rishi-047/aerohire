# User Manual - Recruiter

This manual explains how recruiters use AeroHire to evaluate candidates.

## Login

Route:
- `/login`

Recruiters land on:
- `/recruiter/dashboard`

## Recruiter Dashboard (Pipeline)

View:
- Candidate list
- Status badge
- Technical and psychometric scores
- Total flags
- Hiring recommendation (if available)

Key actions:
- Click a candidate row to open their detail page

## Candidate Detail

Route:
- `/recruiter/candidate/:id`

Tabs:
- Assessment
- AI Audit

### Assessment Tab

Includes:
- Assessment scores
- Code submissions list
- Code playback snapshots
- Originality breakdown (typed vs pasted)
- Culture Fit card (chat response)
- Session Integrity timeline graph

Session Integrity graph:
- Y axis: LOW, MED, HIGH
- X axis: time since session start
- Brush zoom for deeper inspection
- High severity events highlighted

### AI Audit Tab

Includes:
- Verdict badge
- Confidence score
- Strengths, Risks, Summary
- Resume‑aware insights

### Resume Viewer

Click “View Resume” to see:
- Parsed skills
- Experience timeline
- Raw resume text

## Reset Request Handling

If a candidate requests a reset:
- A red alert appears at the top
- Click “Approve Reset” to wipe scores and submissions

This resets:
- Candidate scores
- AI report
- Proctoring logs
- Submissions and code history

## What Recruiters Should Look For

Technical:
- Tests passed and failed
- Code playback pattern

Integrity:
- MED/HIGH flags
- Multiple faces or camera interruptions

Originality:
- Low typed ratio indicates possible paste

Culture fit:
- Simulated teammate response

Resume alignment:
- Does resume skill list match technical performance
