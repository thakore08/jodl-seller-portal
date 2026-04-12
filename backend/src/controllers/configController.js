const pool = require('../db/pool');

// PUT /api/config/cm-vendors
// Sets is_contract_manufacturer = true for given IDs, false for all others
async function setCMVendors(req, res) {
  const { vendor_ids } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Reset all vendors to non-CM
    await client.query(
      'UPDATE cm_vendors SET is_contract_manufacturer = false, updated_at = NOW()'
    );

    // Mark selected vendors as CM
    if (vendor_ids.length > 0) {
      await client.query(
        'UPDATE cm_vendors SET is_contract_manufacturer = true, updated_at = NOW() WHERE id = ANY($1::uuid[])',
        [vendor_ids]
      );
    }

    await client.query('COMMIT');

    const { rows } = await client.query(
      'SELECT id, name, zoho_vendor_id, is_contract_manufacturer, created_at, updated_at FROM cm_vendors ORDER BY name'
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[DB] setCMVendors error:', err.message, '| vendor_ids:', vendor_ids);
    res.status(500).json({ success: false, error: 'Database error' });
  } finally {
    client.release();
  }
}

// GET /api/config/cm-vendors
async function getCMVendors(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, zoho_vendor_id, is_contract_manufacturer, created_at, updated_at FROM cm_vendors ORDER BY name'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[DB] getCMVendors error:', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
}

// POST /api/config/cm-vendors
// Create a new vendor record
async function createVendor(req, res) {
  const { name, zoho_vendor_id } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO cm_vendors (name, zoho_vendor_id, is_contract_manufacturer, created_at, updated_at)
       VALUES ($1, $2, false, NOW(), NOW())
       RETURNING id, name, zoho_vendor_id, is_contract_manufacturer, created_at, updated_at`,
      [name, zoho_vendor_id || null]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[DB] createVendor error:', err.message, '| name:', name);
    res.status(500).json({ success: false, error: 'Database error' });
  }
}

module.exports = { setCMVendors, getCMVendors, createVendor };
