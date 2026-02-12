# Technical Comparison - AeroHire vs Industry

This document provides a technical, engineer‑level comparison between AeroHire’s evaluation model and the common approaches used by industry hiring systems today. It is written as a generalized comparison of typical vendor patterns rather than a claim about any single company.

**Scope Notes**
This comparison is based on widely observed patterns in ATS and assessment systems: point‑scores, black‑box LLM summaries, and limited cross‑signal validation. AeroHire is a PoC, so performance and security hardening are framed as next‑step improvements rather than finished product claims.

**1. Typical Industry System (Current Pattern)**

Most production systems follow this pipeline:
- Resume ingestion (OCR or PDF extraction) → vector or keyword search.
- Assessment engines deliver coding tests and return pass/fail or score.
- Proctoring is either absent or externalized to a separate vendor.
- LLM usage is frequently a free‑form summary without strict structure.
- Final output is often a single score or a high‑level summary.

Technical characteristics:
- Resume data and assessment data are stored, but often not fused.
- The evaluation model treats resume and code as separate artifacts.
- Integrity telemetry is not tightly coupled to hiring scores.
- Explanations are frequently narrative only and not machine‑parseable.
- AI recommendations can drift between runs due to non‑determinism.

**2. AeroHire Model (PoC Architecture)**

AeroHire is designed as a multi‑signal evaluation system with explicit, structured output.

Signals fused in a single decision payload:
- Resume parsing output: structured skills and experience sections.
- Technical performance: test pass rates and per‑question scoring.
- Integrity telemetry: tab switches, paste events, camera anomalies.
- Collaboration signal: simulated teammate response and teamwork score.
- Originality ratio: typed vs pasted character counts.

Data processing characteristics:
- Resume claims and performance results are cross‑checked in the AI prompt.
- AI output format is strictly structured for deterministic parsing.
- If the LLM is unavailable, a rule‑based fallback yields the same schema.
- AI rationales are cached using stable data hashes to reduce cost and drift.

**3. Why This Is Different**

Explainability:
- Industry: Free‑form summaries, often not auditable.
- AeroHire: Mandatory `[VERDICT]`, `[CONFIDENCE]`, `[STRENGTHS]`, `[RISKS]`, `[SUMMARY]` output.

Cross‑signal validation:
- Industry: Resume and assessment are separate artifacts.
- AeroHire: Model prompt explicitly compares resume claims vs code performance.

Integrity integration:
- Industry: Proctoring is optional or detached.
- AeroHire: Integrity telemetry directly influences the audit output and integrity score.

Deterministic reproducibility:
- Industry: LLM outputs may change on re‑run.
- AeroHire: Hash‑based caching reuses rationale if evidence is unchanged.

Operational continuity:
- Industry: LLM failures often result in missing summaries.
- AeroHire: Fallback logic keeps reporting intact even without LLM access.

**4. Why It Is Better for a PoC**

From a technical demo standpoint:
- It exposes evidence pathways rather than opaque scores.
- It shows a measurable audit trail for cheating signals.
- It keeps UI and data models aligned via deterministic output formatting.
- It demonstrates “multi‑signal fusion” without heavy infrastructure.

These traits make the system stronger for judges evaluating trust, fairness, and transparency, even before production hardening.

**5. Technical Limitations in the PoC**

Known areas where industry production systems may be stronger:
- Face detection robustness and biometric validation.
- Scalable sandbox execution with distributed workers.
- Enterprise‑grade resume parsing and OCR coverage.
- Audit logging at scale with dedicated analytics pipelines.

These limitations are expected at PoC stage and can be addressed with additional engineering time.

**6. How AeroHire Could Improve**

Model reliability:
- Add model evaluation suites for false‑positive integrity flags.
- Calibrate integrity thresholds based on observed candidate behavior.

Resume understanding:
- Upgrade to structured parsers with semantic section classifiers.
- Add skills normalization and ontology mapping.

Integrity detection:
- Replace browser FaceDetector with MediaPipe or server‑side CV.
- Add audio anomaly detection with privacy‑preserving on‑device inference.

Scoring improvements:
- Introduce confidence intervals on technical scores.
- Add behavioral scoring rubric beyond binary thresholds.

System scaling:
- Migrate SQLite to Postgres.
- Move sandbox execution to a container orchestration layer.

Explainability:
- Persist “evidence references” alongside AI rationale for direct traceability.
- Add audit trails that link each AI statement to raw metrics.

**7. Summary**

Industry systems typically separate resume review, assessment scores, and integrity data. AeroHire’s model is intentionally fused and explainable. It trades some production‑grade robustness for transparency and multi‑signal coherence, which is well‑suited for a hackathon proof‑of‑concept. The roadmap to production is clear and primarily involves hardening detection, scaling infrastructure, and improving parsing accuracy.
