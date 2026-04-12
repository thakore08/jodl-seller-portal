const pool = require('../db/pool');

const VALID_STATUSES = ['draft', 'open', 'paid'];

// POST /api/bills
async function createBill(req, res) {
  const { po_line_item_id, billed_qty, status } = req.body;

  // Confirm line item exists
  try {
    const { rows } = await pool.query(
      'SELECT id FROM cm_po_line_items WHERE id = $1',
      [po_line_item_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'PO line item not found' });
    }
  } catch (err) {
    console.error('[DB] createBill check error:', err.message, '| po_line_item_id:', po_line_item_id);
    return res.status(500).json({ success: false, error: 'Database error' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO cm_bills (po_line_item_id, billed_qty, status, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING *`,
      [po_line_item_id, billed_qty, status]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[DB] createBill error:', err.message, '| po_line_item_id:', po_line_item_id);
    res.status(500).json({ success: false, error: 'Database error' });
  }
}

module.exports = { createBill };
