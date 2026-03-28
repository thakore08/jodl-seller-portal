/**
 * Shared in-memory PO state.
 *
 * Exported as a single module so both purchaseOrders.js and whatsapp.js
 * read/write the same Maps — no circular dependencies.
 *
 * notifiedPoIds is persisted to disk so it survives crashes and manual
 * restarts. On a full deploy (Render wipes the filesystem), the file is
 * gone — a time-based guard in purchaseOrders.js prevents re-notifying
 * POs that are older than PO_NOTIFY_WINDOW_DAYS (default 3 days).
 */

const fs   = require('fs');
const path = require('path');

// ─── Persisted notified PO IDs ────────────────────────────────────────────────
const PERSIST_FILE = path.join(
  process.env.UPLOAD_DIR || './uploads',
  'notified_pos.json'
);

function _load() {
  try {
    if (fs.existsSync(PERSIST_FILE)) {
      const { ids } = JSON.parse(fs.readFileSync(PERSIST_FILE, 'utf8'));
      return new Set(Array.isArray(ids) ? ids : []);
    }
  } catch {}
  return new Set();
}

function _save(set) {
  try {
    fs.writeFileSync(PERSIST_FILE, JSON.stringify({ ids: [...set] }));
  } catch (err) {
    console.warn('[poLocalState] Could not persist notifiedPoIds:', err.message);
  }
}

const notifiedPoIds = _load();

/** Add a PO ID to the notified set and persist to disk immediately. */
function addNotifiedPoId(id) {
  notifiedPoIds.add(id);
  _save(notifiedPoIds);
}

// ─── Other in-memory state ────────────────────────────────────────────────────

// Augmented local status per PO (Zoho's model + JODL extras)
// Key: Zoho PO ID → Value: 'accepted' | 'rejected' | 'dispatched'
const poLocalStatus = new Map();

// Per-line-item delivery dates
// Key: Zoho PO ID → Value: [{ item_id, name, expected_date }]
const poLineDeliveryDates = new Map();

// RTD (Ready-to-Dispatch) data per line item
// Key: Zoho PO ID → Value: { [itemIndex]: RTDEntry }
const poRTDData = new Map();

// Activity log per PO (most-recent-first)
// Key: Zoho PO ID → Value: [{ event, actor, timestamp, details }]
const poActivityLog = new Map();

module.exports = {
  poLocalStatus,
  notifiedPoIds,
  addNotifiedPoId,
  poLineDeliveryDates,
  poRTDData,
  poActivityLog,
};
