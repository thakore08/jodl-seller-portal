const express  = require('express');
const whatsapp = require('../services/whatsappService');
const zoho     = require('../services/zohoBooksService');
const sellers  = require('../data/sellers');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// ─── GET /api/whatsapp/webhook — Meta verification handshake ──────────────────
router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const result = whatsapp.verifyWebhook(mode, token, challenge);
  if (result.valid) {
    console.log('[WhatsApp] Webhook verified ✓');
    return res.status(200).send(result.challenge);
  }
  return res.status(403).json({ error: true, message: 'Webhook verification failed' });
});

// ─── POST /api/whatsapp/webhook — Incoming messages ──────────────────────────
router.post('/webhook', async (req, res) => {
  // Acknowledge immediately (Meta requires 200 within 20 seconds)
  res.sendStatus(200);

  const message = whatsapp.parseWebhookMessage(req.body);
  if (!message) return;

  console.log('[WhatsApp] Incoming message:', JSON.stringify(message, null, 2));

  // Handle interactive button replies (Accept / Reject PO)
  if (message.type === 'interactive' && message.action && message.poId) {
    // Find the seller by their WhatsApp number
    const seller = sellers.find(s => s.whatsapp_number === `+${message.from}` || s.phone === `+${message.from}`);

    if (!seller) {
      console.warn('[WhatsApp] No seller found for number:', message.from);
      return;
    }

    try {
      if (message.action === 'accept') {
        await zoho.acceptPurchaseOrder(message.poId);
        await whatsapp.sendTextMessage(`+${message.from}`, `✅ PO *${message.poId}* has been accepted. You can now submit your invoice via the seller portal.`);
        console.log(`[WhatsApp] PO ${message.poId} accepted by ${message.from}`);
      } else if (message.action === 'reject') {
        await zoho.rejectPurchaseOrder(message.poId, 'Rejected via WhatsApp');
        await whatsapp.sendTextMessage(`+${message.from}`, `❌ PO *${message.poId}* has been rejected.`);
        console.log(`[WhatsApp] PO ${message.poId} rejected by ${message.from}`);
      }
    } catch (err) {
      console.error('[WhatsApp] Failed to process PO action:', err.message);
      await whatsapp.sendTextMessage(`+${message.from}`, `⚠️ Could not process your request for PO *${message.poId}*. Please use the seller portal.`).catch(() => {});
    }
  }
});

// ─── POST /api/whatsapp/send-test (auth required) ────────────────────────────
router.post('/send-test', authenticate, async (req, res) => {
  const { to, message } = req.body;
  const recipient = to || req.seller.whatsapp_number;

  if (!recipient) {
    return res.status(400).json({ error: true, message: 'Phone number required' });
  }

  const result = await whatsapp.sendTextMessage(
    recipient,
    message || `👋 Hello from JODL Seller Portal! Your WhatsApp notifications are active.`
  );

  res.json({ success: true, result });
});

// ─── GET /api/whatsapp/status (auth required) ────────────────────────────────
router.get('/status', authenticate, (req, res) => {
  res.json({
    configured:    whatsapp.isConfigured,
    phoneNumberId: whatsapp.isConfigured ? whatsapp.phoneNumberId : null,
    sellerNumber:  req.seller.whatsapp_number || null,
    notifications: req.seller.notifications || {},
  });
});

// ─── POST /api/whatsapp/update-settings (auth required) ──────────────────────
router.post('/update-settings', authenticate, (req, res) => {
  const { whatsapp_number, whatsapp_enabled, notifications } = req.body;
  const seller = sellers.find(s => s.id === req.seller.id);

  if (!seller) return res.status(404).json({ error: true, message: 'Seller not found' });

  if (whatsapp_number !== undefined) seller.whatsapp_number   = whatsapp_number;
  if (whatsapp_enabled !== undefined) seller.whatsapp_enabled = whatsapp_enabled;
  if (notifications    !== undefined) seller.notifications    = { ...seller.notifications, ...notifications };

  const { password: _pw, ...safeSellerData } = seller;
  res.json({ success: true, seller: safeSellerData });
});

module.exports = router;
