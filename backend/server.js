require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// ─── PostgreSQL migrations (CM Inventory) ─────────────────────────────────────
// Only runs if DATABASE_URL / DB_URL is configured.
if (process.env.DATABASE_URL || process.env.DB_URL) {
  const runMigrations = require('./src/db/migrate');
  runMigrations()
    .then(() => console.log('   CM Migrations: up to date'))
    .catch(err => console.error('[DB] Migration failed:', err.message));
}

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure uploads directory exists
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.resolve(uploadDir)));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',            require('./src/routes/auth'));
app.use('/api/purchase-orders', require('./src/routes/purchaseOrders'));
app.use('/api/dispatch',        require('./src/routes/dispatch'));
app.use('/api/invoices',        require('./src/routes/invoices'));
app.use('/api/payments',        require('./src/routes/payments'));
app.use('/api/whatsapp',        require('./src/routes/whatsapp'));
app.use('/api/zoho',            require('./src/routes/zoho'));
app.use('/api/admin',           require('./src/routes/adminNotifications'));

// ─── CM Inventory routes ──────────────────────────────────────────────────────
app.use('/api/config',      require('./src/routes/config'));
app.use('/api/inventory',   require('./src/routes/inventory'));
app.use('/api/production',  require('./src/routes/production'));
app.use('/api/bills',       require('./src/routes/bills'));

app.get('/health',     (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/api/health', (req, res) => res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } }));

// ─── DB diagnostic (public — no auth, safe — shows no credentials) ────────────
app.get('/api/db-status', async (req, res) => {
  const connStr = process.env.DATABASE_URL || process.env.DB_URL || '';
  const configured = !!connStr;
  const looksValid = connStr.startsWith('postgresql://') || connStr.startsWith('postgres://');

  if (!configured) {
    return res.json({ success: false, configured: false, error: 'DATABASE_URL not set in environment' });
  }
  if (!looksValid) {
    return res.json({
      success: false,
      configured: true,
      looksValid: false,
      hint: 'DATABASE_URL does not start with postgresql:// — it may be set to the Neon console URL instead of the connection string',
      prefix: connStr.slice(0, 30) + '...',
    });
  }

  // Try a live connection
  try {
    const pool = require('./src/db/pool');
    const { rows } = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE 'cm_%'
      ORDER BY table_name
    `);
    return res.json({
      success: true,
      configured: true,
      looksValid: true,
      connected: true,
      cm_tables: rows.map(r => r.table_name),
    });
  } catch (err) {
    return res.json({
      success: false,
      configured: true,
      looksValid: true,
      connected: false,
      error: err.message,
    });
  }
});

// ─── Manual migration trigger (public for now — remove after setup) ───────────
app.post('/api/db-migrate', async (req, res) => {
  const connStr = process.env.DATABASE_URL || process.env.DB_URL || '';
  if (!connStr) return res.status(400).json({ success: false, error: 'DATABASE_URL not set' });
  try {
    const runMigrations = require('./src/db/migrate');
    await runMigrations();
    res.json({ success: true, message: 'Migrations complete' });
  } catch (err) {
    console.error('[DB] Manual migration error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message, err.stack);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: true,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀  JODL Seller Portal backend running on http://localhost:${PORT}`);
  console.log(`   Zoho Org ID : ${process.env.ZOHO_ORG_ID || '60032173740'}`);
  console.log(`   Zoho API    : ${process.env.ZOHO_API_BASE || 'https://sandbox.zohoapis.com/books/v3'}`);
  console.log(`   WhatsApp    : ${process.env.WHATSAPP_PHONE_NUMBER_ID ? 'configured' : 'NOT configured'}`);
  console.log(`   DB (CM Inv) : ${process.env.DATABASE_URL || process.env.DB_URL ? 'configured' : 'NOT configured'}\n`);

  // Start proactive Zoho token refresh scheduler
  const zohoService = require('./src/services/zohoBooksService');
  zohoService.startTokenRefreshScheduler();
});

module.exports = app;
