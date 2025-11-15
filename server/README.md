Server API for Seminar Organizer

Overview
- Express.js REST API wrapping the existing SQLite schema (`seminars`, `seminar_requests`, `admin_accounts`).
- Provides endpoints for seminars CRUD, requests submission/approval/rejection, admin auth, and email invitations with ICS.
- Loads SMTP credentials from environment variables. No secrets are hardcoded.

Quick Start
1) Requirements: Node 18+, npm
2) Install deps:
   npm install
3) Copy env and edit values:
   cp .env.example .env
4) Start dev server:
   npm run dev

Environment Variables (.env)
- PORT=4000
- SQLITE_DB_PATH=../seminars.db
- SMTP_HOST=smtp.gmail.com
- SMTP_PORT=587            # 587 with STARTTLS (recommended) or 465 with SSL
- SMTP_SECURE=false        # true if using port 465
- SMTP_REQUIRE_TLS=true
- SMTP_USER=youraddress@gmail.com
- SMTP_PASS=your_app_password   # Use Gmail App Password (2FA required)
- SMTP_FROM_NAME=Seminar Organizer
- COORDINATOR_EMAIL=coordinator@example.com
- COORDINATOR_NAME=Coordinator

Endpoints (brief)
- GET    /health
- POST   /auth/login                 # sets HttpOnly cookie session
- GET    /auth/me                    # returns current session if valid
- POST   /auth/logout                # clears session cookie
- GET    /seminars?scope=future|past|all
- POST   /seminars
- PUT    /seminars/:id
- DELETE /seminars/:id
- POST   /seminars/:id/invite { recipients: string[] }
- GET    /requests
- POST   /requests
- PUT    /requests/:id
- POST   /requests/:id/approve
- POST   /requests/:id/reject
- GET    /emf/sessions?include=presentations
- POST   /emf/sessions/ensure-next
- POST   /emf/presentations
- GET    /emf/presentations/:id
- POST   /emf/presentations/lookup      # presenters fetch their submission via email
- PUT    /emf/presentations/:id         # update via email or admin session
- DELETE /emf/presentations/:id         # delete via email or admin session
- POST   /emf/reminders/run

Notes
- On first run, creates tables if not exist and seeds default admin `admin` with password `nimda1234` if table empty.
- Time conflict checks are enforced on create/update seminar.
- Session cookies: set via `/auth/login` (JWT in HttpOnly cookie). Configure `SESSION_SECRET` and `COOKIE_SECURE` in `.env`.
- Gmail SMTP:
  - Enable 2FA and create an App Password for the Gmail account.
  - Use `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_REQUIRE_TLS=true` (or port 465 with `SMTP_SECURE=true`).
  - Set `SMTP_FROM_NAME` for display name in inbox.

Health Checks
- GET /email/verify -> returns `{ ok: true }` if SMTP transporter can connect/authenticate.

Energy Markets & Finance Series
- Keeps recurring first-Tuesday sessions for the Energy Markets & Finance track with a fixed 13:00–14:30 block split into six 15-minute slots.
- PhD/Postdoc presenters self-register via `/emf/presentations`; confirmation email reminds them they can manage submissions using their email address.
- Presenters can use `/emf/presentations/lookup` + PUT/DELETE endpoints with their email to edit or withdraw submissions.
- Lookup returns all submissions for that email (and super users can list everything with `EMF_SUPER_EMAIL`).
- Set `EMF_SUPER_EMAIL` in `.env` to allow a shared override email that can list all presentations and edit/delete any entry.
- Daily cron job (default 10:00 server time) emails presenters 1 day before their talk. Override with `EMF_REMINDER_CRON` / `EMF_REMINDER_TZ`.
- Default session settings may be customised with `EMF_DEFAULT_ROOM`, `EMF_START_TIME`, `EMF_END_TIME`, `EMF_MAX_PRESENTERS` (default 6 to match the six slots).
