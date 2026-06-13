const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// PostgreSQL connection — picks up env vars injected by Kubernetes secrets
const pool = new Pool({
  host:     process.env.DB_HOST     || 'postgres-service',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'taskflow',
  user:     process.env.DB_USER     || 'taskflow',
  password: process.env.DB_PASSWORD || 'changeme',
  max: 10,
  connectionTimeoutMillis: 5000,
});

// Init DB schema on startup
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id        SERIAL PRIMARY KEY,
        title     TEXT NOT NULL,
        status    TEXT DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
        priority  TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // Seed data if empty
    const { rows } = await pool.query('SELECT COUNT(*) FROM tasks');
    if (parseInt(rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO tasks (title, status, priority) VALUES
          ('Set up Kubernetes cluster', 'done', 'high'),
          ('Deploy ArgoCD', 'done', 'high'),
          ('Configure GitOps pipeline', 'in_progress', 'high'),
          ('Set up monitoring with Prometheus', 'todo', 'medium'),
          ('Write infrastructure documentation', 'todo', 'low');
      `);
    }
    console.log('✅ DB initialized');
  } catch (err) {
    console.error('DB init error:', err.message);
  }
}

initDB();

// ── Health check — used by K8s liveness/readiness probes ──────
app.get('/health', async (req, res) => {
  let dbStatus = 'healthy';
  try {
    await pool.query('SELECT 1');
  } catch {
    dbStatus = 'unhealthy';
  }

  const status = dbStatus === 'healthy' ? 200 : 503;
  res.status(status).json({
    api:         'healthy',
    database:    dbStatus,
    environment: process.env.NODE_ENV || 'development',
    version:     process.env.APP_VERSION || '1.0.0',
    timestamp:   new Date().toISOString(),
  });
});

// ── Tasks API ──────────────────────────────────────────────────
app.get('/api/tasks', async (req, res) => {
  try {
    const { status, priority } = req.query;
    let query = 'SELECT * FROM tasks';
    const params = [];
    const conditions = [];
    if (status)   { params.push(status);   conditions.push(`status = $${params.length}`); }
    if (priority) { params.push(priority); conditions.push(`priority = $${params.length}`); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY created_at DESC';

    const { rows } = await pool.query(query, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const { title, priority = 'medium' } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'title is required' });
    const { rows } = await pool.query(
      'INSERT INTO tasks (title, priority) VALUES ($1, $2) RETURNING *',
      [title, priority]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/tasks/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const { rows } = await pool.query(
      'UPDATE tasks SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(port, () => {
  console.log(`API running on port ${port} [${process.env.NODE_ENV || 'development'}]`);
});

module.exports = app;
