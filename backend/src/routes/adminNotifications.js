/**
 * Admin Notification Controller
 *
 * REST endpoints for manually triggering any of the 6 WhatsApp notification templates.
 *
 * POST /api/admin/notifications/send
 *   Manual trigger for Templates 1–6 from the Admin UI.
 *
 * POST /api/admin/notifications/bill-paid
 *   Triggers Template 5 (Bill Payout Details) when a bill is marked as paid.
 *   Can also be called by a future Zoho webhook.
 */

const express  = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const notificationSvc  = require('../services/notificationService');
const zoho             = require('../services/zohoBooksService');

const router = express.Router();

// ─── Admin-only guard ─────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.seller.email !== 'seller@demo.com' && req.seller.role !== 'admin') {
    return res.status(403).json({ error: true, message: 'Admin access required' });
  }
  next();
}

// ─── POST /api/admin/notifications/send ──────────────────────────────────────
// Manual trigger for any template.
//
// Body:
//   templateKey   - one of: po_issued | material_readiness | shipment_planned |
//                           update_invoice | bill_payout | adhoc
//   poId          - Zoho Books PO ID
//   sellerId?     - seller ID from sellers.js (if omitted, resolved via PO vendor_id)
//   payload?      - template-specific extra fields:
//                     po_issued:        { amount, currency, deliveryDate }
//                     shipment_planned: { vehicleNumber, arrivalDatetime, loadingPlan }
//                     bill_payout:      { bills, totalPaid, outstanding }
//                     adhoc:            { message }
router.post('/send', authenticate, requireAdmin, async (req, res) => {
  const { templateKey, poId, sellerId, payload } = req.body;

  if (!templateKey) {
    return res.status(400).json({ error: true, message: 'templateKey is required' });
  }
  if (!poId) {
    return res.status(400).json({ error: true, message: 'poId is required' });
  }

  // Fetch PO from Zoho to get poNumber, vendor_id, line_items
  let po = {};
  try {
    const poData = await zoho.getPurchaseOrderById(poId);
    po = poData.purchaseorder || {};
  } catch (err) {
    console.warn(`[AdminNotif] Could not fetch PO ${poId} from Zoho:`, err.message);
    // Continue — notificationService will resolve seller by sellerId if provided
  }

  const context = {
    poId,
    poNumber:  po.purchaseorder_number || poId,
    sellerId:  sellerId  || null,
    vendorId:  po.vendor_id            || null,
    lineItems: po.line_items           || [],
    payload:   payload                 || {},
  };

  const { messageId, seller } = await notificationSvc.sendTemplate(templateKey, context);

  console.log(`[AdminNotif] Manual trigger: template=${templateKey} poId=${poId} adminEmail=${req.seller.email} msgId=${messageId}`);

  res.json({
    success:  true,
    messageId,
    template: templateKey,
    sentTo:   seller.name || seller.company,
  });
});

// ─── POST /api/admin/notifications/bill-paid ─────────────────────────────────
// Trigger Template 5 (Bill Payout Details) when a bill linked to a PO is paid.
//
// Body:
//   poId    - PO ID the bill belongs to
//   bills   - Array of { billNumber, amount, paymentDate, utrNumber }
//   totalPaid?    - total amount paid (computed from bills if omitted)
//   outstanding?  - outstanding balance (defaults to 0)
router.post('/bill-paid', authenticate, requireAdmin, async (req, res) => {
  const { poId, bills, totalPaid, outstanding } = req.body;

  if (!poId)                   return res.status(400).json({ error: true, message: 'poId is required' });
  if (!Array.isArray(bills))   return res.status(400).json({ error: true, message: 'bills array is required' });

  let po = {};
  try {
    const poData = await zoho.getPurchaseOrderById(poId);
    po = poData.purchaseorder || {};
  } catch (err) {
    console.warn(`[AdminNotif] Could not fetch PO ${poId} from Zoho:`, err.message);
  }

  const computedTotal = totalPaid ?? bills.reduce((s, b) => s + Number(b.amount || 0), 0);

  const context = {
    poId,
    poNumber: po.purchaseorder_number || poId,
    vendorId: po.vendor_id || null,
    payload: {
      bills,
      totalPaid:   computedTotal,
      outstanding: outstanding ?? 0,
    },
  };

  const { messageId, seller } = await notificationSvc.sendTemplate('bill_payout', context);

  console.log(`[AdminNotif] Bill-paid trigger: poId=${poId} adminEmail=${req.seller.email} msgId=${messageId}`);

  res.json({
    success:  true,
    messageId,
    template: 'bill_payout',
    sentTo:   seller.name || seller.company,
  });
});

// ─── POST /api/admin/notify-po ───────────────────────────────────────────────
// Force-send T1 PO Issued notification for a specific PO number.
// Bypasses the time guard and notifiedPoIds check — use when auto-notify missed.
//
// Body:
//   poNumber  - Human-readable PO number, e.g. "PO0326-01798"
router.post('/notify-po', authenticate, requireAdmin, async (req, res) => {
  const { poNumber } = req.body;
  if (!poNumber) return res.status(400).json({ error: true, message: 'poNumber is required' });

  // Search Zoho for the PO by number
  let po;
  try {
    const data = await zoho.request('GET', '/purchaseorders', null, {
      purchaseorder_number: poNumber,
    });
    po = (data.purchaseorders || [])[0];
  } catch (err) {
    return res.status(502).json({ error: true, message: `Zoho lookup failed: ${err.message}` });
  }

  if (!po) {
    return res.status(404).json({ error: true, message: `PO not found: ${poNumber}` });
  }

  // Force-send notification (bypasses notifiedPoIds + time guard)
  const whatsapp = require('../services/whatsappService');
  const result = await whatsapp.triggerPONotification(po);

  console.log(`[AdminNotif] Force-notify: poNumber=${poNumber} poId=${po.purchaseorder_id} result=${JSON.stringify(result)} adminEmail=${req.seller.email}`);

  if (!result.sent) {
    return res.status(422).json({ error: true, message: `Notification not sent: ${result.reason}` });
  }

  // Also mark as notified so auto-notify won't double-fire
  const { addNotifiedPoId } = require('../data/poLocalState');
  addNotifiedPoId(po.purchaseorder_id);

  res.json({
    success:   true,
    poNumber:  po.purchaseorder_number,
    poId:      po.purchaseorder_id,
    sentTo:    po.vendor_name,
  });
});

module.exports = router;
