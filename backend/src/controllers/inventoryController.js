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

// GET /api/inventory/production
// All CM vendors → POs → line items with production control status
// Used by the Production tab in CM Inventory page
async function getProductionView(_req, res) {
  const sql = `
    SELECT
      v.id                             AS vendor_id,
      v.name                           AS vendor_name,
      po.id                            AS po_id,
      po.po_number,
      po.zoho_po_id,
      po.zoho_status,
      po.status                        AS cm_status,
      po.po_date,
      pli.id                           AS po_line_item_id,
      pli.po_item_id,
      pli.description,
      pli.po_qty,
      pli.unit_price,
      COALESCE(pc.planned_qty, 0)      AS planned_qty,
      COALESCE(pc.actual_qty,  0)      AS actual_qty,
      COALESCE(b.billed_qty,   0)      AS billed_qty,
      (pli.po_qty - COALESCE(pc.actual_qty, 0))  AS remaining_qty
    FROM cm_vendors v
    JOIN cm_purchase_orders po    ON po.vendor_id = v.id
    JOIN cm_po_line_items pli     ON pli.po_id = po.id
    LEFT JOIN cm_production_control pc ON pc.po_line_item_id = pli.id
    LEFT JOIN (
      SELECT po_line_item_id, SUM(billed_qty) AS billed_qty
      FROM   cm_bills
      WHERE  status IN ('open', 'paid')
      GROUP  BY po_line_item_id
    ) b ON b.po_line_item_id = pli.id
    WHERE v.is_contract_manufacturer = true
    ORDER BY v.name, po.po_number, pli.po_item_id
  `;

  try {
    const { rows } = await pool.query(sql);

    // Group by vendor → PO → line items
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.vendor_id]) {
        grouped[row.vendor_id] = {
          vendor_id:   row.vendor_id,
          vendor_name: row.vendor_name,
          pos:         {},
        };
      }
      const vendor = grouped[row.vendor_id];
      if (!vendor.pos[row.po_id]) {
        vendor.pos[row.po_id] = {
          po_id:       row.po_id,
          po_number:   row.po_number,
          zoho_po_id:  row.zoho_po_id,
          zoho_status: row.zoho_status,
          cm_status:   row.cm_status,
          po_date:     row.po_date,
          line_items:  [],
        };
      }
      vendor.pos[row.po_id].line_items.push({
        po_line_item_id: row.po_line_item_id,
        po_item_id:      row.po_item_id,
        description:     row.description,
        po_qty:          Number(row.po_qty),
        unit_price:      Number(row.unit_price),
        planned_qty:     Number(row.planned_qty),
        actual_qty:      Number(row.actual_qty),
        billed_qty:      Number(row.billed_qty),
        remaining_qty:   Number(row.remaining_qty),
      });
    }

    // Convert nested objects to arrays
    const data = Object.values(grouped).map(v => ({
      ...v,
      pos: Object.values(v.pos),
    }));

    res.json({ success: true, data });
  } catch (err) {
    console.error('[DB] getProductionView error:', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
}

module.exports = { getInventorySummary, getInventoryDetail, getProductionView };
