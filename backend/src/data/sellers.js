/**
 * In-memory seller store.
 * In production, replace with a real database (PostgreSQL, MongoDB, etc.)
 *
 * Each seller maps to a Zoho Books vendor_id.
 * Set vendor_id to the actual Zoho Books vendor/contact ID for each seller.
 */
const bcrypt = require('bcryptjs');

const sellers = [
  {
    id: '1',
    email: 'seller@demo.com',
    password: bcrypt.hashSync('password123', 10),
    name: 'Demo Seller',
    company: 'Demo Supplies Pvt Ltd',
    vendor_id: '', // ← Set to actual Zoho Books contact/vendor ID
    phone: '+919876543210',
    whatsapp_enabled: true,
    whatsapp_number: '+919876543210',
    notifications: {
      new_po: true,
      po_updated: true,
      invoice_posted: true,
    },
  },
];

module.exports = sellers;
