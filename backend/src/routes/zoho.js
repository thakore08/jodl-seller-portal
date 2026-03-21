/**
 * Zoho Books Webhook Route
 *
 * Listens for Zoho Books events and triggers corresponding actions.
 * Currently handles:
 *   - purchaseorder_created  → Send WhatsApp PO notification to vendor
 *   - purchaseorder_issued   → Send WhatsApp PO notification to vendor
 *   - purchaseorder_updated  → Log update (extend as needed)
 *
 * Webhook body from Zoho Books:
 * {
 *   event: 'purchaseorder_created',
 *   data: { purchaseorder: { ... } },
 *   organization_id: '...',
 *   token: '<webhook_secret>'
 * }
 *
 * Register this webhook in Zoho Books:
 *   Settings → Webhooks → New Webhook → URL: POST /api/zoho/webhook
 */

const express   = require('express');
const whatsapp  = require('../services/whatsappService');

const router = express.Router();

// ─── POST /api/zoho/webhook ───────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  // Acknowledge immediately so Zoho doesn't retry
  res.sendStatus(200);

  const body = req.body;

  // ── Optional webhook secret verification ──────────────────────────────────
  const secret = process.env.ZOHO_WEBHOOK_SECRET;
  if (secret && body.token !== secret) {
    console.warn('[Zoho Webhook] Invalid token — ignoring payload');
    return;
  }

  const event = body.event || body.event_type;
  const po    = body.data?.purchaseorder;

  console.log(`[Zoho Webhook] Received event: ${event}`);

  if (!po) {
    console.warn('[Zoho Webhook] No purchaseorder in payload');
    return;
  }

  // ── PO Created or Issued ────────────────────────────────────────────────────
  if (event === 'purchaseorder_created' || event === 'purchaseorder_issued') {
    if (!whatsapp.isConfigured) {
      console.warn('[Zoho Webhook] WhatsApp not configured — skipping notification');
      return;
    }

    try {
      const result = await whatsapp.triggerPONotification(po);
      if (result.sent) {
        console.log(`[Zoho Webhook] PO notification sent for ${po.purchaseorder_number}`);
      } else {
        console.log(`[Zoho Webhook] PO notification skipped: ${result.reason}`);
      }
    } catch (err) {
      console.error('[Zoho Webhook] Failed to send PO notification:', err.message);
    }
    return;
  }

  // ── PO Updated ──────────────────────────────────────────────────────────────
  if (event === 'purchaseorder_updated') {
    console.log(`[Zoho Webhook] PO updated: ${po.purchaseorder_number} (status: ${po.status})`);
    // Extend: notify seller of status changes if needed
    return;
  }

  console.log(`[Zoho Webhook] Unhandled event type: ${event}`);
});

module.exports = router;
