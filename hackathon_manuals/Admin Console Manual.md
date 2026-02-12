# Admin Console Manual

The admin console is a secret, destructive dashboard used for wiping candidate or recruiter data without terminal commands.

## Secret URL

Open in the browser:
- `http://127.0.0.1:5174/admin/aerohire-internal-ops-2026`

No login is required, so keep this URL private.

## What It Can Do

Candidates:
- List all candidates
- Delete an individual candidate
- Delete all candidates

Recruiters:
- List all recruiters
- Delete an individual recruiter
- Delete all recruiters

## What “Delete Candidate” Removes

- Candidate record
- Associated user login
- All code submissions
- All proctoring logs
- All chat responses and code history

## Safe Usage

Each delete action requires confirmation.
For testing, delete individual users instead of “Delete All” unless you intend to wipe everything.

## API Endpoints Used

These are backend routes under `/api/v1/admin`:
- `GET /admin/aerohire-internal-ops-2026/candidates`
- `GET /admin/aerohire-internal-ops-2026/recruiters`
- `DELETE /admin/aerohire-internal-ops-2026/candidates/{candidate_id}`
- `DELETE /admin/aerohire-internal-ops-2026/recruiters/{user_id}`
- `DELETE /admin/aerohire-internal-ops-2026/candidates`
- `DELETE /admin/aerohire-internal-ops-2026/recruiters`
