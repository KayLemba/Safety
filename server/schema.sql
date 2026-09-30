CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'safety_manager', 'supervisor', 'technician', 'viewer')),
  site TEXT NOT NULL DEFAULT 'Lusaka HQ',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions (token_hash);

CREATE TABLE IF NOT EXISTS password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'safety_manager', 'supervisor', 'technician', 'viewer')),
  site TEXT NOT NULL DEFAULT 'Lusaka HQ',
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS invitations_email_idx ON invitations (email, expires_at DESC);

CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  initials TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  access_level TEXT NOT NULL CHECK (access_level IN ('admin', 'safety_manager', 'supervisor', 'technician', 'viewer')),
  site TEXT NOT NULL,
  status TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  recipient_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'read')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS messages_recipient_created_idx ON messages (recipient_id, created_at DESC);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
-- "Trash" is per-person: each side of a conversation can delete their own copy without affecting the other's.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_by_sender_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_by_recipient_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS messages_recipient_user_idx ON messages (recipient_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS safety_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type TEXT NOT NULL CHECK (record_type IN ('incidents', 'inspections', 'actions')),
  title TEXT NOT NULL,
  site TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT 'Unassigned',
  due_date DATE,
  description TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'Medium',
  status TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS safety_records_type_updated_idx ON safety_records (record_type, updated_at DESC);

INSERT INTO team_members (id, initials, name, role, access_level, site, status, email, phone)
VALUES
  ('tm-01', 'TM', 'Team manager', 'Operations workspace', 'admin', 'Lusaka HQ', 'Available', 'manager@tactivo.co.zm', '+260 211 000 000'),
  ('eh-02', 'EH', 'Engineering lead', 'Fuel infrastructure', 'supervisor', 'Lusaka · Field team', 'On site', 'engineering@tactivo.co.zm', '+260 211 000 001'),
  ('sm-03', 'SM', 'Safety manager', 'Safety & compliance', 'safety_manager', 'Lusaka HQ', 'Available', 'safety@tactivo.co.zm', '+260 211 000 002'),
  ('it-04', 'IT', 'IT & security lead', 'Systems and security', 'viewer', 'Lusaka · Support', 'Available', 'support@tactivo.co.zm', '+260 211 000 003'),
  ('ft-05', 'FT', 'Field technician', 'Field safety & maintenance', 'technician', 'Lusaka · Field team', 'On site', 'field.tech@tactivo.co.zm', '+260 211 000 004')
ON CONFLICT (id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS team_members_email_unique_idx ON team_members (email);

-- Keep existing local installations compatible with the expanded workspace roles.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'safety_manager', 'supervisor', 'technician', 'viewer'));
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE invitations ADD CONSTRAINT invitations_role_check CHECK (role IN ('admin', 'safety_manager', 'supervisor', 'technician', 'viewer'));
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_access_level_check;
ALTER TABLE team_members ADD CONSTRAINT team_members_access_level_check CHECK (access_level IN ('admin', 'safety_manager', 'supervisor', 'technician', 'viewer'));
