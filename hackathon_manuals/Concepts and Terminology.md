# Concepts and Terminology

This file explains core concepts in AeroHire to help judges and teammates understand the system quickly.

## Glass Box AI

Definition:
An AI system that produces transparent, structured explanations for every decision.

In AeroHire:
- Outputs include Strengths, Risks, Summary.
- The model is explicitly instructed to cite resume evidence.

## Integrity Score

Definition:
A numeric score representing session trustworthiness.

In AeroHire:
- Starts at 100.
- Reduced by LOW, MEDIUM, HIGH events.

## Originality Ratio

Definition:
The ratio of typed vs pasted code.

In AeroHire:
- Computed from `char_breakdown`.
- Lower values indicate possible copy‑paste.

## Simulated Teammate Test

Definition:
A chat‑based prompt that measures collaboration and empathy.

In AeroHire:
- Appears during Q2.
- The response is scored and shown to recruiters.

## Resume Inflation

Definition:
When resume experience does not align with actual assessment performance.

In AeroHire:
- Flagged if experience > 5 years but technical score is weak.

## Proctoring Log

Definition:
An event recorded when suspicious behavior is detected.

In AeroHire:
- Used to generate timeline charts and integrity score.
