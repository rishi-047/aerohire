# Troubleshooting

This file lists common issues and fixes during development or demos.

## Server Not Reachable

Symptoms:
- Browser shows “localhost refused to connect.”

Fix:
- Start backend with `uvicorn` on port 8000.
- Start frontend with `npm run dev` on port 5174.
- Use `127.0.0.1` instead of `localhost`.

## Port Already in Use

Symptoms:
- Vite logs “Port 5174 is in use.”

Fix:
- Kill old server processes:
  - `pkill -f vite`
  - `pkill -f uvicorn`
- Restart on the intended port.

## Gemini API Not Working

Symptoms:
- AI audit shows fallback results.

Fix:
- Set `GEMINI_API_KEY` in `backend/.env`.
- Restart backend.

## Docker Not Available

Symptoms:
- Backend logs indicate mock mode.

Fix:
- Install Docker and ensure it is running.
- Restart backend.

## Resume Parsing Returns Nothing

Symptoms:
- Empty skills or experience.

Fix:
- Ensure PDF has recognizable section headers.
- Try a different resume format.
- Use `/resume/parse-text` for raw testing.

## Camera or Face Detection Not Working

Symptoms:
- Integrity events not triggered.

Fix:
- Use `http://localhost` or `http://127.0.0.1`.
- Check browser permissions.
- Ensure the debug overlay shows FaceDetector or motion mode.

## Integrity Graph Shows Only LOW

Symptoms:
- Y axis never reaches MED or HIGH.

Fix:
- Trigger multi‑face or webcam‑off events.
- Use copy‑paste in editor to log MED events.
