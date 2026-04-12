const pool        = require('../db/pool');
const zohoService = require('../services/zohoBooksService');

/**
 * POST /api/inventory/sync
 *
 * For every CM vendor that has a zoho_vendor_id set:
 *  1. Fetch all open/issued POs from Zoho Books for that vendor
 *  2. Upsert each PO into cm_purchase_orders (keyed on zoho_po_id)
 *  3. Upsert each line item into cm_po_line_items (keyed on zoho_line_item_id)
 *
 * Safe to call repeatedly — uses ON CONFLICT DO UPDATE.
 */
async function syncCMVendorPOs(req, res) {
  // 1. Get all CM vendors with a Zoho vendor ID
  let cmVendors;
  try {
    const { rows } = await pool.query(
      `SELECT id, name, zoho_vendor_id
       FROM cm_vendors
       WHERE is_contract_manufacturer = true
         AND zoho_vendor_id IS NOT NULL AND zoho_vendor_id <> ''`
    );
    cmVendors = rows;
  } catch (err) {
    console.error('[Sync] DB error fetching CM vendors:', err.message);
    return res.status(500).json({ success: false, error: 'Database error fetching vendors' });
  }

  if (cmVendors.length === 0) {
    return res.json({
      success: true,
      message: 'No CM vendors with Zoho IDs configured. Add vendors in Config tab.',
      synced: [],
    });
  }

  const results = [];
  const errors  = [];

  for (const vendor of cmVendors) {
    try {
      // 2. Fetch all POs for this vendor from Zoho (open + issued statuses)
      const zohoResp = await zohoService.getPurchaseOrders({
        vendor_id: vendor.zoho_vendor_id,
      });

      const zohoPOs = zohoResp?.purchaseorders || [];
      let posUpserted = 0;
      let lineItemsUpserted = 0;

      for (const zPO of zohoPOs) {
        // Determine our internal status
        const cmStatus = mapZohoStatus(zPO.status);

        // 3. Upsert the PO
        let cmPoId;
        try {
          const poResult = await pool.query(
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
              zPO.purchaseorder_number,
              vendor.id,
              zPO.purchaseorder_id,
              zPO.status,
              cmStatus,
              zPO.date || null,
            ]
          );
          cmPoId = poResult.rows[0].id;
          posUpserted++;
        } catch (err) {
          console.error('[Sync] PO upsert error:', err.message, '| PO:', zPO.purchaseorder_number);
          errors.push(`PO ${zPO.purchaseorder_number}: ${err.message}`);
          continue;
        }

        // 4. Fetch full PO detail to get line items
        let poDetail;
        try {
          const detailResp = await zohoService.getPurchaseOrderById(zPO.purchaseorder_id);
          poDetail = detailResp?.purchaseorder;
        } catch (err) {
          console.error('[Sync] PO detail fetch error:', err.message, '| PO:', zPO.purchaseorder_id);
          errors.push(`PO detail ${zPO.purchaseorder_number}: ${err.message}`);
          continue;
        }

        const lineItems = poDetail?.line_items || [];

        for (const li of lineItems) {
          try {
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
                li.line_item_id || null,
                li.line_item_id,
                li.description || li.name || '',
                Math.round(Number(li.quantity) || 0),
                Number(li.rate) || 0,
              ]
            );
            lineItemsUpserted++;
          } catch (err) {
            console.error('[Sync] Line item upsert error:', err.message, '| item:', li.line_item_id);
            errors.push(`Line item ${li.line_item_id}: ${err.message}`);
          }
        }
      }

      results.push({
        vendor_name:       vendor.name,
        zoho_vendor_id:    vendor.zoho_vendor_id,
        pos_found:         zohoPOs.length,
        pos_upserted:      posUpserted,
        line_items_upserted: lineItemsUpserted,
      });
    } catch (err) {
      console.error('[Sync] Vendor sync error:', err.message, '| vendor:', vendor.name);
      errors.push(`Vendor ${vendor.name}: ${err.message}`);
    }
  }

  return res.json({
    success: errors.length === 0,
    message: errors.length === 0
      ? `Sync complete. ${results.reduce((s, r) => s + r.pos_upserted, 0)} POs, ${results.reduce((s, r) => s + r.line_items_upserted, 0)} line items synced.`
      : `Sync completed with ${errors.length} error(s).`,
    synced: results,
    errors,
  });
}

function mapZohoStatus(zohoStatus) {
  if (!zohoStatus) return 'draft';
  const s = zohoStatus.toLowerCase();
  if (s === 'billed' || s === 'closed') return 'closed';
  if (s === 'open' || s === 'issued' || s === 'accepted') return 'open';
  return 'draft';
}

module.exports = { syncCMVendorPOs };
