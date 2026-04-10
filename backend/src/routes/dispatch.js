const express = require('express');
const zoho = require('../services/zohoBooksService');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const { poLocalStatus, poRTDData } = require('../data/poLocalState');

const router = express.Router();

router.use(authenticate);
router.use(requireRole('seller_admin', 'operations_user'));

function getEffectiveStatus(po) {
  if (!po) return null;
  if (po.local_status === 'rejected') return 'rejected';
  if (po.local_status === 'dispatched') return 'dispatched';
  if (po.local_status === 'accepted') return 'accepted';
  if (po.status === 'cancelled') return 'rejected';
  if (po.status === 'billed') return 'invoiced';
  if (po.status === 'open') return 'issued';
  if (po.status === 'issued') return 'issued';
  return null;
}

function mergeLocalStatus(po) {
  if (!po) return po;
  const id = po.purchaseorder_id;
  const result = { ...po };
  if (id && poLocalStatus.has(id)) result.local_status = poLocalStatus.get(id);
  if (id && poRTDData.has(id)) result.rtd_data = poRTDData.get(id);
  return result;
}

function normalizeValue(value) {
  return String(value || '').trim().toLowerCase();
}

function pickFirst(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value != null && value !== '') return value;
  }
  return null;
}

function toShipmentRows(data) {
  const candidates = [
    data?.cm_oms_shipment_module,
    data?.shipments,
    data?.shipment_module,
    data?.records,
    data?.data,
    data?.items,
  ];
  const rows = candidates.find(Array.isArray);
  return Array.isArray(rows) ? rows : [];
}

function extractCustomFieldRefs(customFields = []) {
  if (!Array.isArray(customFields)) return [];
  return customFields.flatMap(field => {
    const label = normalizeValue(field?.label || field?.api_name || field?.placeholder || field?.customfield_name);
    const value = field?.value;
    if (!value) return [];
    if (!label.includes('po') && !label.includes('purchase')) return [];
    return [String(value)];
  });
}

function normalizeShipment(record = {}) {
  const refs = new Set([
    record.purchaseorder_id,
    record.purchase_order_id,
    record.purchaseorder_number,
    record.purchase_order_number,
    record.po_id,
    record.po_number,
    record.reference_number,
    record.salesorder_number,
    record.order_number,
    record.display_name,
    ...extractCustomFieldRefs(record.custom_fields),
  ].filter(Boolean).map(value => String(value)));

  return {
    shipment_id: pickFirst(record, [
      'cm_oms_shipment_module_id',
      'shipment_id',
      'id',
      'record_id',
    ]),
    shipment_number: pickFirst(record, [
      'shipment_number',
      'shipment_no',
      'display_name',
      'name',
      'reference_number',
    ]) || 'Shipment',
    shipment_status: pickFirst(record, [
      'shipment_status',
      'status',
      'delivery_status',
      'shipment_state',
    ]) || 'unknown',
    shipment_date: pickFirst(record, [
      'shipment_date',
      'date',
      'created_time',
      'last_modified_time',
    ]),
    raw: record,
    refs,
  };
}

function getRTDStatusForLine(itemIndex, rtdData, lineItem) {
  const entry = rtdData?.[itemIndex];
  const orderedQty = Number(lineItem?.quantity || 0);
  const billedQty = Number(lineItem?.billed_quantity || 0);

  if (billedQty > 0) {
    if (orderedQty > 0 && billedQty >= orderedQty) return 'rtd_dispatched';
    return 'rtd_partially_dispatched';
  }

  if (entry?.rtd_marked_ready_at) return 'rtd_ready';
  return 'rtd_pending';
}

function summarizeRTD(po) {
  const lineItems = Array.isArray(po?.line_items) ? po.line_items : [];
  const rtdData = po?.rtd_data || {};
  const summary = lineItems.reduce((acc, item, index) => {
    const status = getRTDStatusForLine(index, rtdData, item);
    if (status === 'rtd_ready' || status === 'rtd_dispatched' || status === 'rtd_partially_dispatched') {
      acc.ready_line_count += 1;
    }
    if (status === 'rtd_dispatched' || status === 'rtd_partially_dispatched') {
      acc.dispatched_line_count += 1;
    }
    if (status === 'rtd_ready') {
      const eta = rtdData?.[index]?.rtd_eta_revised || rtdData?.[index]?.rtd_eta_original;
      if (eta && (!acc.latest_eta || eta > acc.latest_eta)) acc.latest_eta = eta;
    }
    return acc;
  }, {
    ready_line_count: 0,
    dispatched_line_count: 0,
    total_line_count: lineItems.length,
    latest_eta: null,
  });

  summary.all_ready = summary.total_line_count > 0 && summary.ready_line_count === summary.total_line_count;
  return summary;
}

router.get('/', async (req, res) => {
  const vendorId = req.seller.vendor_id;
  const poData = await zoho.getPurchaseOrders({
    page: 1,
    per_page: 200,
    ...(vendorId ? { vendor_id: vendorId } : {}),
  });

  let shipments = [];
  let shipmentSync = {
    ok: true,
    error: '',
    organization_id: zoho.orgId,
  };

  try {
    const shipmentData = await zoho.getShipmentModule();
    shipments = toShipmentRows(shipmentData).map(normalizeShipment);
  } catch (err) {
    shipmentSync = {
      ok: false,
      error: err.message || 'Shipment module sync failed',
      organization_id: zoho.orgId,
    };
  }

  const purchaseOrders = (poData.purchaseorders || [])
    .filter(po => po.status !== 'draft')
    .map(mergeLocalStatus);

  const eligibleSummaries = purchaseOrders
    .map(po => {
      const poRefs = new Set([
        po.purchaseorder_id,
        po.purchaseorder_number,
        po.reference_number,
      ].filter(Boolean).map(value => normalizeValue(value)));
      const matchedShipments = shipments.filter(shipment =>
        [...shipment.refs].some(ref => poRefs.has(normalizeValue(ref)))
      );
      return {
        po,
        matchedShipments,
        eligible: ['accepted', 'dispatched'].includes(po.local_status) || matchedShipments.length > 0,
      };
    })
    .filter(entry => entry.eligible && getEffectiveStatus(entry.po) !== 'rejected');

  const detailedEntries = await Promise.all(
    eligibleSummaries.map(async entry => {
      try {
        const detailData = await zoho.getPurchaseOrderById(entry.po.purchaseorder_id);
        return {
          ...entry,
          po: mergeLocalStatus(detailData.purchaseorder || entry.po),
        };
      } catch {
        return entry;
      }
    })
  );

  const dispatchRows = detailedEntries
    .map(({ po, matchedShipments }) => {
      const effectiveStatus = getEffectiveStatus(po);
      const rtdSummary = summarizeRTD(po);
      const latestShipment = matchedShipments
        .slice()
        .sort((a, b) => String(b.shipment_date || '').localeCompare(String(a.shipment_date || '')))[0] || null;

      const dispatchStatus = matchedShipments.length > 0
        ? 'shipment_synced'
        : rtdSummary.all_ready
          ? 'ready_to_dispatch'
          : rtdSummary.ready_line_count > 0
            ? 'partially_ready'
            : 'awaiting_rtd';

      return {
        po_id: po.purchaseorder_id,
        po_number: po.purchaseorder_number,
        reference_number: po.reference_number || '',
        vendor_name: po.vendor_name || '',
        vendor_id: po.vendor_id || '',
        effective_status: effectiveStatus,
        dispatch_status: dispatchStatus,
        line_count: Array.isArray(po.line_items) ? po.line_items.length : 0,
        rtd_summary: rtdSummary,
        shipment_count: matchedShipments.length,
        latest_shipment: latestShipment,
        shipments: matchedShipments,
        last_updated_at: latestShipment?.shipment_date || po.last_modified_time || po.date || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.last_updated_at || '').localeCompare(String(a.last_updated_at || '')));

  res.json({
    success: true,
    organization_id: zoho.orgId,
    shipment_sync: shipmentSync,
    dispatches: dispatchRows,
  });
});

module.exports = router;
