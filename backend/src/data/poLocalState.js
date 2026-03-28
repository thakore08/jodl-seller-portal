/**
 * Shared in-memory PO state.
 *
 * Exported as a single module so both purchaseOrders.js and whatsapp.js
 * read/write the same Maps — no circular dependencies.
 */

// Augmented local status per PO (Zoho's model + JODL extras)
// Key: Zoho PO ID → Value: 'accepted' | 'rejected' | 'dispatched'
const poLocalStatus = new Map();

// PO IDs for which a WhatsApp notification has already been sent this session
const notifiedPoIds = new Set();

// Per-line-item delivery dates
// Key: Zoho PO ID → Value: [{ item_id, name, expected_date }]
const poLineDeliveryDates = new Map();

// RTD (Ready-to-Dispatch) data per line item
// Key: Zoho PO ID → Value: { [itemIndex]: RTDEntry }
const poRTDData = new Map();

// Activity log per PO (most-recent-first)
// Key: Zoho PO ID → Value: [{ event, actor, timestamp, details }]
const poActivityLog = new Map();

module.exports = { poLocalStatus, notifiedPoIds, poLineDeliveryDates, poRTDData, poActivityLog };
