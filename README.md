# Order Desk

- `frontend/`  React + Vite web app (port 5173). Playwright E2E tests in `frontend/e2e/`
- `backend/`   Express + MongoDB API (port 4000)
- `backend/shared/`  zod schemas/types used by both (imported as `@order-desk/shared`)
- `backend/docs/`  SPEC.md, API.md, old reference HTML

Run: Docker Desktop on, then double-click `start.bat` (installs, starts MongoDB, seeds, starts API + web).
Login: admin / admin123. Web: http://localhost:5173
Commands: `npm run dev:api`, `npm run dev:web`, `npm test`, `npm run typecheck`, `npm run seed`.

In production, uploaded, resized WebP images are stored in MongoDB GridFS automatically, regardless of `STORAGE_DRIVER`, so they persist across deploys without Render configuration changes. The API synchronizes the configured `ADMIN_USERNAME` and `ADMIN_PASSWORD` with the existing admin account at startup; changing `ADMIN_PASSWORD` then restarting/redeploying updates that account and revokes its active sessions.
