/**
 * cmSyncService.js
 *
 * Event-driven helpers that persist CM-related data to the PostgreSQL CM DB
 * whenever key actions happen in the app:
 *
 *   1. PO accepted              → upsertPOToCMDB(po)
 *   2. Production plan saved    → syncProductionPlanned(vendorId, poLineItems, planLines)
 *   3. Actuals updated          → syncProductionActuals(vendorId, poLineItems, planLines)
 *   4. Bill created in Zoho     → syncBillToCMDB(vendorId, billLineItems, bill)
 *
 * All functions are safe to call without await (fire-and-forget with .catch).
 * They silently no-op when the DB is not configured or the vendor is not a CM.
 */

const pool = require('../db/pool');

const isDbConfigured = !!(process.env.DATABASE_URL || process.env.DB_URL);

/** Map Zoho PO status to our internal cm_purchase_orders status */
function mapZohoStatus(zohoStatus) {
  if (!zohoStatus) return 'draft';
  const s = zohoStatus.toLowerCase();
  if (s === 'billed' || s === 'closed') return 'closed';
  if (s === 'open' || s === 'issued' || s === 'accepted') return 'open';
  return 'draft';
}

/**
 * Checks whether a Zoho vendor ID belongs to a configured CM vendor.
 * Returns the cm_vendors row { id } if found, null otherwise.
 */
async function isCMVendor(zohoVendorId) {
  if (!isDbConfigured || !zohoVendorId) return null;
  const { rows } = await pool.query(
    `SELECT id FROM cm_vendors
     WHERE zoho_vendor_id = $1 AND is_contract_manufacturer = true
     LIMIT 1`,
    [zohoVendorId]
  );
  return rows[0] || null;
}

/**
 * Trigger 1 — PO Accepted
 *
 * Upserts the accepted Zoho PO and its line items into the CM DB.
 * Expects `po` to be a full Zoho purchase order object (with line_items).
 */
async function upsertPOToCMDB(po) {
  if (!isDbConfigured) return;

  const vendor = await isCMVendor(po.vendor_id);
  if (!vendor) return;

  const cmStatus = mapZohoStatus(po.status);

  const { rows: [cmPO] } = await pool.query(
    `INSERT INTO cm_purchase_orders
       (po_number, vendor_id, zoho_po_id, zoho_status, status, po_date, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON CONFLICT (zoho_po_id) WHERE zoho_po_id IS NOT NULL DO UPDATE SET
       po_number   = EXCLUDED.po_number,
       zoho_status = EXCLUDED.zoho_status,
       status      = EXCLUDED.status,
       po_date     = EXCLUDED.po_date,
       updated_at  = NOW()
     RETURNING id`,
    [
      po.purchaseorder_number,
      vendor.id,
      po.purchaseorder_id,
      po.status,
      cmStatus,
      po.date || null,
    ]
  );

  const cmPoId = cmPO.id;

  for (const li of po.line_items || []) {
    if (!li.line_item_id) continue;
    await pool.query(
      `INSERT INTO cm_po_line_items
         (po_id, po_item_id, zoho_line_item_id, description, po_qty, unit_price, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (zoho_line_item_id) WHERE zoho_line_item_id IS NOT NULL DO UPDATE SET
         description = EXCLUDED.description,
         po_qty      = EXCLUDED.po_qty,
         unit_price  = EXCLUDED.unit_price,
         updated_at  = NOW()`,
      [
        cmPoId,
        li.line_item_id,
        li.line_item_id,
        li.description || li.name || '',
        Math.round(Number(li.quantity) || 0),
        Number(li.rate) || 0,
      ]
    );
  }

  console.log(`[CMSync] Upserted PO ${po.purchaseorder_number} (${po.purchaseorder_id}) to CM DB`);
}

/**
 * Trigger 2a — Production Plan Saved (planned qty)
 *
 * Syncs `total_planned_qty` for each plan line to cm_production_control.
 * @param {string}   zohoVendorId  - Zoho vendor_id of the PO vendor
 * @param {Array}    poLineItems   - po.line_items from Zoho (indexed array)
 * @param {Array}    planLines     - plan.lines from buildProductionPlan
 */
async function syncProductionPlanned(zohoVendorId, poLineItems, planLines) {
  if (!isDbConfigured) return;

  const vendor = await isCMVendor(zohoVendorId);
  if (!vendor) return;

  for (const planLine of planLines || []) {
    const poItem = (poLineItems || [])[planLine.item_index];
    if (!poItem?.line_item_id) continue;

    const { rows: [cmLI] } = await pool.query(
      `SELECT id FROM cm_po_line_items WHERE zoho_line_item_id = $1 LIMIT 1`,
      [poItem.line_item_id]
    );
    if (!cmLI) continue;

    await pool.query(
      `INSERT INTO cm_production_control
         (po_line_item_id, planned_qty, actual_qty, created_at, updated_at)
       VALUES ($1, $2, 0, NOW(), NOW())
       ON CONFLICT (po_line_item_id) DO UPDATE SET
         planned_qty = EXCLUDED.planned_qty,
         updated_at  = NOW()`,
      [cmLI.id, planLine.total_planned_qty || 0]
    );
  }

  console.log(`[CMSync] Synced planned qty for ${(planLines || []).length} line(s)`);
}

/**
 * Trigger 2b — Production Actuals Updated
 *
 * Syncs `total_actual_qty` for each plan line to cm_production_control.
 * Only updates actual_qty; leaves planned_qty untouched.
 * @param {string}   zohoVendorId  - Zoho vendor_id of the PO vendor
 * @param {Array}    poLineItems   - po.line_items from Zoho (indexed array)
 * @param {Array}    planLines     - plan.lines from buildProductionPlan (with updated totals)
 */
async function syncProductionActuals(zohoVendorId, poLineItems, planLines) {
  if (!isDbConfigured) return;

  const vendor = await isCMVendor(zohoVendorId);
  if (!vendor) return;

  for (const planLine of planLines || []) {
    const poItem = (poLineItems || [])[planLine.item_index];
    if (!poItem?.line_item_id) continue;

    const { rows: [cmLI] } = await pool.query(
      `SELECT id FROM cm_po_line_items WHERE zoho_line_item_id = $1 LIMIT 1`,
      [poItem.line_item_id]
    );
    if (!cmLI) continue;

    await pool.query(
      `INSERT INTO cm_production_control
         (po_line_item_id, planned_qty, actual_qty, created_at, updated_at)
       VALUES ($1, 0, $2, NOW(), NOW())
       ON CONFLICT (po_line_item_id) DO UPDATE SET
         actual_qty = EXCLUDED.actual_qty,
         updated_at = NOW()`,
      [cmLI.id, planLine.total_actual_qty || 0]
    );
  }

  console.log(`[CMSync] Synced actual qty for ${(planLines || []).length} line(s)`);
}

/**
 * Trigger 3 — Bill Created in Zoho Books
 *
 * Syncs billed quantities to cm_bills for each PO line item on the bill.
 * Uses zoho_bill_id + po_line_item_id as the upsert key.
 *
 * @param {string}   zohoVendorId  - po.vendor_id from the PO
 * @param {Array}    billLineItems - billPayload.line_items (must have purchaseorder_line_item_id)
 * @param {object}   bill          - The Zoho bill object from createBill response
 */
async function syncBillToCMDB(zohoVendorId, billLineItems, bill) {
  if (!isDbConfigured) return;

  const vendor = await isCMVendor(zohoVendorId);
  if (!vendor) return;

  const billId   = bill?.bill_id;
  const billDate = bill?.date || null;
  if (!billId) return;

  let synced = 0;
  for (const billLI of billLineItems || []) {
    // purchaseorder_line_item_id links the bill line to the PO line (Zoho line_item_id)
    const zohoLIId = billLI.purchaseorder_line_item_id;
    if (!zohoLIId) continue;

    const { rows: [cmLI] } = await pool.query(
      `SELECT id FROM cm_po_line_items WHERE zoho_line_item_id = $1 LIMIT 1`,
      [zohoLIId]
    );
    if (!cmLI) continue;

    await pool.query(
      `INSERT INTO cm_bills
         (po_line_item_id, billed_qty, status, zoho_bill_id, bill_date, created_at, updated_at)
       VALUES ($1, $2, 'open', $3, $4, NOW(), NOW())
       ON CONFLICT (zoho_bill_id, po_line_item_id) WHERE zoho_bill_id IS NOT NULL DO UPDATE SET
         billed_qty = EXCLUDED.billed_qty,
         status     = EXCLUDED.status,
         bill_date  = EXCLUDED.bill_date,
         updated_at = NOW()`,
      [cmLI.id, billLI.quantity || 0, billId, billDate]
    );
    synced++;
  }

  console.log(`[CMSync] Synced bill ${billId} — ${synced} line(s) to cm_bills`);
}

module.exports = { upsertPOToCMDB, syncProductionPlanned, syncProductionActuals, syncBillToCMDB };
