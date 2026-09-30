# Local PostgreSQL development

The Safety Operations workspace uses a local Express API backed by PostgreSQL. Authentication, team members, invitations, messages, and access roles are persisted in PostgreSQL; the browser session is held in an HTTP-only cookie.

## 1. Install PostgreSQL

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo -u postgres psql -c "CREATE USER tactivo WITH PASSWORD 'tactivo';"
sudo -u postgres psql -c "CREATE DATABASE tactivo_safety OWNER tactivo;"
```

Set `DATABASE_URL=postgresql://tactivo:tactivo@localhost:5432/tactivo_safety` in a local `.env` file. Do not commit `.env` or production passwords. You may also set `SESSION_SECRET`, `SEED_ADMIN_EMAIL`, and `SEED_ADMIN_PASSWORD`.

## 2. Install and run

```bash
npm install
npm run server
```

The API creates the schema on startup and seeds one local admin account when the users table is empty. By default, the development credentials are `manager@tactivo.co.zm` / `ChangeMe123!`; set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` before first startup to use different credentials.

In another terminal:

```bash
npm start
```

The React development server proxies `/api` requests to port 4000.

## Authentication and invitations

Users can create supervisor or safety officer/manager accounts from the sign-up screen. Admins and safety officer/managers can open **People & teams → Invite team member**, choose a role, and create an invitation stored in PostgreSQL. The returned one-time registration token is shared with the invitee, who enters it during sign-up. Admin is restricted to admins when creating invitations.

Password reset requests are stored as expiring PostgreSQL tokens. For this local-only setup, the reset token is printed by the API process rather than sent through an external email provider. Open the app with `/?reset=<token>` to complete the password change.

## Role priority

The API enforces these workspace roles server-side:

- `admin`: full directory and invitation management, including assigning admin.
- `safety_manager`: directory edits and invitations for supervisors or safety officers/managers.
- `supervisor`: authenticated operational access without directory administration.
- `viewer`: read-only compatibility role for existing seeded directory records.

Do not rely on client-side role controls for security; all protected API routes validate the PostgreSQL session and role.
