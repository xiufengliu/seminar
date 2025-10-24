Seminar Organizer Mobile (Expo / React Native)

Overview
- Cross-platform app with modern UI using React Native Paper and React Navigation.
- Covers: view upcoming/past seminars, submit requests, admin login + manage seminars/requests, send invitations.
- Talks to the Express API in `../server` and keeps the same SQLite schema on the server.

Quick Start
1) Requirements: Node 18+, Expo CLI
2) Install deps: npm install
3) Set API base URL in `src/config.js`
4) Run: npx expo start

Features
- Calendar and list views with filters (type/room).
- Seminar request form with validation.
- Admin area for CRUD and approvals.
- Invitation flow triggers backend ICS email.
- Optional local reminders via Expo Notifications (stubbed).

