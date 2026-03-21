/**
 * In-memory store for invoices uploaded via WhatsApp.
 *
 * In production, replace with a real database.
 *
 * WA Invoice shape:
 * {
 *   id:               string (uuid)
 *   sellerId:         string
 *   sellerPhone:      string
 *   poId:             string   — Zoho PO ID
 *   poNumber:         string
 *   source:           'whatsapp'
 *   status:           'pending_admin_review' | 'posted' | 'correction_requested'
 *   whatsapp_session_id: string (phone)
 *   filePath:         string   — path relative to uploads dir
 *   originalFilename: string
 *   mimeType:         string
 *   extractedData:    Object | null   — from pdfExtractorService
 *   matchResults:     Array | null    — from invoiceMatchingService
 *   zohobillId:       string | null   — set after posting to Zoho
 *   adminNote:        string | null   — set on correction_requested
 *   createdAt:        string (ISO)
 *   updatedAt:        string (ISO)
 * }
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

/** @type {Map<string, Object>} */
const waInvoices = new Map();

/**
 * Creates a new WA invoice record.
 * @param {Object} data
 * @returns {Object} The created record
 */
function createWaInvoice(data) {
  const id  = uuidv4();
  const now = new Date().toISOString();
  const record = {
    id,
    sellerId:            data.sellerId,
    sellerPhone:         data.sellerPhone,
    poId:                data.poId          || null,
    poNumber:            data.poNumber      || null,
    source:              'whatsapp',
    status:              data.status        || 'pending_admin_review',
    whatsapp_session_id: data.sellerPhone,
    filePath:            data.filePath      || null,
    originalFilename:    data.originalFilename || null,
    mimeType:            data.mimeType      || null,
    extractedData:       data.extractedData || null,
    matchResults:        data.matchResults  || null,
    zohoBillId:          null,
    adminNote:           null,
    createdAt:           now,
    updatedAt:           now,
  };
  waInvoices.set(id, record);
  return record;
}

/**
 * Retrieves a WA invoice by ID.
 * @param {string} id
 * @returns {Object|null}
 */
function getWaInvoice(id) {
  return waInvoices.get(id) || null;
}

/**
 * Updates a WA invoice record.
 * @param {string} id
 * @param {Partial<Object>} patch
 * @returns {Object|null}
 */
function updateWaInvoice(id, patch) {
  const record = waInvoices.get(id);
  if (!record) return null;
  Object.assign(record, patch, { updatedAt: new Date().toISOString() });
  waInvoices.set(id, record);
  return record;
}

/**
 * Lists WA invoices with optional filters.
 * @param {Object} filters - { status?, sellerId? }
 * @returns {Object[]}
 */
function listWaInvoices(filters = {}) {
  const results = [];
  for (const record of waInvoices.values()) {
    if (filters.status   && record.status   !== filters.status)   continue;
    if (filters.sellerId && record.sellerId !== filters.sellerId)  continue;
    results.push(record);
  }
  // Most recent first
  return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = { createWaInvoice, getWaInvoice, updateWaInvoice, listWaInvoices };
