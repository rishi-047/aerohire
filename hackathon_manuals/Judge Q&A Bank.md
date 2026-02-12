# Judge Q&A Bank

This file lists likely judge questions, grouped by topic, with suggested answers.

## Topic: Product Vision

1. Question: What makes AeroHire different from existing hiring platforms?
Suggested answer: We combine integrity telemetry, resume parsing, and explainable AI into one workflow. The Glass Box report is structured and explicit about why a verdict is given, rather than a black‑box score.

2. Question: Why is integrity such a focus?
Suggested answer: Cheating is a real problem in remote hiring. A fair system should detect suspicious behavior and surface it transparently so recruiters can decide.

## Topic: AI Transparency and Ethics

1. Question: How do you ensure the AI is explainable?
Suggested answer: The AI is forced into a strict template with strengths, risks, and summary. We also add caching and require the model to compare resume claims with assessment performance.

2. Question: What happens if the AI model is unavailable?
Suggested answer: We fall back to deterministic rules so the product still works and outputs the same structured report format.

## Topic: Resume Parsing

1. Question: Why not use a big NLP model for resumes?
Suggested answer: We intentionally used anchor‑based parsing for speed, cost, and transparency. It is a PoC decision that can be upgraded later.

2. Question: How do you validate resume claims?
Suggested answer: The AI compares declared skills and experience with actual code performance and flags mismatches as resume inflation.

## Topic: Integrity Detection

1. Question: How do you detect cheating?
Suggested answer: We log tab switches, copy‑paste events, webcam state, face count, and movement anomalies. These are converted into a severity‑weighted integrity score.

2. Question: Why is the camera detection sometimes inconsistent?
Suggested answer: It depends on browser support and lighting. We provide a motion‑based fallback and can integrate heavier models if needed.

## Topic: System Architecture

1. Question: Is the system end‑to‑end?
Suggested answer: Yes. Candidates register, upload resumes, complete assessments, telemetry is logged, and recruiters see AI‑generated reports with raw evidence.

2. Question: How do you isolate code execution?
Suggested answer: We use a Docker sandbox for isolation. If Docker is unavailable, we run in mock mode for development.

## Topic: Scalability

1. Question: Would this scale?
Suggested answer: The architecture is modular. SQLite can be replaced with Postgres, and the sandbox can move to a scalable judge service.

2. Question: How do you reduce AI cost?
Suggested answer: We hash data and reuse AI rationale if nothing has changed. That prevents unnecessary Gemini calls.

## Topic: Data Security

1. Question: How do you secure access?
Suggested answer: JWT protects all user routes. The secret admin route is hidden for local testing only, and would be replaced by admin auth in production.

2. Question: How is sensitive data handled?
Suggested answer: Resume text is stored for audit only. We can add encryption at rest and access logs in production.

## Topic: Demo and Hackathon

1. Question: What is the PoC scope?
Suggested answer: It proves the end‑to‑end workflow and integrity signals. Production hardening would include stronger biometric models and enterprise auth.

2. Question: What was the hardest part?
Suggested answer: Coordinating data across assessment, telemetry, and AI while keeping everything explainable and deterministic.
