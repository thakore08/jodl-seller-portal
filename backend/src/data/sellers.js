/**
 * In-memory seller store.
 * In production, replace with a real database (PostgreSQL, MongoDB, etc.)
 *
 * Each seller maps to a Zoho Books vendor_id.
 * Set vendor_id to the actual Zoho Books vendor/contact ID for each seller.
 *
 * Roles:
 *   seller_admin    — full access (profile, POs, invoices, payments, WhatsApp)
 *   operations_user — PO management (accept/reject, mark in-production/dispatched)
 *   finance_user    — invoice upload + payment visibility
 */
const bcrypt = require('bcryptjs');

const sellers = [
  {
    id: '1',
    email: 'seller@demo.com',
    password: bcrypt.hashSync('password123', 10),
    name: 'Demo Admin',
    company: 'Demo Supplies Pvt Ltd',
    vendor_id: '', // ← Set to actual Zoho Books contact/vendor ID
    role: 'seller_admin',
    phone: '+919876543210',
    whatsapp_enabled: true,
    whatsapp_number: '+919876543210',
    notifications: {
      new_po: true,
      po_updated: true,
      invoice_posted: true,
    },
  },
  {
    id: '2',
    email: 'ops@demo.com',
    password: bcrypt.hashSync('password123', 10),
    name: 'Operations User',
    company: 'Demo Supplies Pvt Ltd',
    vendor_id: '',
    role: 'operations_user',
    phone: '+919876543211',
    whatsapp_enabled: false,
    whatsapp_number: '',
    notifications: {
      new_po: true,
      po_updated: true,
      invoice_posted: false,
    },
  },
  {
    id: '3',
    email: 'finance@demo.com',
    password: bcrypt.hashSync('password123', 10),
    name: 'Finance User',
    company: 'Demo Supplies Pvt Ltd',
    vendor_id: '',
    role: 'finance_user',
    phone: '+919876543212',
    whatsapp_enabled: false,
    whatsapp_number: '',
    notifications: {
      new_po: false,
      po_updated: false,
      invoice_posted: true,
    },
  },
  {
    id: '4',
    email: 'heena@demo.com',
    password: bcrypt.hashSync('password123', 10),
    name: 'Heena Steel User',
    company: 'Heena Steel LLP',
    vendor_id: '1988755000019260007', // Zoho Books vendor ID for Heena Steel LLP (V1333-1356-JODL)
    role: 'seller_admin',
    phone: '+917738305384',
    whatsapp_enabled: true,
    whatsapp_number: '+917738305384',
    notifications: {
      new_po: true,
      po_updated: true,
      invoice_posted: true,
    },
  },
];

/**
 * In-memory password reset tokens.
 * Shape: [{ token: string, sellerId: string, expiresAt: Date }]
 */
const resetTokens = [];

module.exports = { sellers, resetTokens };
