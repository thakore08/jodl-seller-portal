/**
 * NotificationService — unified entry point for all 6 WhatsApp notification templates.
 *
 * Wraps whatsappService.js methods with a template registry so route handlers
 * (both auto-triggers and manual admin triggers) can call a single function.
 *
 * Template keys:
 *   po_issued          → T1 (already live via triggerPONotification)
 *   material_readiness → T2 (auto: on accept)
 *   shipment_planned   → T3 (manual only)
 *   update_invoice     → T4 (auto: 30s after accept)
 *   bill_payout        → T5 (auto: on bill paid)
 *   adhoc              → T6 (manual only, plain text)
 */
const whatsapp = require('./whatsappService');
const { sellers } = require('../data/sellers');

/**
 * Resolves the seller object for a given PO and validates WhatsApp is configured.
 * Returns { seller, phone } or throws with a descriptive message.
 */
function resolveSeller(sellerId, vendorId) {
  let seller;
  if (sellerId) {
    seller = sellers.find(s => s.id === sellerId || s.id === String(sellerId));
  }
  if (!seller && vendorId) {
    seller = sellers.find(s => s.vendor_id === vendorId);
  }
  if (!seller) throw Object.assign(new Error('Seller not found'), { status: 404 });
  if (!seller.whatsapp_enabled) throw Object.assign(new Error('Seller WhatsApp is disabled'), { status: 422 });
  if (!seller.whatsapp_number) throw Object.assign(new Error('Seller has no WhatsApp number'), { status: 422 });
  return { seller, phone: seller.whatsapp_number };
}

/**
 * Send a notification using the given template key.
 *
 * @param {string} templateKey  - One of the 6 template keys above
 * @param {Object} context      - { poId, poNumber, sellerId?, vendorId?, lineItems?, bills?, payload? }
 *   payload is template-specific extra data (e.g. vehicleNumber for T3, message for T6)
 * @returns {Promise<{ messageId: string }>}
 */
async function sendTemplate(templateKey, context) {
  if (!whatsapp.isConfigured) {
    throw Object.assign(new Error('WhatsApp not configured'), { status: 503 });
  }

  const { poId, poNumber, sellerId, vendorId, lineItems, bills, payload = {} } = context;
  const { seller, phone } = resolveSeller(sellerId, vendorId);

  const frontendUrl = process.env.FRONTEND_URL || 'https://jodl-seller-portal.onrender.com';
  const poUrl = await whatsapp._shortenUrl(`${frontendUrl}/purchase-orders/${poId}`);

  let result;

  switch (templateKey) {
    case 'po_issued':
      result = await whatsapp.sendPONotification({
        to: phone,
        poNumber,
        amount:       payload.amount || 0,
        currency:     payload.currency || 'INR',
        deliveryDate: payload.deliveryDate || '',
        poId,
        itemCount:    (lineItems || []).length,
      });
      break;

    case 'material_readiness':
      result = await whatsapp.sendMaterialReadinessRequest({ to: phone, poNumber, poId, poUrl });
      break;

    case 'shipment_planned':
      result = await whatsapp.sendShipmentPlannedDetails({
        to:              phone,
        poNumber,
        poUrl,
        vehicleNumber:   payload.vehicleNumber   || 'TBD',
        arrivalDatetime: payload.arrivalDatetime  || 'TBD',
        loadingPlan:     payload.loadingPlan      || [],
      });
      break;

    case 'update_invoice':
      result = await whatsapp.sendInvoiceUpdateRequest({ to: phone, poNumber, poId, poUrl });
      break;

    case 'bill_payout': {
      const billList   = bills || payload.bills || [];
      const totalPaid  = payload.totalPaid  ?? billList.reduce((s, b) => s + Number(b.amount || 0), 0);
      const outstanding = payload.outstanding ?? 0;
      result = await whatsapp.sendBillPayoutDetails({ to: phone, poNumber, poUrl, bills: billList, totalPaid, outstanding });
      break;
    }

    case 'adhoc':
      if (!payload.message) throw Object.assign(new Error('payload.message is required for adhoc template'), { status: 400 });
      result = await whatsapp.sendTextMessage(phone, payload.message);
      break;

    default:
      throw Object.assign(new Error(`Unknown template key: ${templateKey}`), { status: 400 });
  }

  const messageId = result?.messages?.[0]?.id || result?.message_id || null;
  console.log(`[NotificationService] template=${templateKey} poId=${poId} seller=${seller.id} messageId=${messageId}`);
  return { messageId, seller };
}

module.exports = { sendTemplate, resolveSeller };
