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
 * Zoho Books' PO status model is fixed (draft/issued/open/billed/cancelled).
 * We augment it with an additional 'dispatched' local status.
 * Key: Zoho PO ID  →  Value: 'dispatched'
 */
const poLocalStatus = new Map();

/**
 * In-memory per-line-item delivery dates, kept for backward compat with
 * WhatsApp notifications (expected_delivery_date field).
 * Key: Zoho PO ID  →  Value: [{ item_id, name, expected_date }]
 */
const poLineDeliveryDates = new Map();

/**
 * In-memory RTD (Ready-to-Dispatch) data per line item.
 * Key: Zoho PO ID  →  Value: { [itemIndex]: RTDEntry }
 *
 * RTDEntry = {
 *   rtd_eta_original:    string (YYYY-MM-DD) — set once at acceptance, immutable
 *   rtd_eta_revised:     string | null       — latest revision by seller
 *   rtd_marked_ready_at: ISO string | null
 *   rtd_marked_ready_by: string | null       — seller user id
 *   revision_log: [{ previous_eta, new_eta, revised_by, revised_at, revision_count }]
 * }
 */
const poRTDData = new Map();

/**
 * In-memory activity log per PO.
 * Key: Zoho PO ID  →  Value: [{ event, actor, timestamp, details }]
 * Most-recent-first (unshift on each append).
 */
const poActivityLog = new Map();

// Helper: append an event to a PO's activity log
function appendActivity(poId, event, actor, details = {}) {
  if (!poActivityLog.has(poId)) poActivityLog.set(poId, []);
  poActivityLog.get(poId).unshift({
    event,
    actor,
    timestamp: new Date().toISOString(),
    details,
  });
}

// Helper: inject all local data into a single PO object
function mergeLocalStatus(po) {
  if (!po) return po;
  const id = po.purchaseorder_id;
  const result = { ...po };
  if (id && poLocalStatus.has(id))       result.local_status      = poLocalStatus.get(id);
  if (id && poLineDeliveryDates.has(id)) result.line_delivery_dates = poLineDeliveryDates.get(id);
  if (id && poRTDData.has(id))           result.rtd_data          = poRTDData.get(id);
  if (id && poActivityLog.has(id))       result.activity_log      = poActivityLog.get(id);
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

  // Merge local_status and filter out draft POs (never shown to sellers)
  if (data.purchaseorders) {
    data.purchaseorders = data.purchaseorders
      .filter(po => po.status !== 'draft')
      .map(mergeLocalStatus);
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
// Body (JSON): { rtd_etas: [{ item_index, eta }] }
// rtd_etas must cover every line item; eta must be >= today (YYYY-MM-DD)
//
// NOTE: Acceptance is stored LOCALLY only — Zoho Books is NOT updated.
// Zoho manages its own PO lifecycle independently.
router.post('/:id/accept', requireRole('seller_admin', 'operations_user'), async (req, res) => {
  const { id } = req.params;
  const { rtd_etas } = req.body;
  const sellerName = req.seller.name || req.seller.email;

  // Fetch PO from Zoho (needed for line_items, poNumber, and WhatsApp compat)
  const poData = await zoho.getPurchaseOrderById(id);
  const po     = poData.purchaseorder || {};

  // Mark as accepted locally
  poLocalStatus.set(id, 'accepted');

  // Store RTD ETAs per line item
  if (Array.isArray(rtd_etas) && rtd_etas.length > 0) {
    const rtdMap = {};
    rtd_etas.forEach(({ item_index, eta }) => {
      rtdMap[item_index] = {
        rtd_eta_original:    eta,
        rtd_eta_revised:     null,
        rtd_marked_ready_at: null,
        rtd_marked_ready_by: null,
        revision_log:        [],
      };
    });
    poRTDData.set(id, rtdMap);

    // Keep legacy line_delivery_dates for WhatsApp backward compat
    const lineItems = po.line_items || [];
    poLineDeliveryDates.set(id, rtd_etas.map(({ item_index, eta }) => ({
      item_id:       lineItems[item_index]?.item_id || '',
      name:          lineItems[item_index]?.name    || `Item ${item_index + 1}`,
      expected_date: eta,
    })));

    appendActivity(id, 'po_accepted', sellerName, { rtd_etas });
  } else {
    appendActivity(id, 'po_accepted', sellerName, {});
  }

  // Send WhatsApp confirmation (non-blocking)
  if (whatsapp.isConfigured && req.seller.whatsapp_enabled && req.seller.whatsapp_number) {
    whatsapp.sendPOStatusUpdate({
      to:       req.seller.whatsapp_number,
      poNumber: po.purchaseorder_number || id,
      status:   'accepted',
    }).catch(err => console.warn('[WhatsApp] Accept notification failed:', err.message));
  }

  res.json({ success: true, message: 'Purchase order accepted', purchaseorder: mergeLocalStatus(po) });
});

// ─── POST /api/purchase-orders/:id/reject ────────────────────────────────────
// NOTE: Rejection is stored LOCALLY only — Zoho Books is NOT updated.
router.post('/:id/reject', requireRole('seller_admin', 'operations_user'), async (req, res) => {
  const { id } = req.params;
  const { reason = '' } = req.body;
  const sellerName = req.seller.name || req.seller.email;

  // Mark as rejected locally
  poLocalStatus.set(id, 'rejected');
  appendActivity(id, 'po_rejected', sellerName, { reason });

  // Fetch PO for response and WhatsApp notification
  const poData = await zoho.getPurchaseOrderById(id);
  const po     = poData.purchaseorder || {};

  if (whatsapp.isConfigured && req.seller.whatsapp_enabled && req.seller.whatsapp_number) {
    whatsapp.sendPOStatusUpdate({
      to:       req.seller.whatsapp_number,
      poNumber: po.purchaseorder_number || id,
      status:   'rejected',
      reason,
    }).catch(err => console.warn('[WhatsApp] Reject notification failed:', err.message));
  }

  res.json({ success: true, message: 'Purchase order rejected', purchaseorder: mergeLocalStatus(po) });
});

// ─── POST /api/purchase-orders/:id/mark-dispatched ───────────────────────────
// Marks a PO as "Dispatched" (local status — used for DRI flow by platform)
router.post(
  '/:id/mark-dispatched',
  requireRole('seller_admin', 'operations_user'),
  async (req, res) => {
    const { id } = req.params;

    const poData = await zoho.getPurchaseOrderById(id);
    const po     = poData.purchaseorder;
    const merged = mergeLocalStatus(po);

    // Allow dispatch if: Zoho status is 'open' (legacy) OR seller has locally accepted
    if (po.status !== 'open' && merged.local_status !== 'accepted') {
      return res.status(400).json({
        error:   true,
        message: `Cannot mark as Dispatched — PO must be accepted first`,
      });
    }

    poLocalStatus.set(id, 'dispatched');
    appendActivity(id, 'mark_dispatched', req.seller.name || req.seller.email, {});

    res.json({
      success:          true,
      message:          'Purchase order marked as Dispatched',
      local_status:     'dispatched',
      purchaseorder_id: id,
    });
  }
);

// ─── POST /api/purchase-orders/:id/rtd/mark-ready ────────────────────────────
// Marks a specific line item as Ready to Dispatch.
// Body (JSON): { item_index: number }
router.post(
  '/:id/rtd/mark-ready',
  requireRole('seller_admin', 'operations_user'),
  async (req, res) => {
    const { id }         = req.params;
    const { item_index } = req.body;
    const sellerName     = req.seller.name || req.seller.email;

    if (item_index == null || typeof item_index !== 'number') {
      return res.status(400).json({ error: true, message: 'item_index (number) is required' });
    }

    const rtdMap = poRTDData.get(id) || {};
    const entry  = rtdMap[item_index];
    if (!entry) {
      return res.status(400).json({ error: true, message: `No RTD data found for item_index ${item_index}` });
    }
    if (entry.rtd_marked_ready_at) {
      return res.status(400).json({ error: true, message: 'Item is already marked as Ready' });
    }

    entry.rtd_marked_ready_at = new Date().toISOString();
    entry.rtd_marked_ready_by = req.seller.id;
    poRTDData.set(id, rtdMap);

    appendActivity(id, 'item_ready', sellerName, {
      item_index,
      rtd_eta_original: entry.rtd_eta_original,
    });

    // Check if ALL items are now ready — fire WhatsApp if so
    const allReady = Object.values(rtdMap).every(e => !!e.rtd_marked_ready_at);
    if (allReady && whatsapp.isConfigured) {
      try {
        const poData   = await zoho.getPurchaseOrderById(id);
        const po       = poData.purchaseorder || {};
        const adminNum = process.env.ADMIN_WHATSAPP_NUMBER;
        if (adminNum) {
          whatsapp.sendAllItemsReady({
            to:            adminNum,
            poNumber:      po.purchaseorder_number || id,
            lineItemCount: Object.keys(rtdMap).length,
            sellerName,
            adminPoUrl:    `${process.env.ADMIN_PORTAL_URL || ''}/pos/${id}`,
          }).catch(err => console.warn('[WhatsApp] All items ready notification failed:', err.message));
        }
      } catch {
        // Non-blocking — ignore PO fetch errors for WhatsApp
      }
    }

    res.json({ success: true, message: 'Line item marked as Ready to Dispatch', all_ready: allReady });
  }
);

// ─── POST /api/purchase-orders/:id/rtd/undo-ready ────────────────────────────
// Reverts a line item from Ready back to Pending.
// Body (JSON): { item_index: number }
router.post(
  '/:id/rtd/undo-ready',
  requireRole('seller_admin', 'operations_user'),
  async (req, res) => {
    const { id }         = req.params;
    const { item_index } = req.body;

    if (item_index == null || typeof item_index !== 'number') {
      return res.status(400).json({ error: true, message: 'item_index (number) is required' });
    }

    const rtdMap = poRTDData.get(id) || {};
    const entry  = rtdMap[item_index];
    if (!entry) {
      return res.status(400).json({ error: true, message: `No RTD data found for item_index ${item_index}` });
    }

    entry.rtd_marked_ready_at = null;
    entry.rtd_marked_ready_by = null;
    poRTDData.set(id, rtdMap);

    appendActivity(id, 'undo_ready', req.seller.name || req.seller.email, { item_index });

    res.json({ success: true, message: 'Line item ready status reverted to Pending' });
  }
);

// ─── PATCH /api/purchase-orders/:id/rtd/revised-eta ──────────────────────────
// Revises the RTD ETA for a specific line item.
// Body (JSON): { item_index: number, new_eta: string (YYYY-MM-DD) }
router.patch(
  '/:id/rtd/revised-eta',
  requireRole('seller_admin', 'operations_user'),
  async (req, res) => {
    const { id }              = req.params;
    const { item_index, new_eta } = req.body;
    const sellerName          = req.seller.name || req.seller.email;

    if (item_index == null || typeof item_index !== 'number') {
      return res.status(400).json({ error: true, message: 'item_index (number) is required' });
    }
    if (!new_eta || !/^\d{4}-\d{2}-\d{2}$/.test(new_eta)) {
      return res.status(400).json({ error: true, message: 'new_eta must be a valid YYYY-MM-DD date' });
    }

    const rtdMap = poRTDData.get(id) || {};
    const entry  = rtdMap[item_index];
    if (!entry) {
      return res.status(400).json({ error: true, message: `No RTD data found for item_index ${item_index}` });
    }

    const previousEta   = entry.rtd_eta_revised || entry.rtd_eta_original;
    const revisionCount = (entry.revision_log?.length || 0) + 1;

    entry.revision_log.push({
      previous_eta:   previousEta,
      new_eta,
      revised_by:     req.seller.id,
      revised_at:     new Date().toISOString(),
      revision_count: revisionCount,
    });
    entry.rtd_eta_revised = new_eta;
    poRTDData.set(id, rtdMap);

    appendActivity(id, 'eta_revised', sellerName, {
      item_index,
      previous_eta: previousEta,
      new_eta,
      revision_count: revisionCount,
    });

    // Fire WhatsApp notification to admin (non-blocking)
    const adminNum = process.env.ADMIN_WHATSAPP_NUMBER;
    if (whatsapp.isConfigured && adminNum) {
      try {
        const poData  = await zoho.getPurchaseOrderById(id);
        const po      = poData.purchaseorder || {};
        const itemDesc = (po.line_items || [])[item_index]?.name || `Item ${item_index + 1}`;
        whatsapp.sendRTDEtaRevised({
          to:              adminNum,
          poNumber:        po.purchaseorder_number || id,
          sellerName,
          itemDescription: itemDesc,
          originalEta:     previousEta,
          newEta:          new_eta,
          adminPoUrl:      `${process.env.ADMIN_PORTAL_URL || ''}/pos/${id}`,
        }).catch(err => console.warn('[WhatsApp] ETA revised notification failed:', err.message));
      } catch {
        // Non-blocking — ignore PO fetch errors for WhatsApp
      }
    }

    res.json({ success: true, message: 'RTD ETA revised', revision_count: revisionCount });
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
