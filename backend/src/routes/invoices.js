const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { v4: uuidv4 } = require('uuid');
const zoho           = require('../services/zohoBooksService');
const whatsapp       = require('../services/whatsappService');
const sessionSvc     = require('../services/whatsappSessionService');
const pdfExtractor   = require('../services/pdfExtractorService');
const invoiceMatcher = require('../services/invoiceMatchingService');
const poAttachments  = require('../data/poAttachments');
const { getWaInvoice, updateWaInvoice, listWaInvoices } = require('../data/waInvoices');
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
  let po = null;
  try {
    const poData = await zoho.getPurchaseOrderById(purchaseorder_id);
    po = poData.purchaseorder;
  } catch (err) {
    console.warn('[InvoiceExtract] PO fetch failed, continuing without match:', err.message);
  }

  // If PO has a linked SO, build invoice payload preview (read-only — no Zoho writes)
  // Date-type custom fields — must send '' (not 'NA') or Zoho rejects with "Invalid date"
  const DATE_CF_LABELS_PREVIEW = new Set(['PO date', 'Shipping Bill Date', 'Ewaybill_Transport Document Date']);

  const SO_CF_LABELS_PREVIEW = [
    'JOPL Sales Order Reference', 'Seller Order Number', 'Biz Segment',
    'Supply Source', 'Incoming Payment', 'E-Commerce', 'Payment mode',
    'Credit Instrument', 'Delivery Method',
  ];
  const FIXED_CFS_PREVIEW = [
    { label: 'Purchase Bill Reference No', value: 'NA' },
    { label: 'Ewaybill_TransportMode',     value: 'Road' },
    { label: 'Ewaybill_Distance',          value: '0' },
    { label: 'Ewaybill_Vehicle Type',      value: '' },
  ];
  const NA_CF_LABELS_PREVIEW = [
    'Shipment reference#', 'Destination', 'Ewaybill_Vehicle Number', 'Motor vehicle no',
    'PO number', 'PO date', 'LC details 1', 'Dispatch through',
    'Bill of lading / LR-RR No', 'Ewaybill_TransporterID', 'Ewaybill_Transporter name',
    'Other References', 'Shipping Bill No', 'Shipping Bill Date', 'Port Code',
    'Dispatch Doc No', 'Ewaybill_Transport Document Number', 'Claiming Refund',
    'Ewaybill_Transport Document Date', 'Additional Currency Code', 'Export duty',
    'Einvoice_PDF_File', 'Ewaybill_Mode of transport',
  ];

  let invoice_preview = null;
  if (po?.reference_number) {
    try {
      const soListData = await zoho.getSalesOrderByNumber(po.reference_number);
      const soSummary  = (soListData.salesorders || [])[0];
      if (soSummary) {
        const soFullData = await zoho.getSalesOrderById(soSummary.salesorder_id);
        const so         = soFullData.salesorder;
        if (so) {
          const soCfMap = new Map((Array.isArray(so.custom_fields) ? so.custom_fields : []).map(cf => [cf.label, cf.value]));
          const custom_fields = [
            ...SO_CF_LABELS_PREVIEW.map(l => ({ label: l, value: soCfMap.get(l) ?? 'NA' })),
            ...FIXED_CFS_PREVIEW,
            ...NA_CF_LABELS_PREVIEW.map(l => ({ label: l, value: DATE_CF_LABELS_PREVIEW.has(l) ? '' : 'NA' })),
          ];
          invoice_preview = {
            customer_id:         so.customer_id,
            customer_name:       so.customer_name,
            salesorder_number:   so.salesorder_number,
            payment_terms_label: so.payment_terms_label,
            line_items: (Array.isArray(so.line_items) ? so.line_items : []).map(li => ({
              name:            li.name,
              item_id:         li.item_id,
              so_line_item_id: li.line_item_id,
              quantity:        li.quantity,
              rate:            li.rate,
              unit:            li.unit,
            })),
            custom_fields,
          };
          console.log(`[Extract] invoice_preview built for SO ${so.salesorder_number} (${custom_fields.length} custom fields)`);
        }
      }
    } catch (err) {
      console.warn('[Extract] invoice_preview skipped:', err.message);
    }
  }

  // Extract text and parse fields from the PDF buffer
  const extraction = await pdfExtractor.extractFromBuffer(req.file.buffer, req.file.originalname);

  // Scanned PDF where OCR failed or is disabled — tell the frontend to use manual entry
  if (extraction.is_scanned && !extraction.ocr_success) {
    return res.json({
      success:         true,
      is_scanned:      true,
      ocr_used:        extraction.ocr_used || false,
      ocr_success:     extraction.ocr_success || false,
      ocr_error:       extraction.extraction_log?.ocr_error,
      message:         'Scanned PDF detected — please use manual entry.',
      header:          null,
      line_items:      [],
      match_results:   [],
      extraction_log:  extraction.extraction_log,
      invoice_preview,
    });
  }

  // Match extracted line items against PO line items
  // Matching disabled temporarily for testing
  const matchResults = [];

  // Log raw text on the server so it appears in Render logs regardless of client environment
  console.log('[Invoice OCR] raw_text for', req.file.originalname, ':\n', extraction.raw_text);
  console.log('[Invoice OCR] header result:', JSON.stringify(extraction.header, null, 2));

  res.json({
    success:        true,
    is_scanned:     extraction.is_scanned || false,
    ocr_used:       extraction.ocr_used || false,
    ocr_success:    extraction.ocr_success || false,
    ocr_error:      extraction.extraction_log?.ocr_error,
    header:         extraction.header,
    line_items:     extraction.line_items,
    match_results:  matchResults,
    extraction_log: extraction.extraction_log,
    raw_text:       extraction.raw_text,   // always include for client-side debugging
    invoice_preview,
  });
});

// ─── GET /api/invoices/whatsapp — WhatsApp-uploaded invoices (admin review) ───
router.get('/whatsapp', async (req, res) => {
  const { status = 'pending_admin_review' } = req.query;
  const records = listWaInvoices({ status: status || undefined });
  res.json({ success: true, invoices: records, count: records.length });
});

// ─── POST /api/invoices/:id/confirm — Post WA invoice to Zoho Books ───────────
router.post('/:id/confirm', async (req, res) => {
  const waInvoice = getWaInvoice(req.params.id);
  if (!waInvoice) {
    return res.status(404).json({ error: true, message: 'WA invoice not found' });
  }

  if (waInvoice.status === 'posted') {
    return res.status(400).json({ error: true, message: 'Invoice already posted to Zoho Books' });
  }

  const extracted = waInvoice.extractedData?.header || {};
  const today     = new Date().toISOString().split('T')[0];

  // Build bill payload from extracted data
  const billPayload = {
    vendor_id:         req.seller.vendor_id,
    date:              extracted.invoice_date || today,
    bill_number:       extracted.invoice_number || `WA-${Date.now()}`,
    purchaseorder_ids: waInvoice.poId ? [waInvoice.poId] : [],
    line_items:        (waInvoice.extractedData?.line_items || []).map(item => ({
      name:        item.description || item.name || 'Line item',
      quantity:    item.quantity || 1,
      rate:        item.unit_price || item.rate || 0,
      account_id:  item.account_id || '',
      item_id:     item.item_id    || '',
    })),
    notes: `Invoice received via WhatsApp. WA record ID: ${waInvoice.id}`,
  };

  const result = await zoho.createBill(billPayload);
  const billId  = result.bill?.bill_id;

  updateWaInvoice(waInvoice.id, { status: 'posted', zohoBillId: billId });

  // Send WhatsApp confirmation to vendor
  if (whatsapp.isConfigured && waInvoice.sellerPhone) {
    whatsapp.sendInvoiceConfirmation({
      to:            `+${waInvoice.sellerPhone}`,
      invoiceNumber: extracted.invoice_number || billPayload.bill_number,
      poNumber:      waInvoice.poNumber,
      amount:        extracted.total_amount || 0,
    }).catch(err => console.warn('[WhatsApp] Invoice confirmation failed:', err.message));
  }

  res.json({ success: true, bill: result.bill, waInvoiceId: waInvoice.id });
});

// ─── POST /api/invoices/:id/request-correction — Ask vendor for corrected invoice
router.post('/:id/request-correction', async (req, res) => {
  const waInvoice = getWaInvoice(req.params.id);
  if (!waInvoice) {
    return res.status(404).json({ error: true, message: 'WA invoice not found' });
  }

  const { note } = req.body;
  if (!note) {
    return res.status(400).json({ error: true, message: 'Correction note is required' });
  }

  // Send WhatsApp message to vendor
  if (whatsapp.isConfigured && waInvoice.sellerPhone) {
    await whatsapp.sendInvoiceCorrectionRequest({
      to:       `+${waInvoice.sellerPhone}`,
      poNumber: waInvoice.poNumber,
      adminNote: note,
    });
  }

  // Revert session to awaiting_invoice so vendor can re-upload
  sessionSvc.updateSession(waInvoice.sellerPhone, { state: 'awaiting_invoice', invoiceId: null });

  updateWaInvoice(waInvoice.id, { status: 'correction_requested', adminNote: note });

  res.json({ success: true, message: 'Correction request sent to vendor' });
});

// ─── GET /api/invoices ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { status, source, page = 1, date_start, date_end, bill_number } = req.query;
  const vendorId = req.seller.vendor_id;

  // If requesting WhatsApp-sourced invoices
  if (source === 'whatsapp') {
    const records = listWaInvoices({
      status:   status   || undefined,
      sellerId: req.seller.id,
    });
    return res.json({ bills: records, whatsapp_source: true });
  }

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

  // Enrich parsedLineItems: fill in item_id + account_id from the matched PO line item.
  // Zoho Books requires account_id (and item_id) to match those on the purchase order.
  // Match strategy: by item_id first, then fall back to positional index.
  if (parsedLineItems && po.line_items?.length) {
    const poByItemId = new Map(
      po.line_items.filter(i => i.item_id).map(i => [i.item_id, i])
    );
    parsedLineItems = parsedLineItems.map((item, idx) => {
      const poItem = (item.item_id && poByItemId.get(item.item_id))
                   || po.line_items[idx]
                   || null;
      return {
        ...item,
        item_id:    item.item_id    || poItem?.item_id    || '',
        account_id: item.account_id || poItem?.account_id || '',
      };
    });
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

  // Parse optional invoice_payload override (user-edited preview from frontend)
  let invoicePayloadOverride = null;
  if (req.body.invoice_payload) {
    try {
      invoicePayloadOverride = JSON.parse(req.body.invoice_payload);
    } catch { /* ignore malformed */ }
  }

  // Log raw body so we can see exactly what multer parsed
  console.log('[Invoice] raw body keys:', Object.keys(req.body));
  console.log('[Invoice] raw date:', JSON.stringify(req.body.date), 'due_date:', JSON.stringify(req.body.due_date));

  // Sanitise dates — treat '', 'undefined', null all as "use today"
  const today    = new Date().toISOString().split('T')[0];
  const safeDate = (v) => (v && v.trim() && v !== 'undefined' && v.trim() !== 'NA') ? v.trim() : null;

  const billPayload = {
    vendor_id:                po.vendor_id,
    date:                     safeDate(date) || today,  // bill / invoice date
    transaction_posting_date: today,                    // Transaction Posting Date (native field)
    ...(safeDate(due_date) && { due_date: safeDate(due_date) }),
    bill_number:       bill_number || '',
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

  // ── Custom field label lists (SO→Invoice mapping) ────────────────────────────
  // Date-type custom fields — must send '' (not 'NA') or Zoho rejects with "Invalid date"
  const DATE_CF_LABELS = new Set(['PO date', 'Shipping Bill Date', 'Ewaybill_Transport Document Date']);

  const SO_CF_LABELS = [
    'JOPL Sales Order Reference', 'Seller Order Number', 'Biz Segment',
    'Supply Source', 'Incoming Payment', 'E-Commerce', 'Payment mode',
    'Credit Instrument', 'Delivery Method',
  ];
  const FIXED_CFS = [
    { label: 'Purchase Bill Reference No', value: bill_number || 'NA' },
    { label: 'Ewaybill_TransportMode',     value: 'Road' },
    { label: 'Ewaybill_Distance',          value: '0' },
    { label: 'Ewaybill_Vehicle Type',      value: '' },
  ];
  const NA_CF_LABELS = [
    'Shipment reference#', 'Destination', 'Ewaybill_Vehicle Number', 'Motor vehicle no',
    'PO number', 'PO date', 'LC details 1', 'Dispatch through',
    'Bill of lading / LR-RR No', 'Ewaybill_TransporterID', 'Ewaybill_Transporter name',
    'Other References', 'Shipping Bill No', 'Shipping Bill Date', 'Port Code',
    'Dispatch Doc No', 'Ewaybill_Transport Document Number', 'Claiming Refund',
    'Ewaybill_Transport Document Date', 'Additional Currency Code', 'Export duty',
    'Einvoice_PDF_File', 'Ewaybill_Mode of transport',
  ];

  // ─── Build invoice payload BEFORE creating the bill ──────────────────────────
  // This way, if the SO lookup fails we return an error without creating any
  // Zoho documents — the user can fix the issue and retry cleanly.
  const refNumber = po.reference_number;
  let invoicePayload = null;

  if (refNumber) {
    // 1. SO lookup
    const soListData = await zoho.getSalesOrderByNumber(refNumber);
    const soSummary  = (soListData.salesorders || [])[0];
    if (!soSummary) {
      return res.status(422).json({ error: true, message: `Sales Order "${refNumber}" not found in Zoho Books. Please verify the PO reference number and try again.` });
    }

    // 2. Fetch full SO details
    const soFullData = await zoho.getSalesOrderById(soSummary.salesorder_id);
    const so = soFullData.salesorder;
    if (!so) {
      return res.status(422).json({ error: true, message: `Could not load Sales Order details for SO ${soSummary.salesorder_id}` });
    }

    console.log(`[AutoInvoice] SO ${so.salesorder_number} (${so.salesorder_id}), customer ${so.customer_id}, ${(so.line_items || []).length} line items`);

    // 3. Build qty lookup from bill line items (item_id → quantity)
    const billQtyMap = new Map(
      (billPayload.line_items || [])
        .filter(b => b.item_id)
        .map(b => [b.item_id, b.quantity])
    );

    // 4. Map SO line items with bill quantities by SKU (or use frontend override)
    let invoiceLineItems;
    if (invoicePayloadOverride?.line_items) {
      // User edited the preview — use their values, but preserve tax fields from SO
      const soLineMap = new Map((Array.isArray(so.line_items) ? so.line_items : []).map(li => [li.item_id, li]));
      invoiceLineItems = invoicePayloadOverride.line_items.map(li => {
        const soLi = soLineMap.get(li.item_id) || {};
        return {
          so_line_item_id: li.so_line_item_id || soLi.line_item_id,
          item_id:         li.item_id,
          name:            li.name,
          quantity:        li.quantity,
          rate:            li.rate,
          unit:            li.unit,
          ...(soLi.account_id              && { account_id:              soLi.account_id }),
          ...(soLi.tax_id                  && { tax_id:                  soLi.tax_id }),
          ...(soLi.tax_exemption_id        && { tax_exemption_id:        soLi.tax_exemption_id }),
          ...(soLi.is_reverse_charge_taxable != null && { is_reverse_charge_taxable: soLi.is_reverse_charge_taxable }),
        };
      });
    } else {
      invoiceLineItems = (Array.isArray(so.line_items) ? so.line_items : []).map(soLi => ({
        so_line_item_id: soLi.line_item_id,   // links to SO line item — inherits tax config
        item_id:         soLi.item_id,
        name:            soLi.name,
        quantity:        billQtyMap.get(soLi.item_id) ?? soLi.quantity,
        rate:            soLi.rate,
        unit:            soLi.unit,
        ...(soLi.account_id              && { account_id:              soLi.account_id }),
        ...(soLi.tax_id                  && { tax_id:                  soLi.tax_id }),
        ...(soLi.tax_exemption_id        && { tax_exemption_id:        soLi.tax_exemption_id }),
        ...(soLi.is_reverse_charge_taxable != null && { is_reverse_charge_taxable: soLi.is_reverse_charge_taxable }),
      }));
    }

    if (invoiceLineItems.length === 0) {
      return res.status(422).json({ error: true, message: `SO "${refNumber}" has no line items — cannot create invoice` });
    }

    // 5. Build custom fields (or use frontend override)
    let invoiceCustomFields;
    if (invoicePayloadOverride?.custom_fields) {
      invoiceCustomFields = invoicePayloadOverride.custom_fields.map(cf => ({ label: cf.label, value: cf.value }));
    } else {
      const soCfMap = new Map((Array.isArray(so.custom_fields) ? so.custom_fields : []).map(cf => [cf.label, cf.value]));
      invoiceCustomFields = [
        ...SO_CF_LABELS.map(l => ({ label: l, value: soCfMap.get(l) ?? 'NA' })),
        ...FIXED_CFS,
        ...NA_CF_LABELS.map(l => ({ label: l, value: DATE_CF_LABELS.has(l) ? '' : 'NA' })),
      ];
    }

    invoicePayload = {
      customer_id:         so.customer_id,
      salesorders:         [{ salesorder_id: so.salesorder_id }],
      date:                billPayload.date,
      payment_terms:       so.payment_terms,
      payment_terms_label: so.payment_terms_label,
      line_items:          invoiceLineItems,
      notes:               billPayload.notes,
      custom_fields:       invoiceCustomFields,
    };

    console.log('[AutoInvoice] invoicePayload →', JSON.stringify(invoicePayload, null, 2));
  } else {
    console.log(`[AutoInvoice] Skipped — PO ${purchaseorder_id} has no reference_number (no linked SO)`);
  }

  // ─── Create bill ─────────────────────────────────────────────────────────────
  console.log('[Invoice] billPayload →', JSON.stringify(billPayload, null, 2));
  const result = await zoho.createBill(billPayload);
  const createdBillId = result.bill?.bill_id;

  // fire-and-forget: store PO reference as custom field on the bill
  if (createdBillId && purchaseorder_id) {
    zoho.updateBillCustomField(createdBillId, purchaseorder_id)
      .catch(err => console.warn('[Invoice] Failed to set PO custom field:', err.message));
  }

  // fire-and-forget: submit bill (draft → open) and optionally approve
  if (createdBillId) {
    zoho.submitBill(createdBillId)
      .then(() => zoho.approveBill(createdBillId)
        .catch(err => console.warn('[Invoice] Bill approve skipped (no approval workflow?):', err.message)))
      .catch(err => console.warn('[Invoice] Bill submit failed:', err.message));
  }

  // fire-and-forget: WhatsApp confirmation
  if (whatsapp.isConfigured && req.seller.whatsapp_enabled && req.seller.whatsapp_number) {
    whatsapp.sendInvoiceConfirmation({
      to:            req.seller.whatsapp_number,
      invoiceNumber: bill_number || billPayload.bill_number,
      poNumber:      po.purchaseorder_number,
      amount:        po.total,
      currency:      po.currency_code,
    }).catch(err => console.warn('[WhatsApp] Invoice confirmation failed:', err.message));
  }

  // save bill attachment (for PO detail download link)
  if (req.file) {
    poAttachments.setBillAttachment(purchaseorder_id, {
      filename:     req.file.filename,
      originalName: req.file.originalname,
      size:         req.file.size,
      uploadedAt:   new Date().toISOString(),
    });
  }

  // ─── Create invoice (atomic — rollback bill on failure) ──────────────────────
  if (invoicePayload) {
    let createdInvId = null;
    try {
      // Create invoice (draft)
      const invResult = await zoho.createInvoice(invoicePayload);
      const inv = invResult.invoice;
      if (!inv?.invoice_id) throw new Error('createInvoice returned no invoice object');
      createdInvId = inv.invoice_id;

      // Submit (draft → open / pending_approval)
      await zoho.submitInvoice(inv.invoice_id);

      // Approve — optional; skip if org has no approval workflow
      try {
        await zoho.approveInvoice(inv.invoice_id);
      } catch (approveErr) {
        console.warn(`[AutoInvoice] approveInvoice skipped for ${inv.invoice_id}:`, approveErr.message);
      }

      // Mark as sent
      await zoho.markInvoiceSent(inv.invoice_id);

      // Fetch PDF and persist
      const pdfBuf  = await zoho.getInvoicePdf(inv.invoice_id);
      const pdfName = `zoho_inv_${inv.invoice_id}.pdf`;
      fs.writeFileSync(path.join(process.env.UPLOAD_DIR || './uploads', pdfName), pdfBuf);
      poAttachments.setInvoiceAttachment(purchaseorder_id, {
        filename:      pdfName,
        invoiceId:     inv.invoice_id,
        invoiceNumber: inv.invoice_number,
        size:          pdfBuf.length,
        createdAt:     new Date().toISOString(),
      });
      console.log(`[AutoInvoice] ✓ Created ${inv.invoice_number} for PO ${purchaseorder_id} (SO ${refNumber})`);
    } catch (err) {
      console.error(`[AutoInvoice] FAILED poId=${purchaseorder_id} so=${refNumber}:`, err.message);
      // Rollback: delete the bill so the user can retry without a duplicate
      if (createdBillId) {
        zoho.deleteBill(createdBillId)
          .catch(delErr => console.warn('[AutoInvoice] Bill rollback (delete) failed:', delErr.message));
      }
      return res.status(422).json({
        error:   true,
        message: `Invoice could not be created against SO "${refNumber}": ${err.message}. The purchase bill has been rolled back — please fix the issue and try again.`,
      });
    }
  }

  res.status(201).json({
    success: true,
    message: 'Invoice posted to Zoho Books successfully',
    bill:    result.bill,
    file:    req.file ? { filename: req.file.filename, size: req.file.size } : null,
  });
});

module.exports = router;
