require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

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
app.use('/api/invoices',        require('./src/routes/invoices'));
app.use('/api/payments',        require('./src/routes/payments'));
app.use('/api/whatsapp',        require('./src/routes/whatsapp'));
app.use('/api/zoho',            require('./src/routes/zoho'));
app.use('/api/admin',           require('./src/routes/adminNotifications'));

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

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
  console.log(`   WhatsApp    : ${process.env.WHATSAPP_PHONE_NUMBER_ID ? 'configured' : 'NOT configured'}\n`);

  // Start proactive Zoho token refresh scheduler
  const zohoService = require('./src/services/zohoBooksService');
  zohoService.startTokenRefreshScheduler();
});

module.exports = app;
