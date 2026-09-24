const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DB_DIR = path.join(ROOT_DIR, 'data');
const DB_PATH = path.join(DB_DIR, 'app.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Erro ao abrir banco de dados:', err.message);
    process.exit(1);
  }
  console.log('Banco SQLite conectado em:', DB_PATH);
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE,
      value TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      score INTEGER,
      level TEXT,
      answers TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE,
      smoked_today INTEGER,
      message TEXT,
      tips TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR));

app.get('/api/health', (_, res) => {
  res.json({ ok: true, status: 'online' });
});

app.get('/api/settings', (_, res) => {
  db.all('SELECT key, value FROM settings', (err, rows) => {
    if (err) {
      res.status(500).json({ error: 'Erro ao buscar configurações.' });
      return;
    }
    const settings = {};
    rows.forEach((row) => {
      settings[row.key] = row.value;
    });
    res.json(settings);
  });
});

app.post('/api/settings', (req, res) => {
  const { key, value } = req.body;
  if (!key || value === undefined) {
    return res.status(400).json({ error: 'Parâmetros key e value são obrigatórios.' });
  }

  db.run(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, String(value)],
    function (err) {
      if (err) {
        res.status(500).json({ error: 'Erro ao salvar configuração.' });
        return;
      }
      res.json({ ok: true, updated: key, value: String(value) });
    }
  );
});

app.post('/api/assessment', (req, res) => {
  const { score, level, answers } = req.body;

  if (score === undefined || !level) {
    return res.status(400).json({ error: 'Dados da avaliação incompletos.' });
  }

  db.run(
    'INSERT INTO assessments (score, level, answers) VALUES (?, ?, ?)',
    [Number(score), level, JSON.stringify(answers || {})],
    function (err) {
      if (err) {
        res.status(500).json({ error: 'Erro ao salvar avaliação.' });
        return;
      }
      res.json({ ok: true, id: this.lastID, level, score });
    }
  );
});

app.get('/api/assessment', (_, res) => {
  db.all('SELECT id, created_at, score, level, answers FROM assessments ORDER BY created_at DESC LIMIT 10', (err, rows) => {
    if (err) {
      res.status(500).json({ error: 'Erro ao consultar avaliações.' });
      return;
    }

    res.json(
      rows.map((row) => ({
        ...row,
        answers: JSON.parse(row.answers || '{}')
      }))
    );
  });
});

app.post('/api/checkin', (req, res) => {
  const { date, smokedToday, message, tips } = req.body;

  if (!date) {
    return res.status(400).json({ error: 'Data é obrigatória.' });
  }

  db.run(
    `INSERT INTO checkins (date, smoked_today, message, tips) VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET smoked_today = excluded.smoked_today, message = excluded.message, tips = excluded.tips`,
    [date, smokedToday ? 1 : 0, message || '', tips || ''],
    function (err) {
      if (err) {
        res.status(500).json({ error: 'Erro ao salvar check-in.' });
        return;
      }
      res.json({ ok: true, date, smokedToday: !!smokedToday, message, tips });
    }
  );
});

app.get('/api/checkins', (_, res) => {
  db.all('SELECT id, date, smoked_today, message, tips FROM checkins ORDER BY date ASC', (err, rows) => {
    if (err) {
      res.status(500).json({ error: 'Erro ao consultar check-ins.' });
      return;
    }
    res.json(rows);
  });
});

app.get('*', (_, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
