CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  initials TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  access_level TEXT NOT NULL CHECK (access_level IN ('admin', 'safety_manager', 'supervisor', 'viewer')),
  site TEXT NOT NULL,
  status TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
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

INSERT INTO team_members (id, initials, name, role, access_level, site, status, email, phone)
VALUES
  ('tm-01', 'TM', 'Team manager', 'Operations workspace', 'admin', 'Lusaka HQ', 'Available', 'manager@tactivo.co.zm', '+260 211 000 000'),
  ('eh-02', 'EH', 'Engineering lead', 'Fuel infrastructure', 'supervisor', 'Lusaka · Field team', 'On site', 'engineering@tactivo.co.zm', '+260 211 000 001'),
  ('sm-03', 'SM', 'Safety manager', 'Safety & compliance', 'safety_manager', 'Lusaka HQ', 'Available', 'safety@tactivo.co.zm', '+260 211 000 002'),
  ('it-04', 'IT', 'IT & security lead', 'Systems and security', 'viewer', 'Lusaka · Support', 'Available', 'support@tactivo.co.zm', '+260 211 000 003')
ON CONFLICT (id) DO NOTHING;
