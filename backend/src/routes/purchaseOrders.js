const express  = require('express');
const zoho     = require('../services/zohoBooksService');
const whatsapp = require('../services/whatsappService');
const { sellers } = require('../data/sellers');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * In-memory local status store.
 * Zoho Books' PO status model is fixed (draft/open/billed/cancelled).
 * We augment it with two additional statuses: in_production and dispatched.
 * Key: Zoho PO ID  →  Value: 'in_production' | 'dispatched'
 */
const poLocalStatus = new Map();

/**
 * In-memory per-line-item delivery dates, set at acceptance time.
 * Key: Zoho PO ID  →  Value: [{ item_id, name, expected_date }]
 */
const poLineDeliveryDates = new Map();

// Helper: inject local_status + line_delivery_dates into a single PO object
function mergeLocalStatus(po) {
  if (!po) return po;
  const id = po.purchaseorder_id;
  const result = { ...po };
  if (id && poLocalStatus.has(id)) {
    result.local_status = poLocalStatus.get(id);
  }
  if (id && poLineDeliveryDates.has(id)) {
    result.line_delivery_dates = poLineDeliveryDates.get(id);
  }
  return result;
}

// ─── GET /api/purchase-orders ─────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { status, page = 1, per_page = 25 } = req.query;
  const vendorId = req.seller.vendor_id;

  const params = { page, per_page };
  if (status)   params.status    = status;
  if (vendorId) params.vendor_id = vendorId;

  const data = await zoho.getPurchaseOrders(params);

  // Merge local_status into each PO in the list
  if (data.purchaseorders) {
    data.purchaseorders = data.purchaseorders.map(mergeLocalStatus);
  }

  res.json(data);
});

// ─── GET /api/purchase-orders/stats ──────────────────────────────────────────
router.get('/stats', async (req, res) => {
  const stats = await zoho.getPOStats(req.seller.vendor_id || null);
  res.json(stats);
});

// ─── GET /api/purchase-orders/:id ────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const data = await zoho.getPurchaseOrderById(req.params.id);
  // Merge local status into detail response
  if (data.purchaseorder) {
    data.purchaseorder = mergeLocalStatus(data.purchaseorder);
  }
  res.json(data);
});

// ─── POST /api/purchase-orders/:id/accept ────────────────────────────────────
// Body (JSON): { line_item_delivery_dates: [{ item_id, name, expected_date }] }
router.post('/:id/accept', requireRole('seller_admin', 'operations_user'), async (req, res) => {
  const { id } = req.params;
  const { line_item_delivery_dates } = req.body;

  // Store per-line-item delivery dates (if provided)
  if (Array.isArray(line_item_delivery_dates) && line_item_delivery_dates.length > 0) {
    poLineDeliveryDates.set(id, line_item_delivery_dates);
  }

  const data = await zoho.acceptPurchaseOrder(id);

  // Merge stored dates into the response
  if (data.purchaseorder) {
    data.purchaseorder = mergeLocalStatus(data.purchaseorder);
  }

  // Send WhatsApp confirmation (non-blocking)
  if (whatsapp.isConfigured && req.seller.whatsapp_enabled && req.seller.whatsapp_number) {
    const po = data.purchaseorder || {};
    whatsapp.sendPOStatusUpdate({
      to:       req.seller.whatsapp_number,
      poNumber: po.purchaseorder_number || id,
      status:   'accepted',
    }).catch(err => console.warn('[WhatsApp] Accept notification failed:', err.message));
  }

  res.json({ success: true, message: 'Purchase order accepted', ...data });
});

// ─── POST /api/purchase-orders/:id/reject ────────────────────────────────────
router.post('/:id/reject', requireRole('seller_admin', 'operations_user'), async (req, res) => {
  const { id } = req.params;
  const { reason = '' } = req.body;

  const data = await zoho.rejectPurchaseOrder(id, reason);

  if (whatsapp.isConfigured && req.seller.whatsapp_enabled && req.seller.whatsapp_number) {
    const po = data.purchaseorder || {};
    whatsapp.sendPOStatusUpdate({
      to:       req.seller.whatsapp_number,
      poNumber: po.purchaseorder_number || id,
      status:   'rejected',
      reason,
    }).catch(err => console.warn('[WhatsApp] Reject notification failed:', err.message));
  }

  res.json({ success: true, message: 'Purchase order rejected', ...data });
});

// ─── POST /api/purchase-orders/:id/mark-in-production ────────────────────────
// Marks a PO as "In Production" (local status — Zoho does not model this)
router.post(
  '/:id/mark-in-production',
  requireRole('seller_admin', 'operations_user'),
  async (req, res) => {
    const { id } = req.params;

    // Verify PO exists in Zoho before setting local status
    const poData = await zoho.getPurchaseOrderById(id);
    const po     = poData.purchaseorder;

    if (po.status !== 'open') {
      return res.status(400).json({
        error:   true,
        message: `Cannot mark as In Production — PO status is '${po.status}' (must be 'open')`,
      });
    }

    poLocalStatus.set(id, 'in_production');

    res.json({
      success:      true,
      message:      'Purchase order marked as In Production',
      local_status: 'in_production',
      purchaseorder_id: id,
    });
  }
);

// ─── POST /api/purchase-orders/:id/mark-dispatched ───────────────────────────
// Marks a PO as "Dispatched" (local status)
router.post(
  '/:id/mark-dispatched',
  requireRole('seller_admin', 'operations_user'),
  async (req, res) => {
    const { id } = req.params;

    const poData = await zoho.getPurchaseOrderById(id);
    const po     = poData.purchaseorder;

    if (po.status !== 'open') {
      return res.status(400).json({
        error:   true,
        message: `Cannot mark as Dispatched — PO status is '${po.status}' (must be 'open')`,
      });
    }

    poLocalStatus.set(id, 'dispatched');

    res.json({
      success:      true,
      message:      'Purchase order marked as Dispatched',
      local_status: 'dispatched',
      purchaseorder_id: id,
    });
  }
);

// ─── POST /api/purchase-orders/:id/notify ────────────────────────────────────
router.post('/:id/notify', async (req, res) => {
  const poData = await zoho.getPurchaseOrderById(req.params.id);
  const po     = poData.purchaseorder;

  if (!whatsapp.isConfigured) {
    return res.status(503).json({ error: true, message: 'WhatsApp is not configured' });
  }

  const { phone } = req.body;
  const to = phone || req.seller.whatsapp_number;
  if (!to) {
    return res.status(400).json({ error: true, message: 'No phone number to send notification to' });
  }

  const result = await whatsapp.sendPONotification({
    to,
    poNumber:     po.purchaseorder_number,
    amount:       po.total,
    currency:     po.currency_code,
    deliveryDate: po.expected_delivery_date,
    poId:         po.purchaseorder_id,
  });

  res.json({ success: true, whatsapp: result });
});

module.exports = router;
