const pool = require('../db/pool');

// PATCH /api/production/:po_line_item_id
// Upsert into cm_production_control
async function upsertProduction(req, res) {
  const { po_line_item_id } = req.params;
  const { planned_qty, actual_qty } = req.body;

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
    console.error('[DB] upsertProduction check error:', err.message, '| id:', po_line_item_id);
    return res.status(500).json({ success: false, error: 'Database error' });
  }

  try {
    // Fetch existing record to preserve fields not being updated
    const existing = await pool.query(
      'SELECT planned_qty, actual_qty FROM cm_production_control WHERE po_line_item_id = $1',
      [po_line_item_id]
    );

    let result;
    if (existing.rows.length === 0) {
      result = await pool.query(
        `INSERT INTO cm_production_control (po_line_item_id, planned_qty, actual_qty, updated_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING *`,
        [
          po_line_item_id,
          planned_qty !== undefined ? planned_qty : 0,
          actual_qty  !== undefined ? actual_qty  : 0,
        ]
      );
    } else {
      const prev = existing.rows[0];
      result = await pool.query(
        `UPDATE cm_production_control
         SET planned_qty = $2, actual_qty = $3, updated_at = NOW()
         WHERE po_line_item_id = $1
         RETURNING *`,
        [
          po_line_item_id,
          planned_qty !== undefined ? planned_qty : prev.planned_qty,
          actual_qty  !== undefined ? actual_qty  : prev.actual_qty,
        ]
      );
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[DB] upsertProduction error:', err.message, '| id:', po_line_item_id);
    res.status(500).json({ success: false, error: 'Database error' });
  }
}

module.exports = { upsertProduction };
