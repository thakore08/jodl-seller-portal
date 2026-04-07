/**
 * Persistent WhatsApp message log.
 * Stores all inbound and outbound messages to/from sellers in a JSON file.
 *
 * Shape:
 * [
 *   {
 *     id:        string,
 *     direction: 'in' | 'out',
 *     phone:     string (without '+'),
 *     body:      string,
 *     timestamp: ISO string,
 *     msgId?:    string (Meta message ID),
 *     type?:     string (text | interactive | document | image | …),
 *   },
 *   …
 * ]
 */
const fs   = require('fs');
const path = require('path');

// Resolve path relative to this file's location so it works regardless of cwd.
// Resolves to:  backend/src/data/../../uploads/wa_messages.json  →  backend/uploads/wa_messages.json
const UPLOAD_DIR  = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(__dirname, '../../uploads');
const STORE_FILE  = path.join(UPLOAD_DIR, 'wa_messages.json');

// Ensure the directory exists
if (!require('fs').existsSync(UPLOAD_DIR)) require('fs').mkdirSync(UPLOAD_DIR, { recursive: true });

let messages = [];

function _load() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf8');
      messages = JSON.parse(raw);
    }
  } catch {
    messages = [];
  }
}

function _save() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(messages, null, 2));
  } catch (err) {
    console.warn('[WAMessages] Failed to save:', err.message);
  }
}

_load();

/**
 * Record a WhatsApp message (in or out).
 *
 * @param {object} opts
 * @param {'in'|'out'} opts.direction
 * @param {string}  opts.phone      - with or without leading '+'
 * @param {string}  opts.body       - human-readable message text
 * @param {string}  [opts.timestamp]- ISO string; defaults to now
 * @param {string}  [opts.msgId]    - Meta message ID
 * @param {string}  [opts.type]     - 'text', 'interactive', etc.
 */
function logMessage({ direction, phone, body, timestamp, msgId, type }) {
  if (!phone) {
    console.warn('[WAMessages] logMessage called with missing phone — skipping');
    return null;
  }
  const entry = {
    id:        `wa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    direction,
    phone:     String(phone).replace(/^\+/, ''),
    body:      body || '',
    timestamp: timestamp || new Date().toISOString(),
  };
  if (msgId) entry.msgId = msgId;
  if (type)  entry.type  = type;

  messages.push(entry);
  _save();
  console.log(`[WAMessages] Logged ${direction} message from/to ${entry.phone}: "${(entry.body || '').slice(0, 60)}"`);
  return entry;
}

/**
 * Return all messages to/from the given phone number, oldest first.
 *
 * @param {string} phone - with or without leading '+'
 */
function getMessagesByPhone(phone) {
  const normalized = phone.replace(/^\+/, '');
  return messages
    .filter(m => m.phone === normalized)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

module.exports = { logMessage, getMessagesByPhone };
