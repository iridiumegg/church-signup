const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const db = new Database('signups.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS signups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    bringing_meal INTEGER DEFAULT 0,
    meal_description TEXT,
    bringing_sides INTEGER DEFAULT 0,
    sides_description TEXT,
    bringing_drink INTEGER DEFAULT 0,
    drink_description TEXT,
    cleaning_up INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/signups', (req, res) => {
  const rows = db.prepare('SELECT * FROM signups ORDER BY created_at ASC').all();
  res.json(rows);
});

app.post('/api/signups', (req, res) => {
  const { name, bringing_meal, meal_description, bringing_sides, sides_description, bringing_drink, drink_description, cleaning_up } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

  const stmt = db.prepare(`
    INSERT INTO signups (name, bringing_meal, meal_description, bringing_sides, sides_description, bringing_drink, drink_description, cleaning_up)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    name.trim(),
    bringing_meal ? 1 : 0,
    meal_description || '',
    bringing_sides ? 1 : 0,
    sides_description || '',
    bringing_drink ? 1 : 0,
    drink_description || '',
    cleaning_up ? 1 : 0
  );
  const newRow = db.prepare('SELECT * FROM signups WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(newRow);
});

app.delete('/api/signups/:id', (req, res) => {
  db.prepare('DELETE FROM signups WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
