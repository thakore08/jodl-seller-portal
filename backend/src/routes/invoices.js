const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const { v4: uuidv4 } = require('uuid');
const zoho           = require('../services/zohoBooksService');
const whatsapp       = require('../services/whatsappService');
const pdfExtractor   = require('../services/pdfExtractorService');
const invoiceMatcher = require('../services/invoiceMatchingService');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// All invoice routes: authentication + finance/admin only
router.use(authenticate);
router.use(requireRole('seller_admin', 'finance_user'));

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

// ─── Multer: memory storage for /extract endpoint (no disk write) ─────────────
const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, path.extname(file.originalname).toLowerCase() === '.pdf');
  },
});

// ─── POST /api/invoices/extract ───────────────────────────────────────────────
// Extracts invoice data from a PDF and matches line items against a PO.
// Body (multipart/form-data): file (PDF) + purchaseorder_id
router.post('/extract', memUpload.single('file'), async (req, res) => {
  const { purchaseorder_id } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: true, message: 'PDF file is required' });
  }
  if (!purchaseorder_id) {
    return res.status(400).json({ error: true, message: 'purchaseorder_id is required' });
  }

  // Fetch PO to get its line items for matching
  let po;
  try {
    const poData = await zoho.getPurchaseOrderById(purchaseorder_id);
    po = poData.purchaseorder;
  } catch {
    return res.status(404).json({ error: true, message: 'Purchase order not found in Zoho Books' });
  }

  // Extract text and parse fields from the PDF buffer
  const extraction = await pdfExtractor.extractFromBuffer(req.file.buffer, req.file.originalname);

  // Scanned PDF — tell the frontend to fall back to manual entry
  if (extraction.is_scanned) {
    return res.json({
      success:         true,
      is_scanned:      true,
      message:         'Scanned PDF detected — please use manual entry.',
      header:          null,
      line_items:      [],
      match_results:   [],
      extraction_log:  extraction.extraction_log,
    });
  }

  // Match extracted line items against PO line items
  const matchResults = invoiceMatcher.matchLineItems(
    extraction.line_items,
    po.line_items || []
  );

  res.json({
    success:        true,
    is_scanned:     false,
    header:         extraction.header,
    line_items:     extraction.line_items,
    match_results:  matchResults,
    extraction_log: extraction.extraction_log,
  });
});

// ─── GET /api/invoices ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { status, page = 1, date_start, date_end, bill_number } = req.query;
  const vendorId = req.seller.vendor_id;

  const params = { page };
  if (status)      params.status      = status;
  if (vendorId)    params.vendor_id   = vendorId;
  if (date_start)  params.date_start  = date_start;
  if (date_end)    params.date_end    = date_end;
  if (bill_number) params.bill_number = bill_number;

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
//
// Body (multipart/form-data):
//   purchaseorder_id  - required
//   bill_number       - seller's invoice number
//   date              - invoice date (YYYY-MM-DD)
//   due_date          - due date (YYYY-MM-DD, optional)
//   line_items        - JSON array of line items
//   tax_lines         - JSON array [{ tax_name, tax_percentage, tax_amount }] for IGST/CGST/SGST
//   notes             - optional
//   file              - optional invoice PDF/image
router.post('/', upload.single('file'), async (req, res) => {
  const {
    purchaseorder_id,
    bill_number,
    date,
    due_date,
    line_items,
    tax_lines,
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

  // Parse tax_lines (IGST / CGST / SGST breakdown)
  let parsedTaxLines = [];
  if (tax_lines) {
    try {
      parsedTaxLines = typeof tax_lines === 'string' ? JSON.parse(tax_lines) : tax_lines;
    } catch {
      return res.status(400).json({ error: true, message: 'Invalid tax_lines format. Must be JSON array.' });
    }
  }

  // Sanitise dates — treat '', 'undefined', null all as "use today"
  const today    = new Date().toISOString().split('T')[0];
  const safeDate = (v) => (v && v.trim() && v !== 'undefined') ? v.trim() : null;

  const billPayload = {
    vendor_id:         po.vendor_id,
    date:              safeDate(date) || today,
    ...(safeDate(due_date) && { due_date: safeDate(due_date) }),
    bill_number:       bill_number || `INV-${Date.now()}`,
    purchaseorder_ids: [purchaseorder_id],
    line_items:        parsedLineItems || po.line_items?.map(item => ({
      item_id:     item.item_id,
      name:        item.name,
      description: item.description,
      rate:        item.rate,
      quantity:    item.quantity,
      account_id:  item.account_id,
    })) || [],
    notes,
    // Tax lines (IGST, CGST, SGST) mapped to Zoho's taxes structure
    ...(parsedTaxLines.length > 0 && {
      taxes: parsedTaxLines.map(t => ({
        tax_name:       t.tax_name       || t.name       || '',
        tax_percentage: t.tax_percentage || t.percentage || 0,
        tax_amount:     t.tax_amount     || t.amount     || 0,
      })),
    }),
    ...(req.file && { attachment_name: req.file.filename }),
  };

  console.log('[Invoice] billPayload →', JSON.stringify(billPayload, null, 2));
  const result = await zoho.createBill(billPayload);
  const createdBillId = result.bill?.bill_id;

  // Store PO reference as custom field on the created bill (fire-and-forget)
  if (createdBillId && purchaseorder_id) {
    zoho.updateBillCustomField(createdBillId, purchaseorder_id)
      .catch(err => console.warn('[Invoice] Failed to set PO custom field:', err.message));
  }

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
