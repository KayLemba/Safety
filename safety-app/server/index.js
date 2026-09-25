require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.API_PORT || 4000);
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/tactivo_safety';
const SESSION_COOKIE = 'tactivo_session';
const pool = new Pool({ connectionString: DATABASE_URL });
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const roles = new Set(['admin', 'safety_manager', 'supervisor', 'technician', 'viewer']);
const managerRoles = new Set(['admin', 'safety_manager']);
const signSecret = process.env.SESSION_SECRET || 'change-this-local-session-secret';

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (error, derived) => error ? reject(error) : resolve(`${salt}:${derived.toString('hex')}`)));
}
function verifyPassword(password, stored) {
  const [salt, key] = String(stored || '').split(':');
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (error, derived) => {
    if (error) return reject(error);
    resolve(Boolean(key) && crypto.timingSafeEqual(Buffer.from(key, 'hex'), derived));
  }));
}
function randomToken() { return crypto.randomBytes(32).toString('hex'); }
function initials(name) { return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'TM'; }
function readCookie(req, name) { return String(req.headers.cookie || '').split(';').map((item) => item.trim().split('='))[Symbol.iterator](); }
function getCookie(req, name) {
  for (const [key, ...rest] of String(req.headers.cookie || '').split(';').map((item) => item.trim().split('='))) if (key === name) return decodeURIComponent(rest.join('='));
  return null;
}
function setCookie(res, value, maxAge = 60 * 60 * 24 * 7) { res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`); }
function clearCookie(res) { res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`); }
function publicUser(row) { return { id: row.id, name: row.name, email: row.email, role: row.role, site: row.site, status: row.status, initials: row.initials }; }

async function initDatabase() {
  await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  const count = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  if (count.rows[0].count === 0) {
    const passwordHash = await hashPassword(process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!');
    await pool.query(`INSERT INTO users (name, email, password_hash, role, site, status) VALUES ($1, $2, $3, 'admin', $4, 'active')`, ['Team manager', process.env.SEED_ADMIN_EMAIL || 'manager@tactivo.co.zm', passwordHash, 'Lusaka HQ']);
  }
}

async function currentUser(req) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const result = await pool.query(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = encode(digest($1, 'sha256'), 'hex') AND s.expires_at > NOW() AND u.status = 'active'`, [token]);
  return result.rows[0] || null;
}
async function requireAuth(req, res, next) { try { req.user = await currentUser(req); if (!req.user) return res.status(401).json({ error: 'Authentication required.' }); next(); } catch (error) { next(error); } }
function requireRole(...allowed) { return (req, res, next) => allowed.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have permission for this action.' }); }
function validatePassword(password) { return typeof password === 'string' && password.length >= 8; }

app.get('/api/health', async (_req, res) => { try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'postgresql' }); } catch (error) { res.status(503).json({ ok: false, error: 'Database unavailable' }); } });
app.get('/api/auth/me', async (req, res, next) => { try { const user = await currentUser(req); res.json({ user: user ? publicUser(user) : null }); } catch (error) { next(error); } });
app.post('/api/auth/signup', async (req, res, next) => {
  const { name, email, password, role = 'supervisor', inviteToken } = req.body || {};
  if (!String(name || '').trim() || !String(email || '').trim() || !validatePassword(password)) return res.status(400).json({ error: 'Name, email, and a password of at least 8 characters are required.' });
  if (!roles.has(role) || role === 'admin' && !inviteToken) return res.status(400).json({ error: 'Choose a valid workspace role.' });
  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows[0]) return res.status(409).json({ error: 'An account with that email already exists.' });
    let invite = null;
    if (inviteToken) {
      const result = await pool.query(`SELECT * FROM invitations WHERE token_hash = encode(digest($1, 'sha256'), 'hex') AND accepted_at IS NULL AND expires_at > NOW()`, [inviteToken]);
      invite = result.rows[0];
      if (!invite || invite.email !== normalizedEmail) return res.status(400).json({ error: 'This invitation is invalid, expired, or for a different email.' });
    }
    const passwordHash = await hashPassword(password);
    const result = await pool.query(`INSERT INTO users (name, email, password_hash, role, site, status) VALUES ($1, $2, $3, $4, $5, 'active') RETURNING *`, [String(name).trim(), normalizedEmail, passwordHash, invite?.role || role, invite?.site || 'Lusaka HQ']);
    const user = result.rows[0];
    await pool.query(`INSERT INTO team_members (id, initials, name, role, access_level, site, status, email, phone) VALUES ($1, $2, $3, $4, $5, $6, 'Available', $7, '') ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, access_level = EXCLUDED.access_level`, [`user-${user.id}`, initials(user.name), user.name, 'Safety operations', user.role, user.site, user.email]);
    if (invite) await pool.query('UPDATE invitations SET accepted_at = NOW() WHERE id = $1', [invite.id]);
    const token = randomToken(); await pool.query('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, encode(digest($2, \'sha256\'), \'hex\'), NOW() + INTERVAL \'7 days\')', [user.id, token]); setCookie(res, token);
    res.status(201).json({ user: publicUser(user) });
  } catch (error) { next(error); }
});
app.post('/api/auth/login', async (req, res, next) => {
  const { email, password } = req.body || {};
  try { const result = await pool.query('SELECT * FROM users WHERE email = $1 AND status = \'active\'', [String(email || '').trim().toLowerCase()]); const user = result.rows[0]; if (!user || !(await verifyPassword(password || '', user.password_hash))) return res.status(401).json({ error: 'Invalid email or password.' }); const token = randomToken(); await pool.query('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, encode(digest($2, \'sha256\'), \'hex\'), NOW() + INTERVAL \'7 days\')', [user.id, token]); setCookie(res, token); res.json({ user: publicUser(user) }); } catch (error) { next(error); }
});
app.post('/api/auth/logout', async (req, res, next) => { try { const token = getCookie(req, SESSION_COOKIE); if (token) await pool.query('DELETE FROM sessions WHERE token_hash = encode(digest($1, \'sha256\'), \'hex\')', [token]); clearCookie(res); res.json({ ok: true }); } catch (error) { next(error); } });
app.post('/api/auth/request-reset', async (req, res, next) => { try { const result = await pool.query('SELECT id FROM users WHERE email = $1', [String(req.body?.email || '').trim().toLowerCase()]); if (result.rows[0]) { const token = randomToken(); await pool.query('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, encode(digest($2, \'sha256\'), \'hex\'), NOW() + INTERVAL \'1 hour\')', [result.rows[0].id, token]); console.log(`Password reset token for ${req.body.email}: ${token}`); } res.json({ ok: true, message: 'If that email exists, a reset link has been created. Check the API log in local development.' }); } catch (error) { next(error); } });
app.post('/api/auth/reset-password', async (req, res, next) => { const { token, password } = req.body || {}; if (!validatePassword(password)) return res.status(400).json({ error: 'Password must be at least 8 characters.' }); try { const reset = await pool.query(`SELECT * FROM password_resets WHERE token_hash = encode(digest($1, 'sha256'), 'hex') AND used_at IS NULL AND expires_at > NOW()`, [token]); if (!reset.rows[0]) return res.status(400).json({ error: 'This reset token is invalid or expired.' }); const passwordHash = await hashPassword(password); await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, reset.rows[0].user_id]); await pool.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [reset.rows[0].id]); res.json({ ok: true }); } catch (error) { next(error); } });

app.use('/api', requireAuth);
app.get('/api/team-members', async (_req, res, next) => { try { const result = await pool.query('SELECT tm.id, tm.initials, tm.name, tm.role, tm.access_level AS "accessLevel", tm.site, tm.status, tm.email, tm.phone, u.id AS "userId", u.status AS "accountStatus" FROM team_members tm LEFT JOIN users u ON lower(u.email) = lower(tm.email) ORDER BY tm.name'); res.json(result.rows); } catch (error) { next(error); } });
app.get('/api/users', requireRole('admin', 'safety_manager'), async (_req, res, next) => { try { const result = await pool.query('SELECT id, name, email, role, site, status, created_at AS "createdAt" FROM users ORDER BY name'); res.json(result.rows); } catch (error) { next(error); } });
app.post('/api/users', requireRole('admin', 'safety_manager'), async (req, res, next) => { const { name, email, password, role = 'supervisor', site = 'Lusaka HQ', phone = '' } = req.body || {}; if (!String(name || '').trim() || !String(email || '').includes('@') || !validatePassword(password) || !roles.has(role) || role === 'admin' && req.user.role !== 'admin') return res.status(400).json({ error: 'Name, email, password of at least 8 characters, and a valid permitted role are required.' }); try { const normalizedEmail = String(email).trim().toLowerCase(); const exists = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]); if (exists.rows[0]) return res.status(409).json({ error: 'An account with that email already exists.' }); const passwordHash = await hashPassword(password); const userResult = await pool.query(`INSERT INTO users (name, email, password_hash, role, site, status) VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id, name, email, role, site, status, created_at AS "createdAt"`, [String(name).trim(), normalizedEmail, passwordHash, role, site]); const user = userResult.rows[0]; await pool.query(`INSERT INTO team_members (id, initials, name, role, access_level, site, status, email, phone) VALUES ($1, $2, $3, 'Safety operations', $4, $5, 'Available', $6, $7) ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, access_level = EXCLUDED.access_level, site = EXCLUDED.site, status = 'Available', phone = EXCLUDED.phone`, [`user-${user.id}`, initials(user.name), user.name, role, site, user.email, phone]); res.status(201).json(user); } catch (error) { next(error); } });
app.delete('/api/users/:id', requireRole('admin', 'safety_manager'), async (req, res, next) => { if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account.' }); try { const target = await pool.query('SELECT id, role FROM users WHERE id = $1', [req.params.id]); if (!target.rows[0]) return res.status(404).json({ error: 'Account not found.' }); if (req.user.role !== 'admin' && target.rows[0].role === 'admin') return res.status(403).json({ error: 'Only an admin can delete an admin account.' }); await pool.query(`UPDATE users SET status = 'disabled', updated_at = NOW() WHERE id = $1`, [req.params.id]); await pool.query('DELETE FROM sessions WHERE user_id = $1', [req.params.id]); await pool.query(`UPDATE team_members SET status = 'Account disabled', updated_at = NOW() WHERE email = (SELECT email FROM users WHERE id = $1)`, [req.params.id]); res.json({ ok: true }); } catch (error) { next(error); } });
app.get('/api/invitations', requireRole('admin', 'safety_manager'), async (_req, res, next) => { try { const result = await pool.query(`SELECT id, email, name, role, site, expires_at AS "expiresAt", accepted_at AS "acceptedAt", created_at AS "createdAt" FROM invitations ORDER BY created_at DESC LIMIT 100`); res.json(result.rows); } catch (error) { next(error); } });
app.post('/api/invitations', requireRole('admin', 'safety_manager'), async (req, res, next) => { const { email, name, role, site = 'Lusaka HQ' } = req.body || {}; if (!String(email || '').includes('@') || !String(name || '').trim() || !roles.has(role) || role === 'admin' && req.user.role !== 'admin') return res.status(400).json({ error: 'Name, email, and a valid permitted role are required.' }); try { const token = randomToken(); const result = await pool.query(`INSERT INTO invitations (email, name, role, site, token_hash, invited_by, expires_at) VALUES ($1, $2, $3, $4, encode(digest($5, 'sha256'), 'hex'), $6, NOW() + INTERVAL '7 days') RETURNING id, email, name, role, site, expires_at AS "expiresAt"`, [String(email).trim().toLowerCase(), String(name).trim(), role, site, token, req.user.id]); res.status(201).json({ ...result.rows[0], token }); } catch (error) { next(error); } });
app.get('/api/safety-records', async (req, res, next) => { try { const result = await pool.query(`SELECT id, record_type AS "type", title, site, owner, to_char(due_date, 'YYYY-MM-DD') AS "dueDate", description, severity, status, created_at AS "createdAt", updated_at AS "updatedAt" FROM safety_records WHERE ($1::text IS NULL OR record_type = $1) ORDER BY updated_at DESC`, [req.query.type || null]); res.json(result.rows); } catch (error) { next(error); } });
app.post('/api/safety-records', async (req, res, next) => { const { id, type, title, site, owner = 'Unassigned', dueDate = null, description = '', severity = 'Medium', status = 'Open' } = req.body || {}; if (!['incidents', 'inspections', 'actions'].includes(type) || !String(title || '').trim() || !String(site || '').trim()) return res.status(400).json({ error: 'Record type, title, and site are required.' }); try { const result = await pool.query(`INSERT INTO safety_records (id, record_type, title, site, owner, due_date, description, severity, status, created_by) VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, record_type AS "type", title, site, owner, to_char(due_date, 'YYYY-MM-DD') AS "dueDate", description, severity, status, created_at AS "createdAt", updated_at AS "updatedAt"`, [id || null, type, String(title).trim(), String(site).trim(), owner, dueDate || null, description, severity, status, req.user.id]); res.status(201).json(result.rows[0]); } catch (error) { next(error); } });
app.patch('/api/safety-records/:id', async (req, res, next) => { const { title, site, owner, dueDate, description, severity, status } = req.body || {}; try { const result = await pool.query(`UPDATE safety_records SET title = COALESCE($1, title), site = COALESCE($2, site), owner = COALESCE($3, owner), due_date = COALESCE($4, due_date), description = COALESCE($5, description), severity = COALESCE($6, severity), status = COALESCE($7, status), updated_at = NOW() WHERE id = $8 RETURNING id, record_type AS "type", title, site, owner, to_char(due_date, 'YYYY-MM-DD') AS "dueDate", description, severity, status, created_at AS "createdAt", updated_at AS "updatedAt"`, [title, site, owner, dueDate || null, description, severity, status, req.params.id]); if (!result.rows[0]) return res.status(404).json({ error: 'Safety record not found.' }); res.json(result.rows[0]); } catch (error) { next(error); } });
app.delete('/api/safety-records/:id', async (req, res, next) => { try { const result = await pool.query('DELETE FROM safety_records WHERE id = $1 RETURNING id', [req.params.id]); if (!result.rows[0]) return res.status(404).json({ error: 'Safety record not found.' }); res.status(204).end(); } catch (error) { next(error); } });
app.get('/api/messages', async (req, res, next) => { try { const result = await pool.query(`SELECT m.id, m.sender_name AS "senderName", m.sender_role AS "senderRole", m.sender_user_id AS "senderUserId", m.recipient_id AS "recipientId", m.recipient_user_id AS "recipientUserId", tm.name AS "recipientName", m.subject, m.body, m.status, m.created_at AS "createdAt", (m.recipient_user_id = $1) AS "isReceived" FROM messages m JOIN team_members tm ON tm.id = m.recipient_id WHERE m.sender_user_id = $1 OR m.recipient_user_id = $1 OR (m.sender_user_id IS NULL AND m.recipient_user_id IS NULL) ORDER BY m.created_at DESC LIMIT 200`, [req.user.id]); res.json(result.rows); } catch (error) { next(error); } });
app.post('/api/messages', async (req, res, next) => { const { recipientId, subject, body } = req.body || {}; if (!recipientId || !String(subject || '').trim() || !String(body || '').trim()) return res.status(400).json({ error: 'Recipient, subject, and message are required.' }); try { const result = await pool.query(`INSERT INTO messages (sender_name, sender_role, sender_user_id, recipient_id, recipient_user_id, subject, body) SELECT $1, $2, $3, tm.id, u.id, $4, $5 FROM team_members tm LEFT JOIN users u ON lower(u.email) = lower(tm.email) WHERE tm.id = $6 RETURNING id, sender_name AS "senderName", sender_role AS "senderRole", sender_user_id AS "senderUserId", recipient_id AS "recipientId", recipient_user_id AS "recipientUserId", subject, body, status, created_at AS "createdAt"`, [req.user.name, req.user.role, req.user.id, String(subject).trim(), String(body).trim(), recipientId]); if (!result.rows[0]) return res.status(404).json({ error: 'Recipient not found.' }); res.status(201).json(result.rows[0]); } catch (error) { next(error); } });
app.patch('/api/messages/:id/read', async (req, res, next) => { try { const result = await pool.query('UPDATE messages SET status = \'read\' WHERE id = $1 AND recipient_user_id = $2 RETURNING id, status', [req.params.id, req.user.id]); res.json(result.rows[0] || { id: req.params.id, status: 'read' }); } catch (error) { next(error); } });
app.patch('/api/team-members/:id', requireRole('admin', 'safety_manager'), async (req, res, next) => {
  const { name, memberRole, accessLevel, site, status, email, phone } = req.body || {};
  if (accessLevel && !roles.has(accessLevel)) return res.status(400).json({ error: 'Invalid workspace role.' });
  if (accessLevel === 'admin' && req.user.role !== 'admin') return res.status(403).json({ error: 'Only an admin can grant admin access.' });
  try {
    const result = await pool.query(`UPDATE team_members SET name = COALESCE($1, name), role = COALESCE($2, role), access_level = COALESCE($3, access_level), site = COALESCE($4, site), status = COALESCE($5, status), email = COALESCE($6, email), phone = COALESCE($7, phone), updated_at = NOW() WHERE id = $8 RETURNING id, initials, name, role, access_level AS "accessLevel", site, status, email, phone`, [name, memberRole, accessLevel, site, status, email, phone, req.params.id]);
    const member = result.rows[0];
    if (!member) return res.status(404).json({ error: 'Team member not found.' });
    // Keep the real login permission in sync with the directory's "workspace access" field.
    // Without this, editing access level here only changed the cosmetic team_members row and
    // never touched users.role, which is what requireRole() actually checks on every route.
    let roleSynced = false;
    if (accessLevel) {
      const userUpdate = await pool.query('UPDATE users SET role = $1, updated_at = NOW() WHERE lower(email) = lower($2) RETURNING id', [accessLevel, member.email]);
      roleSynced = userUpdate.rows.length > 0;
    }
    res.json({ ...member, roleSynced });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: 'Server error' }); });
initDatabase().then(() => app.listen(PORT, () => console.log(`Tactivo local API listening on http://localhost:${PORT}`))).catch((error) => { console.error('Unable to initialize PostgreSQL:', error.message); process.exit(1); });
