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

// ─── CM Sync diagnostics (temporary) ─────────────────────────────────────────
// GET /api/cm-diag  → shows cm_vendors table and DB config status
// POST /api/cm-diag/sync/:po_id  → runs upsertPOToCMDB for a PO and returns result
app.get('/api/cm-diag', async (req, res) => {
  const dbConfigured = !!(process.env.DATABASE_URL || process.env.DB_URL);
  if (!dbConfigured) return res.json({ dbConfigured: false, vendors: [] });
  try {
    const pool = require('./src/db/pool');
    const { rows } = await pool.query('SELECT id, name, zoho_vendor_id, is_contract_manufacturer FROM cm_vendors ORDER BY name');
    res.json({ dbConfigured: true, vendors: rows });
  } catch (err) {
    res.status(500).json({ dbConfigured, error: err.message });
  }
});

app.post('/api/cm-diag/sync/:po_id', async (req, res) => {
  const dbConfigured = !!(process.env.DATABASE_URL || process.env.DB_URL);
  if (!dbConfigured) return res.json({ success: false, reason: 'DATABASE_URL not configured' });
  try {
    const pool   = require('./src/db/pool');
    const zoho   = require('./src/services/zohoBooksService');
    const cmSync = require('./src/services/cmSyncService');

    const detail = await zoho.getPurchaseOrderById(req.params.po_id);
    const po     = detail?.purchaseorder;
    if (!po) return res.status(404).json({ success: false, reason: 'PO not found in Zoho' });

    // Check vendor config BEFORE sync
    const { rows: vendorRows } = await pool.query(
      'SELECT id, name, zoho_vendor_id, is_contract_manufacturer FROM cm_vendors WHERE zoho_vendor_id = $1',
      [po.vendor_id]
    );
    const vendorFound = vendorRows.length > 0;
    const isCM = vendorRows.some(v => v.is_contract_manufacturer);

    // Run sync
    await cmSync.upsertPOToCMDB(po);

    // Check if PO landed in DB
    const { rows: poRows } = await pool.query(
      'SELECT id, po_number, status FROM cm_purchase_orders WHERE zoho_po_id = $1',
      [po.purchaseorder_id]
    );
    // Check line items
    const { rows: liRows } = await pool.query(
      `SELECT li.id FROM cm_po_line_items li
       JOIN cm_purchase_orders p ON p.id = li.po_id
       WHERE p.zoho_po_id = $1`,
      [po.purchaseorder_id]
    );

    res.json({
      po_number:              po.purchaseorder_number,
      zoho_po_id:             po.purchaseorder_id,
      vendor_id_from_zoho:    po.vendor_id,
      vendor_found_in_cm_db:  vendorFound,
      vendor_is_cm:           isCM,
      po_written_to_db:       poRows.length > 0,
      line_items_in_zoho:     (po.line_items || []).length,
      line_items_in_db:       liRows.length,
      cm_vendor_row:          vendorRows[0] || null,
    });
  } catch (err) {
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
