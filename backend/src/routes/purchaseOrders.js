const express  = require('express');
const zoho     = require('../services/zohoBooksService');
const whatsapp = require('../services/whatsappService');
const sellers  = require('../data/sellers');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ─── GET /api/purchase-orders ─────────────────────────────────────────────────
// List POs for the logged-in seller's vendor_id
router.get('/', async (req, res) => {
  const { status, page = 1, per_page = 25 } = req.query;
  const vendorId = req.seller.vendor_id;

  const params = { page, per_page };
  if (status)   params.status    = status;
  if (vendorId) params.vendor_id = vendorId;

  const data = await zoho.getPurchaseOrders(params);
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
  res.json(data);
});

// ─── POST /api/purchase-orders/:id/accept ────────────────────────────────────
router.post('/:id/accept', async (req, res) => {
  const { id } = req.params;

  const data = await zoho.acceptPurchaseOrder(id);

  // Send WhatsApp confirmation to the seller (non-blocking)
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
router.post('/:id/reject', async (req, res) => {
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

// ─── POST /api/purchase-orders/:id/notify ────────────────────────────────────
// Manually trigger WhatsApp notification for a PO (admin/test use)
router.post('/:id/notify', async (req, res) => {
  const poData = await zoho.getPurchaseOrderById(req.params.id);
  const po = poData.purchaseorder;

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
