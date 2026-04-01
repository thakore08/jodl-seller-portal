/**
 * PO Attachments Store
 *
 * Persists bill PDF and Zoho invoice PDF metadata per PO ID.
 * Written to ./uploads/po_attachments.json on every mutation,
 * loaded from disk on require.
 *
 * Shape: { [poId]: { bill?: AttachmentMeta, invoice?: AttachmentMeta } }
 *
 * AttachmentMeta (bill):
 *   { filename, originalName, size, uploadedAt }
 * AttachmentMeta (invoice):
 *   { filename, invoiceId, invoiceNumber, size, createdAt }
 */

const fs   = require('fs');
const path = require('path');

const PERSIST_FILE = path.join(
  process.env.UPLOAD_DIR || './uploads',
  'po_attachments.json'
);

function _load() {
  try {
    if (fs.existsSync(PERSIST_FILE)) {
      return JSON.parse(fs.readFileSync(PERSIST_FILE, 'utf8'));
    }
  } catch {}
  return {};
}

function _save(data) {
  try {
    fs.writeFileSync(PERSIST_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('[poAttachments] Could not persist attachments:', err.message);
  }
}

let store = _load();

/** Store or overwrite the purchase bill attachment for a PO. */
function setBillAttachment(poId, meta) {
  if (!store[poId]) store[poId] = {};
  store[poId].bill = meta;
  _save(store);
}

/** Store or overwrite the Zoho invoice attachment for a PO. */
function setInvoiceAttachment(poId, meta) {
  if (!store[poId]) store[poId] = {};
  store[poId].invoice = meta;
  _save(store);
}

/** Return { bill?, invoice? } for a PO (empty object if none). */
function getAttachments(poId) {
  return store[poId] || {};
}

module.exports = { setBillAttachment, setInvoiceAttachment, getAttachments };
