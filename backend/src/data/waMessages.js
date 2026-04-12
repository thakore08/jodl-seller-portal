/**
 * Persistent WhatsApp message log.
 * Stores all inbound and outbound messages to/from sellers.
 *
 * Storage strategy (priority order):
 *  1. MongoDB Atlas — when MONGODB_URI env var is set (production on Render.com).
 *     Survives container restarts AND new deployments (Render ephemeral filesystem).
 *  2. JSON file fallback — when MONGODB_URI is NOT set (local dev).
 *     Uses backend/uploads/wa_messages.json. No local dev breakage.
 *
 * Both logMessage() and getMessagesByPhone() are async.
 *
 * Shape of each message record:
 * {
 *   id:        string,
 *   direction: 'in' | 'out',
 *   phone:     string (without '+'),
 *   body:      string,
 *   timestamp: ISO string,
 *   msgId?:    string (Meta message ID),
 *   type?:     string (text | interactive | document | image | …),
 * }
 */
const fs   = require('fs');
const path = require('path');

// ─── JSON file fallback (local dev) ──────────────────────────────────────────
// Resolve path relative to this file's location so it works regardless of cwd.
// Resolves to:  backend/src/data/../../uploads/wa_messages.json  →  backend/uploads/wa_messages.json
const UPLOAD_DIR  = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(__dirname, '../../uploads');
const STORE_FILE  = path.join(UPLOAD_DIR, 'wa_messages.json');

// Ensure the directory exists
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

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
    console.warn('[WAMessages] Failed to save to file:', err.message);
  }
}

_load();

// ─── MongoDB Atlas connection (lazy singleton) ────────────────────────────────
let _col = null;

async function _getCollection() {
  if (_col) return _col;
  const uri = process.env.MONGODB_URI;
  if (!uri) return null; // no MongoDB configured — fall back to JSON file
  try {
    const { MongoClient, ServerApiVersion } = require('mongodb');
    const client = new MongoClient(uri, {
      serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
    });
    await client.connect();
    _col = client.db('jodl').collection('wa_messages');
    console.log('[WAMessages] Connected to MongoDB Atlas');
    return _col;
  } catch (err) {
    console.error('[WAMessages] MongoDB connection failed — falling back to file:', err.message);
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

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
 * @returns {Promise<object|null>}
 */
async function logMessage({ direction, phone, body, timestamp, msgId, type }) {
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

  try {
    const col = await _getCollection();
    if (col) {
      await col.insertOne(entry);
    } else {
      // Local dev: store in memory + persist to JSON file
      messages.push(entry);
      _save();
    }
  } catch (err) {
    console.error('[WAMessages] Failed to persist message:', err.message);
    // Last-resort fallback: at least keep it in memory for this process lifetime
    try { messages.push(entry); _save(); } catch (_) {}
  }

  console.log(`[WAMessages] Logged ${direction} message from/to ${entry.phone}: "${(entry.body || '').slice(0, 60)}"`);
  return entry;
}

/**
 * Return all messages to/from the given phone number, oldest first.
 *
 * @param {string} phone - with or without leading '+'
 * @returns {Promise<Array>}
 */
async function getMessagesByPhone(phone) {
  const normalized = phone.replace(/^\+/, '');
  try {
    const col = await _getCollection();
    if (col) {
      return col.find({ phone: normalized }).sort({ timestamp: 1 }).toArray();
    }
  } catch (err) {
    console.error('[WAMessages] MongoDB read failed — falling back to file:', err.message);
  }
  // File / in-memory fallback
  return messages
    .filter(m => m.phone === normalized)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

module.exports = { logMessage, getMessagesByPhone };
