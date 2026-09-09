require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.API_PORT || 4000);
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/tactivo_safety';
const pool = new Pool({ connectionString: DATABASE_URL });
const app = express();
app.use(cors());
app.use(express.json());

const roles = new Set(['admin', 'safety_manager', 'supervisor', 'viewer']);
const managerRoles = new Set(['admin', 'safety_manager']);

async function initDatabase() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
}

function requestUser(req) {
  const role = roles.has(req.header('x-user-role')) ? req.header('x-user-role') : 'viewer';
  const name = req.header('x-user-name') || 'Workspace user';
  return { role, name };
}

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'postgresql' }); }
  catch (error) { res.status(503).json({ ok: false, error: 'Database unavailable' }); }
});

app.get('/api/team-members', async (_req, res, next) => {
  try {
    const result = await pool.query('SELECT id, initials, name, role, access_level AS "accessLevel", site, status, email, phone FROM team_members ORDER BY name');
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.get('/api/messages', async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT m.id, m.sender_name AS "senderName", m.sender_role AS "senderRole", m.recipient_id AS "recipientId", tm.name AS "recipientName", m.subject, m.body, m.status, m.created_at AS "createdAt" FROM messages m JOIN team_members tm ON tm.id = m.recipient_id ORDER BY m.created_at DESC LIMIT 200`);
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.post('/api/messages', async (req, res, next) => {
  const { role, name } = requestUser(req);
  const { recipientId, subject, body } = req.body || {};
  if (!recipientId || !String(subject || '').trim() || !String(body || '').trim()) return res.status(400).json({ error: 'Recipient, subject, and message are required.' });
  try {
    const result = await pool.query(`INSERT INTO messages (sender_name, sender_role, recipient_id, subject, body) VALUES ($1, $2, $3, $4, $5) RETURNING id, sender_name AS "senderName", sender_role AS "senderRole", recipient_id AS "recipientId", subject, body, status, created_at AS "createdAt"`, [name, role, recipientId, String(subject).trim(), String(body).trim()]);
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

app.patch('/api/messages/:id/read', async (req, res, next) => {
  try { const result = await pool.query('UPDATE messages SET status = \'read\' WHERE id = $1 RETURNING id, status', [req.params.id]); res.json(result.rows[0] || { id: req.params.id, status: 'read' }); }
  catch (error) { next(error); }
});

app.patch('/api/team-members/:id', async (req, res, next) => {
  const { role } = requestUser(req);
  if (!managerRoles.has(role)) return res.status(403).json({ error: 'Only managers can edit team members.' });
  const { name, memberRole, accessLevel, site, status, email, phone } = req.body || {};
  try {
    const result = await pool.query(`UPDATE team_members SET name = COALESCE($1, name), role = COALESCE($2, role), access_level = COALESCE($3, access_level), site = COALESCE($4, site), status = COALESCE($5, status), email = COALESCE($6, email), phone = COALESCE($7, phone), updated_at = NOW() WHERE id = $8 RETURNING id, initials, name, role, access_level AS "accessLevel", site, status, email, phone`, [name, memberRole, accessLevel, site, status, email, phone, req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Team member not found.' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: 'Server error' }); });

initDatabase().then(() => app.listen(PORT, () => console.log(`Tactivo local API listening on http://localhost:${PORT}`))).catch((error) => { console.error('Unable to initialize PostgreSQL:', error.message); process.exit(1); });
