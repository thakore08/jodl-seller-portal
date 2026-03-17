const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const { v4: uuidv4 } = require('uuid');
const zoho     = require('../services/zohoBooksService');
const whatsapp = require('../services/whatsappService');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(authenticate);

// ─── Multer for invoice PDF upload ───────────────────────────────────────────
const storage = multer.diskStorage({
  destination: process.env.UPLOAD_DIR || './uploads',
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `invoice_${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

// ─── GET /api/invoices ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { status, page = 1 } = req.query;
  const vendorId = req.seller.vendor_id;

  const params = { page };
  if (status)   params.status    = status;
  if (vendorId) params.vendor_id = vendorId;

  const data = await zoho.getBills(params);
  res.json(data);
});

// ─── GET /api/invoices/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const data = await zoho.getBillById(req.params.id);
  res.json(data);
});

// ─── POST /api/invoices ───────────────────────────────────────────────────────
// Create a bill in Zoho Books against a Purchase Order.
// Body (multipart/form-data or JSON):
//   purchaseorder_id   - required
//   bill_number        - seller's invoice number
//   date               - invoice date (YYYY-MM-DD)
//   due_date           - due date (YYYY-MM-DD)
//   line_items         - JSON array of line items
//   notes              - optional
//   file               - optional invoice PDF/image
router.post('/', upload.single('file'), async (req, res) => {
  const {
    purchaseorder_id,
    bill_number,
    date,
    due_date,
    line_items,
    notes = '',
  } = req.body;

  if (!purchaseorder_id) {
    return res.status(400).json({ error: true, message: 'purchaseorder_id is required' });
  }

  // Fetch PO to get vendor_id
  let po;
  try {
    const poData = await zoho.getPurchaseOrderById(purchaseorder_id);
    po = poData.purchaseorder;
  } catch {
    return res.status(404).json({ error: true, message: 'Purchase order not found in Zoho Books' });
  }

  // Parse line_items (may arrive as JSON string from multipart)
  let parsedLineItems;
  try {
    parsedLineItems = typeof line_items === 'string' ? JSON.parse(line_items) : line_items;
  } catch {
    return res.status(400).json({ error: true, message: 'Invalid line_items format. Must be JSON array.' });
  }

  const billPayload = {
    vendor_id:         po.vendor_id,
    date:              date || new Date().toISOString().split('T')[0],
    due_date:          due_date || '',
    bill_number:       bill_number || `INV-${Date.now()}`,
    purchaseorder_ids: [{ purchaseorder_id }],
    line_items:        parsedLineItems || po.line_items?.map(item => ({
      item_id:     item.item_id,
      name:        item.name,
      description: item.description,
      rate:        item.rate,
      quantity:    item.quantity,
      account_id:  item.account_id,
    })) || [],
    notes,
    ...(req.file && { attachment_name: req.file.filename }),
  };

  const result = await zoho.createBill(billPayload);

  // Send WhatsApp confirmation (non-blocking)
  if (whatsapp.isConfigured && req.seller.whatsapp_enabled && req.seller.whatsapp_number) {
    whatsapp.sendInvoiceConfirmation({
      to:            req.seller.whatsapp_number,
      invoiceNumber: bill_number || billPayload.bill_number,
      poNumber:      po.purchaseorder_number,
      amount:        po.total,
      currency:      po.currency_code,
    }).catch(err => console.warn('[WhatsApp] Invoice confirmation failed:', err.message));
  }

  res.status(201).json({
    success: true,
    message: 'Invoice posted to Zoho Books successfully',
    bill: result.bill,
    file: req.file ? { filename: req.file.filename, size: req.file.size } : null,
  });
});

module.exports = router;
