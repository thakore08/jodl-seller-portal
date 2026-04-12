const pool = require('../db/pool');

// GET /api/inventory/summary
// Per CM vendor, per item description: physical_inventory and planned_inventory
async function getInventorySummary(_req, res) {
  const sql = `
    SELECT
      v.id                                                        AS vendor_id,
      v.name                                                      AS vendor_name,
      pli.description                                             AS item_description,
      COALESCE(SUM(pc.actual_qty), 0)
        - COALESCE(b.billed_qty_sum, 0)                          AS physical_inventory,
      COALESCE(SUM(pc.planned_qty), 0)
        - COALESCE(SUM(pc.actual_qty), 0)                        AS planned_inventory
    FROM cm_vendors v
    JOIN cm_purchase_orders po   ON po.vendor_id = v.id
    JOIN cm_po_line_items pli    ON pli.po_id = po.id
    LEFT JOIN cm_production_control pc
           ON pc.po_line_item_id = pli.id
    LEFT JOIN (
      SELECT po_line_item_id, SUM(billed_qty) AS billed_qty_sum
      FROM   cm_bills
      WHERE  status IN ('open', 'paid')
      GROUP  BY po_line_item_id
    ) b ON b.po_line_item_id = pli.id
    WHERE v.is_contract_manufacturer = true
    GROUP BY v.id, v.name, pli.description, b.billed_qty_sum
    ORDER BY v.name, pli.description
  `;

  try {
    const { rows } = await pool.query(sql);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[DB] getInventorySummary error:', err.message, '| Query:', 'inventory/summary');
    res.status(500).json({ success: false, error: 'Database error' });
  }
}

// GET /api/inventory/detail?vendor_id=uuid
// All PO line items for a CM vendor with full qty breakdown
async function getInventoryDetail(req, res) {
  const { vendor_id } = req.query;

  // Validate vendor is CM
  let vendor;
  try {
    const { rows } = await pool.query(
      'SELECT id, name, is_contract_manufacturer FROM cm_vendors WHERE id = $1',
      [vendor_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }
    if (!rows[0].is_contract_manufacturer) {
      return res.status(400).json({ success: false, error: 'Vendor is not a contract manufacturer' });
    }
    vendor = rows[0];
  } catch (err) {
    console.error('[DB] getInventoryDetail vendor check error:', err.message, '| vendor_id:', vendor_id);
    return res.status(500).json({ success: false, error: 'Database error' });
  }

  const sql = `
    SELECT
      $1::text                                     AS vendor_name,
      po.po_number,
      pli.id                                       AS po_line_item_id,
      pli.po_item_id,
      pli.description,
      pli.po_qty,
      COALESCE(pc.planned_qty, 0)                  AS planned_qty,
      COALESCE(pc.actual_qty, 0)                   AS actual_qty,
      COALESCE(b.billed_qty_sum, 0)                AS billed_qty
    FROM cm_purchase_orders po
    JOIN cm_po_line_items pli    ON pli.po_id = po.id
    LEFT JOIN cm_production_control pc
           ON pc.po_line_item_id = pli.id
    LEFT JOIN (
      SELECT po_line_item_id, SUM(billed_qty) AS billed_qty_sum
      FROM   cm_bills
      WHERE  status IN ('open', 'paid')
      GROUP  BY po_line_item_id
    ) b ON b.po_line_item_id = pli.id
    WHERE po.vendor_id = $2
    ORDER BY po.po_number, pli.po_item_id
  `;

  try {
    const { rows } = await pool.query(sql, [vendor.name, vendor_id]);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[DB] getInventoryDetail error:', err.message, '| vendor_id:', vendor_id);
    res.status(500).json({ success: false, error: 'Database error' });
  }
}

module.exports = { getInventorySummary, getInventoryDetail };
