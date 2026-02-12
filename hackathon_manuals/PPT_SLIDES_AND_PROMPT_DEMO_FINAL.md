# AeroHire Final Demo PPT - Slide Blueprint + Claude Prompt

## Ready-to-Paste Prompt for Claude
Use this prompt as-is in Claude to generate your PPT:

```text
Build a 14-slide technical demo deck for AeroHire using the context file: /Users/junixr/Documents/SRM Innovation Hackathon V2/AeroHire Product/hackathon_manuals/CLAUDE_CONTEXT_DEMO_FINAL.md

Output requirements:
1) Slide-by-slide content with title, subtitle, key bullets, visual spec, and speaker notes.
2) Generate SVG-style diagram specs for architecture/data flow/integrity pipeline/3-way baseline comparison.
3) Tone: engineer-level, factual, defensible, no marketing fluff.
4) Include explicit PoC-vs-roadmap separation.
5) Include one slide for demo run order (HIRE, REVIEW, NO_HIRE) with exact candidate names.
6) Include one slide for likely technical judge questions and concise answers.

Design requirements:
- Dark professional technical theme
- Strong visual hierarchy
- Minimal clutter, high signal
- Tables/charts readable from distance

Do not invent features not present in the context file.
```

## Slide-by-Slide Content Plan

### Slide 1 - Title
Title: AeroHire  
Subtitle: Explainable, Integrity-Aware Hiring Intelligence  
Bullets:
1. Hackathon Final Demo
2. Resume + Assessment + Integrity + Glass Box AI
Visual:
1. Clean product wordmark and one-line value statement
Speaker note:
1. Position as a working PoC, not a concept deck.

### Slide 2 - Problem
Title: Hiring Pipelines Still Have Trust Gaps  
Bullets:
1. Resume screening and coding tests are often disconnected
2. AI decisions are opaque
3. Integrity signals are weak or post-hoc
Visual:
1. Pain-point flow (Resume -> Test -> Decision) with broken links
Speaker note:
1. Set up why explainability and multi-signal fusion matter.

### Slide 3 - Solution
Title: AeroHire - End-to-End Signal Fusion  
Bullets:
1. Unified candidate journey from resume to final recommendation
2. Every decision backed by evidence tags
3. Recruiter-visible baseline checklist and risk rationale
Visual:
1. High-level 5-step pipeline
Speaker note:
1. Clarify this is implemented workflow, not roadmap.

### Slide 4 - System Architecture (SVG)
Title: Technical Architecture  
Bullets:
1. Frontend modules (Candidate, Recruiter, Admin)
2. FastAPI service layer
3. SQLite persistence + AI service integration
Visual:
1. SVG architecture diagram
Speaker note:
1. Emphasize modular service boundaries.

### Slide 5 - API and Data Flow (SVG)
Title: API Connectivity and Runtime Flow  
Bullets:
1. Resume upload -> parser -> candidate profile store
2. Assessment submit -> scoring + telemetry logs
3. Dashboard fetch -> AI rationale generation/reuse
Visual:
1. Request/response data flow diagram
Speaker note:
1. Mention rationale hashing to reduce repeated AI calls.

### Slide 6 - Integrity Pipeline (SVG)
Title: Integrity Signal Pipeline  
Bullets:
1. Captured events: tab switch, copy/paste, webcam anomalies
2. Severity mapping and weighted integrity scoring
3. Timeline visualization with rationale tooltips
Visual:
1. SVG event pipeline + scoring formula box
Speaker note:
1. Explain deterministic NO_HIRE trigger for high integrity risk patterns.

### Slide 7 - Glass Box AI Report
Title: Explainable AI Audit  
Bullets:
1. Strict output contract: verdict/confidence/strengths/risks/summary
2. Evidence tags for traceability
3. Rule fallback if LLM unavailable
Visual:
1. Screenshot mock of AI Audit card with evidence lines
Speaker note:
1. Contrast this with black-box ATS ranking.

### Slide 8 - 3-Way Comparator (SVG)
Title: Resume vs Assessment vs Baseline  
Bullets:
1. Resume claims evaluated against role baseline
2. Assessment performance mapped to minimum thresholds
3. Risk surfaced when misalignment exists
Visual:
1. Triangle/3-lane comparator diagram
Speaker note:
1. This is a core differentiator versus generic scoring tools.

### Slide 9 - Baseline Checklist UI
Title: Company Baseline Checklist (Implemented)  
Bullets:
1. Per-element checks: role, required skills, preferred skills, technical threshold, integrity threshold, experience band
2. Status types: Met/Partial/Missing/Unknown
3. Dynamic matching with synonym and raw-text fallback
Visual:
1. Checklist card screenshot or UI recreation
Speaker note:
1. Mention 70 percent required-skill threshold.

### Slide 10 - Candidate Experience
Title: Candidate Journey and Feedback Loop  
Bullets:
1. Resume upload, assessment, status tracking
2. Recruiter decision note visible to candidate
3. Transparent communication after outcome
Visual:
1. Candidate timeline view + decision note panel
Speaker note:
1. Show this as a fairness and UX trust feature.

### Slide 11 - Recruiter Experience
Title: Recruiter Decision Surface  
Bullets:
1. Technical/psychometric/originality/integrity consolidated
2. AI rationale with evidence + baseline checklist
3. Action controls: status update, reset approval, admin ops
Visual:
1. Recruiter dashboard composite snapshot
Speaker note:
1. Focus on decision confidence and reduced ambiguity.

### Slide 12 - Live Demo Run Order
Title: Controlled Demo Outcomes  
Bullets:
1. Syed Abdullah -> HIRE
2. Aarya Rishi Mondal -> REVIEW
3. Aradhya Dutta -> NO_HIRE
4. Resume files prepared in `/Demo`
Visual:
1. Three-column outcome plan with color coding
Speaker note:
1. Explain this demonstrates non-binary decision quality.

### Slide 13 - Comparison vs Typical Industry Systems
Title: How AeroHire Differs  
Bullets:
1. Black-box ranking vs evidence-tagged rationale
2. Generic fit score vs explicit baseline checklist
3. Isolated tests vs integrated integrity telemetry
Visual:
1. Side-by-side comparison table
Speaker note:
1. Keep claims factual and tied to implemented features.

### Slide 14 - Roadmap and Closing
Title: PoC to Production Path  
Bullets:
1. Baseline editor UI for recruiters
2. Postgres + multi-tenant deployment
3. SSO, policy controls, analytics hardening
4. Final ask: validation and pilot feedback
Visual:
1. Quarter-wise roadmap strip
Speaker note:
1. Clear separation: what exists now vs next upgrades.

## Optional Backup Slides
1. Judge Q&A technical appendix.
2. Risk/limitations and mitigation.
3. Cost and deployment assumptions.
