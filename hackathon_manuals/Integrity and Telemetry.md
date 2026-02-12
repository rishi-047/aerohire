# Integrity and Telemetry

This manual documents the cheating detection system and how integrity signals appear in the recruiter dashboard.

## Event Sources

Tab switch detection:
- Triggered by `document.visibilitychange`
- Logs `TAB_SWITCH` with severity LOW

Copy‑paste detection:
- Logged when Monaco editor receives paste input
- Logs `COPY_PASTE_DETECTED` with severity MEDIUM

Camera integrity:
- If webcam is blocked or stopped, logs `WEBCAM_DISABLED` with severity HIGH
- If no face appears repeatedly, logs `FACE_NOT_DETECTED` with severity MEDIUM
- If multiple faces are detected, logs `MULTIPLE_FACES` with severity HIGH
- If head/body movement is extreme, logs `SUSPICIOUS_BEHAVIOR` with severity MEDIUM

## Detection Modes

Face detection mode:
- Uses the browser FaceDetector API
- Tracks face count and bounding box movement

Motion fallback mode:
- Used when FaceDetector is unavailable
- Compares frame difference for movement
- Logs `SUSPICIOUS_BEHAVIOR`

## How Integrity Score Is Computed

Integrity score starts at 100.
Each log reduces the score:
- LOW = -2
- MEDIUM = -5
- HIGH = -10

## Recruiter Timeline

The recruiter Session Integrity timeline shows:
- Y axis: LOW, MED, HIGH
- X axis: time in the assessment
- Red markers for high severity events
- Brush slider for zoom

## Debug Overlay

For development, the assessment UI shows an integrity debug overlay:
- Face count
- Motion delta
- Streak counters

This helps verify why events are triggered or missed.

## Common Inconsistencies and Fixes

If MED/HIGH events are missing:
- Verify camera permissions
- Ensure FaceDetector is supported or motion fallback is active
- Trigger a second face for longer than one detection cycle
- Wait for cooldown window to expire
