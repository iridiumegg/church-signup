const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'parish';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'signups.db');

// Create the directory if it doesn't exist (e.g. /data before a volume is mounted)
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    event_date     TEXT,
    meal_target      INTEGER DEFAULT 0,
    sides_target     INTEGER DEFAULT 0,
    dessert_target   INTEGER DEFAULT 0,
    drink_target     INTEGER DEFAULT 0,
    cleanup_target   INTEGER DEFAULT 0,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS signups (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id          INTEGER,
    name              TEXT NOT NULL,
    bringing_meal     INTEGER DEFAULT 0,
    meal_description  TEXT DEFAULT '',
    bringing_sides      INTEGER DEFAULT 0,
    sides_description   TEXT DEFAULT '',
    bringing_dessert    INTEGER DEFAULT 0,
    dessert_description TEXT DEFAULT '',
    bringing_drink      INTEGER DEFAULT 0,
    drink_description   TEXT DEFAULT '',
    cleaning_up       INTEGER DEFAULT 0,
    edit_token        TEXT DEFAULT '',
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id)
  );
`);

// Safe migrations for existing databases
try { db.exec('ALTER TABLE signups ADD COLUMN event_id INTEGER'); } catch {}
try { db.exec('ALTER TABLE events ADD COLUMN dessert_target INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE signups ADD COLUMN bringing_dessert INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE signups ADD COLUMN dessert_description TEXT DEFAULT \'\''); } catch {}
try { db.exec('ALTER TABLE signups ADD COLUMN edit_token TEXT DEFAULT \'\''); } catch {}

// Seed the Potluck Meal event on first run
const { evCount } = db.prepare('SELECT COUNT(*) as evCount FROM events').get();
if (evCount === 0) {
  const r = db.prepare(`
    INSERT INTO events (name, meal_target, sides_target, dessert_target, drink_target, cleanup_target)
    VALUES ('Potluck Meal', 6, 6, 4, 2, 6)
  `).run();
  db.prepare('UPDATE signups SET event_id = ? WHERE event_id IS NULL').run(r.lastInsertRowid);
}

function requireAdmin(req, res, next) {
  if (req.headers['x-admin-password'] !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin password' });
  }
  next();
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Admin verify (client calls this to confirm password before storing)
app.post('/api/admin/verify', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) res.json({ ok: true });
  else res.status(401).json({ error: 'Incorrect password' });
});

// ── Events ──
app.get('/api/events', (req, res) => {
  res.json(db.prepare('SELECT * FROM events ORDER BY created_at ASC').all());
});

app.post('/api/events', requireAdmin, (req, res) => {
  const { name, event_date, meal_target, sides_target, dessert_target, drink_target, cleanup_target } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Event name is required' });
  const r = db.prepare(`
    INSERT INTO events (name, event_date, meal_target, sides_target, dessert_target, drink_target, cleanup_target)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name.trim(), event_date || null, +meal_target || 0, +sides_target || 0, +dessert_target || 0, +drink_target || 0, +cleanup_target || 0);
  res.status(201).json(db.prepare('SELECT * FROM events WHERE id = ?').get(r.lastInsertRowid));
});

app.put('/api/events/:id', requireAdmin, (req, res) => {
  const { name, event_date, meal_target, sides_target, dessert_target, drink_target, cleanup_target } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Event name is required' });
  db.prepare(`
    UPDATE events SET name=?, event_date=?, meal_target=?, sides_target=?, dessert_target=?, drink_target=?, cleanup_target=? WHERE id=?
  `).run(name.trim(), event_date || null, +meal_target || 0, +sides_target || 0, +dessert_target || 0, +drink_target || 0, +cleanup_target || 0, req.params.id);
  res.json(db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id));
});

app.delete('/api/events/:id', requireAdmin, (req, res) => {
  const { cnt } = db.prepare('SELECT COUNT(*) as cnt FROM signups WHERE event_id = ?').get(req.params.id);
  if (cnt > 0) return res.status(400).json({ error: `Cannot delete — ${cnt} sign-up(s) exist. Remove all sign-ups first.` });
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Signups ──
app.get('/api/events/:eventId/signups', (req, res) => {
  res.json(db.prepare('SELECT * FROM signups WHERE event_id = ? ORDER BY created_at ASC').all(req.params.eventId));
});

app.post('/api/events/:eventId/signups', (req, res) => {
  const { name, bringing_meal, meal_description, bringing_sides, sides_description, bringing_dessert, dessert_description, bringing_drink, drink_description, cleaning_up } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const editToken = crypto.randomBytes(16).toString('hex');
  const r = db.prepare(`
    INSERT INTO signups (event_id, name, bringing_meal, meal_description, bringing_sides, sides_description, bringing_dessert, dessert_description, bringing_drink, drink_description, cleaning_up, edit_token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.params.eventId, name.trim(),
    bringing_meal ? 1 : 0, meal_description || '',
    bringing_sides ? 1 : 0, sides_description || '',
    bringing_dessert ? 1 : 0, dessert_description || '',
    bringing_drink ? 1 : 0, drink_description || '',
    cleaning_up ? 1 : 0, editToken
  );
  const row = db.prepare('SELECT * FROM signups WHERE id = ?').get(r.lastInsertRowid);
  res.status(201).json({ ...row, edit_token: editToken });
});

app.put('/api/signups/:id', (req, res) => {
  const { name, bringing_meal, meal_description, bringing_sides, sides_description, bringing_dessert, dessert_description, bringing_drink, drink_description, cleaning_up } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const existing = db.prepare('SELECT * FROM signups WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Sign-up not found' });

  const isAdmin = req.headers['x-admin-password'] === ADMIN_PASSWORD;
  const tokenMatch = existing.edit_token && req.headers['x-edit-token'] === existing.edit_token;
  if (!isAdmin && !tokenMatch) {
    return res.status(403).json({ error: 'You can only edit your own sign-up' });
  }

  db.prepare(`
    UPDATE signups SET name=?, bringing_meal=?, meal_description=?, bringing_sides=?, sides_description=?, bringing_dessert=?, dessert_description=?, bringing_drink=?, drink_description=?, cleaning_up=? WHERE id=?
  `).run(
    name.trim(),
    bringing_meal ? 1 : 0, meal_description || '',
    bringing_sides ? 1 : 0, sides_description || '',
    bringing_dessert ? 1 : 0, dessert_description || '',
    bringing_drink ? 1 : 0, drink_description || '',
    cleaning_up ? 1 : 0,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM signups WHERE id = ?').get(req.params.id));
});

app.delete('/api/signups/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM signups WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
