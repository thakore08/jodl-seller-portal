/**
 * WhatsApp Session Service
 *
 * Manages per-vendor WhatsApp conversation sessions.
 * Sessions track the state of a vendor through the PO → invoice workflow.
 *
 * Key: phone number WITHOUT leading '+' (e.g. "917738305384")
 * Session states:
 *   awaiting_po_response     — PO notification sent, waiting for accept/reject
 *   awaiting_rejection_reason — PO rejected, waiting for reason text
 *   awaiting_po_selection    — Multiple open POs, waiting for vendor to select one
 *   awaiting_invoice         — PO accepted, waiting for invoice document
 *   invoice_uploaded         — Invoice received and processed
 *   completed                — Workflow finished
 *   expired                  — Session timed out (>48h)
 */

'use strict';

const EXPIRY_MS = (parseInt(process.env.SESSION_EXPIRY_HOURS || '48', 10)) * 60 * 60 * 1000;

/** @type {Map<string, SessionRecord>} */
const sessions = new Map();

/**
 * @typedef {Object} SessionRecord
 * @property {string}      phone          - Phone number without +
 * @property {string}      sellerId       - Seller ID from sellers.js
 * @property {string}      state          - Current workflow state
 * @property {string|null} poId           - Zoho Books PO ID
 * @property {string|null} poNumber       - Human-readable PO number
 * @property {string|null} selectedPoId   - Selected PO ID when vendor has multiple
 * @property {string|null} invoiceId      - WA invoice record ID (Phase 3)
 * @property {string}      createdAt      - ISO timestamp
 * @property {string}      updatedAt      - ISO timestamp
 * @property {number}      expiresAt      - Unix ms timestamp
 */

/**
 * Creates a new session for a phone number.
 * Overwrites any existing session for that phone.
 *
 * @param {string} phone   - Phone without '+'
 * @param {Object} data    - { sellerId, poId, poNumber, state? }
 * @returns {SessionRecord}
 */
function createSession(phone, { sellerId, poId, poNumber, state = 'awaiting_po_response' }) {
  const now = new Date().toISOString();
  const session = {
    phone,
    sellerId,
    state,
    poId:          poId   || null,
    poNumber:      poNumber || null,
    selectedPoId:  null,
    invoiceId:     null,
    createdAt:     now,
    updatedAt:     now,
    expiresAt:     Date.now() + EXPIRY_MS,
  };
  sessions.set(phone, session);
  console.log(`[WhatsApp Session] phone:${phone} | created → ${state}`);
  return session;
}

/**
 * Retrieves an existing session. Returns null if not found or expired.
 *
 * @param {string} phone
 * @returns {SessionRecord|null}
 */
function getSession(phone) {
  const session = sessions.get(phone);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    session.state = 'expired';
    sessions.set(phone, session);
    return session;
  }

  return session;
}

/**
 * Updates fields on an existing session.
 *
 * @param {string} phone
 * @param {Partial<SessionRecord>} patch
 * @returns {SessionRecord|null}
 */
function updateSession(phone, patch) {
  const session = sessions.get(phone);
  if (!session) return null;

  const oldState = session.state;
  Object.assign(session, patch, { updatedAt: new Date().toISOString() });
  sessions.set(phone, session);

  if (patch.state && patch.state !== oldState) {
    console.log(`[WhatsApp Session] phone:${phone} | ${oldState} → ${patch.state}`);
  }

  return session;
}

/**
 * Removes a session entirely.
 *
 * @param {string} phone
 */
function clearSession(phone) {
  sessions.delete(phone);
  console.log(`[WhatsApp Session] phone:${phone} | session cleared`);
}

/**
 * Returns all active (non-expired) sessions.
 * @returns {SessionRecord[]}
 */
function getAllSessions() {
  return Array.from(sessions.values()).filter(s => Date.now() <= s.expiresAt);
}

/**
 * Cleanup cron — removes sessions older than their expiry time.
 * Runs every hour.
 */
const _cleanupTimer = setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [phone, session] of sessions) {
    if (now > session.expiresAt) {
      sessions.delete(phone);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[WhatsApp Session] Cleanup: removed ${cleaned} expired session(s).`);
  }
}, 60 * 60 * 1000);

if (_cleanupTimer.unref) _cleanupTimer.unref();

module.exports = { createSession, getSession, updateSession, clearSession, getAllSessions };
