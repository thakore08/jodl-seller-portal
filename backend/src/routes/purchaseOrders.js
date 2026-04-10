const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const { randomUUID } = require('crypto');
const zoho     = require('../services/zohoBooksService');
const whatsapp = require('../services/whatsappService');
const { sellers } = require('../data/sellers');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const poAttachments = require('../data/poAttachments');
const { getProductionPlan, listProductionPlans, setProductionPlan } = require('../data/productionPlans');
const {
  poLocalStatus,
  notifiedPoIds,
  addNotifiedPoId,
  poLineDeliveryDates,
  poRTDData,
  poActivityLog,
} = require('../data/poLocalState');

// No time window — any unnotified 'issued' PO is always notified.
// Re-spam on deploy is prevented by notifiedPoIds (persisted to disk).

const router = express.Router();

// ─── Public attachment endpoints (before auth middleware) ─────────────────────
// Serve PDFs inline — no auth required so direct browser links work.
router.get('/:id/attachments/bill', (req, res) => {
  const att = poAttachments.getAttachments(req.params.id).bill;
  if (!att) return res.status(404).json({ error: true, message: 'No bill attachment' });
  const fp = path.resolve(process.env.UPLOAD_DIR || './uploads', att.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: true, message: 'File not found on disk' });
  res.setHeader('Content-Disposition', `inline; filename="${att.originalName || att.filename}"`);
  res.sendFile(fp);
});

router.get('/:id/attachments/invoice', (req, res) => {
  const att = poAttachments.getAttachments(req.params.id).invoice;
  if (!att) return res.status(404).json({ error: true, message: 'No invoice attachment' });
  const fp = path.resolve(process.env.UPLOAD_DIR || './uploads', att.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: true, message: 'File not found on disk' });
  res.setHeader('Content-Disposition', `inline; filename="${att.invoiceNumber || att.filename}.pdf"`);
  res.sendFile(fp);
});

// All other routes require authentication
router.use(authenticate);

// ─── GET /api/purchase-orders/:id/whatsapp-chat ───────────────────────────────
// Returns the full WA message history with the seller associated with this PO.
// Identifies the seller by vendor_id (passed as ?vendor_id= query param, or falls
// back to the authenticated seller's own vendor_id).
router.get('/:id/whatsapp-chat', (req, res) => {
  const { getMessagesByPhone } = require('../data/waMessages');

  // Resolve the target seller's phone:
  //  - Admin view: vendor_id passed as ?vendor_id= query param
  //  - Seller view: falls back to authenticated seller's own vendor_id
  const vendorId = req.query.vendor_id || req.seller.vendor_id;
  const seller   = sellers.find(s => s.vendor_id === vendorId);

  if (!seller) {
    return res.json({ messages: [] });
  }

  const phone = (seller.whatsapp_number || seller.phone || '').replace(/^\+/, '');
  if (!phone) {
    return res.json({ messages: [] });
  }

  const messages = getMessagesByPhone(phone);
  res.json({ messages });
});

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

function isValidDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function eachDateString(startDate, endDate) {
  if (!isValidDateString(startDate) || !isValidDateString(endDate)) return [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function addDays(dateString, days) {
  const dt = new Date(`${dateString}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function sumField(rows, field) {
  return rows.reduce((sum, row) => sum + toNumber(row?.[field]), 0);
}

function buildProductionPlan(po, existingPlan = null, incomingPlan = {}) {
  const poId = po.purchaseorder_id;
  const poNumber = po.purchaseorder_number || poId;
  const lineItems = Array.isArray(po.line_items) ? po.line_items : [];
  const basePlan = existingPlan || {};
  const startDate = incomingPlan.start_date || basePlan.start_date || new Date().toISOString().slice(0, 10);
  const endDate = incomingPlan.end_date || basePlan.end_date || addDays(startDate, 29);
  const dateSpan = eachDateString(startDate, endDate);
  const incomingLines = Array.isArray(incomingPlan.lines) ? incomingPlan.lines : null;
  const existingLines = Array.isArray(basePlan.lines) ? basePlan.lines : [];

  const lines = lineItems.map((poItem, itemIndex) => {
    const incomingLine = incomingLines?.find(line => Number(line?.item_index) === itemIndex);
    const existingLine = existingLines.find(line => Number(line?.item_index) === itemIndex) || {};
    const sourceEntries = Array.isArray(incomingLine?.entries)
      ? incomingLine.entries
      : Array.isArray(existingLine.entries)
        ? existingLine.entries
        : dateSpan.map(entryDate => ({ entry_date: entryDate }));

    const entries = sourceEntries
      .map(entry => ({
        entry_id: entry.entry_id || randomUUID(),
        entry_date: isValidDateString(entry.entry_date) ? entry.entry_date : null,
        planned_qty: toNumber(entry.planned_qty),
        estimated_qty: toNumber(entry.estimated_qty),
        actual_qty: toNumber(entry.actual_qty),
        good_qty: toNumber(entry.good_qty),
        scrap_qty: toNumber(entry.scrap_qty),
        rework_qty: toNumber(entry.rework_qty),
        variance_qty: toNumber(entry.actual_qty) - toNumber(entry.planned_qty),
        variance_reason: typeof entry.variance_reason === 'string' ? entry.variance_reason.trim() : '',
        shift: typeof entry.shift === 'string' ? entry.shift.trim() : '',
        machine_or_line: typeof entry.machine_or_line === 'string' ? entry.machine_or_line.trim() : '',
        supervisor_name: typeof entry.supervisor_name === 'string' ? entry.supervisor_name.trim() : '',
        remarks: typeof entry.remarks === 'string' ? entry.remarks.trim() : '',
      }))
      .filter(entry => entry.entry_date)
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date));

    const poQty = toNumber(poItem.quantity);
    const totalPlannedQty = sumField(entries, 'planned_qty');
    const totalEstimatedQty = sumField(entries, 'estimated_qty');
    const totalActualQty = sumField(entries, 'actual_qty');
    const totalGoodQty = sumField(entries, 'good_qty');
    const totalScrapQty = sumField(entries, 'scrap_qty');
    const totalReworkQty = sumField(entries, 'rework_qty');
    const remainingQty = Math.max(poQty - totalGoodQty, 0);

    return {
      line_id: incomingLine?.line_id || existingLine.line_id || randomUUID(),
      item_index: itemIndex,
      item_id: poItem.item_id || existingLine.item_id || '',
      item_name: poItem.name || existingLine.item_name || `Item ${itemIndex + 1}`,
      description: poItem.description || existingLine.description || '',
      uom: poItem.unit || existingLine.uom || '',
      po_qty: poQty,
      remaining_qty: remainingQty,
      target_planned_qty: toNumber(incomingLine?.target_planned_qty ?? existingLine.target_planned_qty ?? totalPlannedQty),
      target_estimated_qty: toNumber(incomingLine?.target_estimated_qty ?? existingLine.target_estimated_qty ?? totalEstimatedQty),
      total_planned_qty: totalPlannedQty,
      total_estimated_qty: totalEstimatedQty,
      total_actual_qty: totalActualQty,
      total_good_qty: totalGoodQty,
      total_scrap_qty: totalScrapQty,
      total_rework_qty: totalReworkQty,
      variance_qty: totalActualQty - totalPlannedQty,
      entries,
    };
  });

  const totalPoQty = lines.reduce((sum, line) => sum + line.po_qty, 0);
  const totalPlannedQty = lines.reduce((sum, line) => sum + line.total_planned_qty, 0);
  const totalEstimatedQty = lines.reduce((sum, line) => sum + line.total_estimated_qty, 0);
  const totalActualQty = lines.reduce((sum, line) => sum + line.total_actual_qty, 0);
  const totalGoodQty = lines.reduce((sum, line) => sum + line.total_good_qty, 0);
  const totalScrapQty = lines.reduce((sum, line) => sum + line.total_scrap_qty, 0);
  const totalReworkQty = lines.reduce((sum, line) => sum + line.total_rework_qty, 0);

  return {
    plan_id: basePlan.plan_id || randomUUID(),
    po_id: poId,
    po_number: poNumber,
    vendor_id: po.vendor_id || null,
    planning_basis: incomingPlan.planning_basis || basePlan.planning_basis || 'day',
    start_date: startDate,
    end_date: endDate,
    status: incomingPlan.status || basePlan.status || 'draft',
    remarks: typeof incomingPlan.remarks === 'string'
      ? incomingPlan.remarks.trim()
      : (basePlan.remarks || ''),
    submitted_by: basePlan.submitted_by || null,
    submitted_at: basePlan.submitted_at || null,
    approved_by: basePlan.approved_by || null,
    approved_at: basePlan.approved_at || null,
    last_updated_by: basePlan.last_updated_by || null,
    last_updated_at: basePlan.last_updated_at || null,
    summary: {
      total_po_qty: totalPoQty,
      total_planned_qty: totalPlannedQty,
      total_estimated_qty: totalEstimatedQty,
      total_actual_qty: totalActualQty,
      total_good_qty: totalGoodQty,
      total_scrap_qty: totalScrapQty,
      total_rework_qty: totalReworkQty,
      remaining_qty: Math.max(totalPoQty - totalGoodQty, 0),
      variance_qty: totalActualQty - totalPlannedQty,
      completion_pct: totalPoQty > 0 ? Number(((totalGoodQty / totalPoQty) * 100).toFixed(2)) : 0,
    },
    lines,
  };
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
  result.attachments = poAttachments.getAttachments(id);
  return result;
}

// ─── GET /api/purchase-orders ─────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { status, page = 1, per_page = 25 } = req.query;
  const vendorId = req.seller.vendor_id;

  // Overfetch 5× to compensate for draft POs being filtered client-side.
  // Zoho returns POs newest-first; the most recent batch may be all drafts.
  // Fetching more ensures we get enough non-draft items after filtering.
  const zohoPerPage = Math.min(Number(per_page) * 5, 200);
  const params = { page, per_page: zohoPerPage };
  if (status)   params.status    = status;
  if (vendorId) params.vendor_id = vendorId;

  const data = await zoho.getPurchaseOrders(params);

  // Filter out draft POs (never shown to sellers) then slice to requested count
  if (data.purchaseorders) {
    const filtered = data.purchaseorders
      .filter(po => po.status !== 'draft')
      .map(mergeLocalStatus);
    data.purchaseorders = filtered.slice(0, Number(per_page));

    // Auto-trigger WhatsApp notification for newly-seen issued POs
    if (!whatsapp.isConfigured) {
      console.warn('[AutoNotify] WhatsApp not configured — skipping PO notifications');
    } else {
      const newPOs = filtered.filter(po => {
        // Only notify 'issued' POs — 'open' means already accepted, no action needed
        if (po.status !== 'issued') return false;
        // Skip if already notified (persisted across restarts)
        if (notifiedPoIds.has(po.purchaseorder_id)) return false;
        return true;
      });
      console.log(`[AutoNotify] Checking ${filtered.length} POs — ${newPOs.length} new to notify`);
      newPOs.forEach(po => {
        addNotifiedPoId(po.purchaseorder_id); // persist immediately
        console.log(`[AutoNotify] Triggering WA for ${po.purchaseorder_number} (vendor_id=${po.vendor_id}, status=${po.status})`);
        whatsapp.triggerPONotification(po)
          .then(result => console.log(`[AutoNotify] Result for ${po.purchaseorder_number}:`, JSON.stringify(result)))
          .catch(err => console.error(`[AutoNotify] FAILED for ${po.purchaseorder_number}:`, err.message));
      });
    }
  }

  res.json(data);
});

// ─── GET /api/purchase-orders/stats ──────────────────────────────────────────
router.get('/stats', async (req, res) => {
  const stats = await zoho.getPOStats(req.seller.vendor_id || null);
  res.json(stats);
});

// ─── GET /api/purchase-orders/production-plans ──────────────────────────────
router.get('/production-plans', requireRole('seller_admin', 'operations_user'), async (req, res) => {
  const plans = listProductionPlans()
    .map(plan => ({
      ...plan,
      line_count: Array.isArray(plan.lines) ? plan.lines.length : 0,
    }))
    .sort((a, b) => String(b.last_updated_at || b.submitted_at || '').localeCompare(String(a.last_updated_at || a.submitted_at || '')));

  res.json({ success: true, production_plans: plans });
});

// ─── GET /api/purchase-orders/:id ────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const data = await zoho.getPurchaseOrderById(req.params.id);
  // Merge local status into detail response
  if (data.purchaseorder) {
    data.purchaseorder = mergeLocalStatus(data.purchaseorder);
    const productionPlan = getProductionPlan(req.params.id);
    if (productionPlan) data.purchaseorder.production_plan = productionPlan;
  }
  res.json(data);
});

// ─── GET /api/purchase-orders/:id/production-plan ───────────────────────────
router.get('/:id/production-plan', async (req, res) => {
  const poData = await zoho.getPurchaseOrderById(req.params.id);
  const po = poData.purchaseorder;
  if (!po) {
    return res.status(404).json({ error: true, message: 'Purchase order not found' });
  }

  const existingPlan = getProductionPlan(req.params.id);
  const plan = buildProductionPlan(po, existingPlan);
  res.json({ success: true, production_plan: plan });
});

// ─── PUT /api/purchase-orders/:id/production-plan ───────────────────────────
router.put('/:id/production-plan', requireRole('seller_admin', 'operations_user'), async (req, res) => {
  const poData = await zoho.getPurchaseOrderById(req.params.id);
  const po = poData.purchaseorder;
  if (!po) {
    return res.status(404).json({ error: true, message: 'Purchase order not found' });
  }

  const existingPlan = getProductionPlan(req.params.id);
  if (existingPlan?.status === 'approved') {
    return res.status(400).json({ error: true, message: 'Approved production plan is locked' });
  }

  const nextPlan = buildProductionPlan(po, existingPlan, req.body || {});
  nextPlan.status = existingPlan?.status === 'submitted' ? 'submitted' : 'draft';
  nextPlan.last_updated_by = req.seller.name || req.seller.email;
  nextPlan.last_updated_at = new Date().toISOString();

  setProductionPlan(req.params.id, nextPlan);
  appendActivity(req.params.id, 'production_plan_saved', req.seller.name || req.seller.email, {
    planning_basis: nextPlan.planning_basis,
    start_date: nextPlan.start_date,
    end_date: nextPlan.end_date,
  });

  res.json({ success: true, message: 'Production plan saved', production_plan: nextPlan });
});

// ─── POST /api/purchase-orders/:id/production-plan/submit ───────────────────
router.post('/:id/production-plan/submit', requireRole('seller_admin', 'operations_user'), async (req, res) => {
  const poData = await zoho.getPurchaseOrderById(req.params.id);
  const po = poData.purchaseorder;
  if (!po) {
    return res.status(404).json({ error: true, message: 'Purchase order not found' });
  }

  const existingPlan = getProductionPlan(req.params.id);
  if (!existingPlan) {
    return res.status(400).json({ error: true, message: 'Save a production plan before submitting it' });
  }
  if (existingPlan.status === 'approved') {
    return res.status(400).json({ error: true, message: 'Production plan is already approved' });
  }

  const nextPlan = buildProductionPlan(po, existingPlan);
  nextPlan.status = 'submitted';
  nextPlan.submitted_by = req.seller.name || req.seller.email;
  nextPlan.submitted_at = new Date().toISOString();
  nextPlan.last_updated_by = req.seller.name || req.seller.email;
  nextPlan.last_updated_at = nextPlan.submitted_at;

  setProductionPlan(req.params.id, nextPlan);
  appendActivity(req.params.id, 'production_plan_submitted', req.seller.name || req.seller.email, {
    total_planned_qty: nextPlan.summary.total_planned_qty,
    total_actual_qty: nextPlan.summary.total_actual_qty,
  });

  res.json({ success: true, message: 'Production plan submitted', production_plan: nextPlan });
});

// ─── POST /api/purchase-orders/:id/production-plan/approve ──────────────────
router.post('/:id/production-plan/approve', requireRole('seller_admin'), async (req, res) => {
  const poData = await zoho.getPurchaseOrderById(req.params.id);
  const po = poData.purchaseorder;
  if (!po) {
    return res.status(404).json({ error: true, message: 'Purchase order not found' });
  }

  const existingPlan = getProductionPlan(req.params.id);
  if (!existingPlan) {
    return res.status(400).json({ error: true, message: 'No production plan found to approve' });
  }

  const nextPlan = buildProductionPlan(po, existingPlan);
  nextPlan.status = 'approved';
  nextPlan.approved_by = req.seller.name || req.seller.email;
  nextPlan.approved_at = new Date().toISOString();
  nextPlan.last_updated_by = req.seller.name || req.seller.email;
  nextPlan.last_updated_at = nextPlan.approved_at;

  setProductionPlan(req.params.id, nextPlan);
  appendActivity(req.params.id, 'production_plan_approved', req.seller.name || req.seller.email, {
    completion_pct: nextPlan.summary.completion_pct,
  });

  res.json({ success: true, message: 'Production plan approved', production_plan: nextPlan });
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

  // Send WhatsApp post-acceptance action menu (non-blocking)
  if (whatsapp.isConfigured && req.seller.whatsapp_enabled && req.seller.whatsapp_number) {
    const frontendUrl = process.env.FRONTEND_URL || 'https://jodl-seller-portal.onrender.com';
    const to       = req.seller.whatsapp_number;
    const poNumber = po.purchaseorder_number || id;
    whatsapp._shortenUrl(`${frontendUrl}/purchase-orders/${id}`)
      .then(poUrl => {
        // Post-acceptance action menu (existing)
        whatsapp.sendPostAcceptanceMenu({ to, poNumber, poId: id, poUrl })
          .catch(err => console.warn('[WhatsApp] Accept menu failed:', err.message));

        // T2: Material Readiness request (immediate)
        whatsapp.sendMaterialReadinessRequest({ to, poNumber, poId: id, poUrl })
          .catch(err => console.warn('[WhatsApp] T2 material readiness failed:', err.message));

        // T4: Update Invoice request (30s delay to avoid message pile-up)
        setTimeout(() => {
          whatsapp.sendInvoiceUpdateRequest({ to, poNumber, poId: id, poUrl })
            .catch(err => console.warn('[WhatsApp] T4 invoice request failed:', err.message));
        }, 30_000);
      })
      .catch(err => console.warn('[WhatsApp] Accept menu failed:', err.message));
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
    let entry = rtdMap[item_index];

    if (!entry) {
      // Auto-seed missing RTD entry (handles legacy 'open'-status POs, or POs accepted
      // before per-item ETA seeding was introduced). Use today as a fallback original ETA.
      const today = new Date().toISOString().split('T')[0];
      entry = {
        rtd_eta_original:    today,
        rtd_eta_revised:     null,
        rtd_marked_ready_at: null,
        rtd_marked_ready_by: null,
        revision_log:        [],
      };
      rtdMap[item_index] = entry;
      poRTDData.set(id, rtdMap);
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
    if (!entry || !entry.rtd_marked_ready_at) {
      // Nothing to undo — treat as a no-op
      return res.json({ success: true, message: 'Nothing to undo' });
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
    let entry = rtdMap[item_index];

    if (!entry) {
      // Auto-seed: no prior ETA exists, so treat this as setting the original ETA
      entry = {
        rtd_eta_original:    new_eta,
        rtd_eta_revised:     null,
        rtd_marked_ready_at: null,
        rtd_marked_ready_by: null,
        revision_log:        [],
      };
      rtdMap[item_index] = entry;
      poRTDData.set(id, rtdMap);
      appendActivity(id, 'rtd_eta_set', sellerName, { item_index, eta: new_eta });
      return res.json({ success: true, message: 'RTD ETA set', revision_count: 0 });
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
  let to = phone || req.seller.whatsapp_number;

  // Auto-fetch from Zoho Books vendor contact if not set locally
  if (!to && req.seller.vendor_id) {
    try {
      const vendorData = await zoho.getVendorById(req.seller.vendor_id);
      const contact = vendorData?.contact;
      to = contact?.mobile || contact?.phone || null;
      if (to) console.log(`[WhatsApp] Using Zoho phone for vendor ${req.seller.vendor_id}: ${to}`);
    } catch (err) {
      console.warn('[WhatsApp] Could not fetch vendor phone from Zoho:', err.message);
    }
  }

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
