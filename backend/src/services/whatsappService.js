/**
 * WhatsApp Business Cloud API Service (Meta Graph API)
 *
 * Handles:
 *  1. Sending PO notifications to sellers with Accept/Reject buttons
 *  2. Sending invoice confirmation messages
 *  3. Parsing incoming webhook messages (button replies)
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */
const axios = require('axios');

class WhatsAppService {
  constructor() {
    this.phoneNumberId  = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.accessToken    = process.env.WHATSAPP_ACCESS_TOKEN;
    this.apiVersion     = process.env.WHATSAPP_API_VERSION || 'v19.0';
    this.verifyToken    = process.env.WHATSAPP_VERIFY_TOKEN || 'jodl_verify_token';
    this.baseUrl        = `https://graph.facebook.com/${this.apiVersion}`;
  }

  get isConfigured() {
    return !!(this.phoneNumberId && this.accessToken);
  }

  _requireConfig() {
    if (!this.isConfigured) {
      throw Object.assign(
        new Error('WhatsApp is not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in .env'),
        { status: 503 }
      );
    }
  }

  async sendMessage(payload) {
    this._requireConfig();
    // Meta Cloud API requires phone numbers WITHOUT leading '+'
    if (payload.to) payload.to = payload.to.replace(/^\+/, '');
    try {
      const res = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        payload,
        { headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' } }
      );
      return res.data;
    } catch (err) {
      const detail = err.response?.data?.error?.message || err.message;
      throw Object.assign(new Error(`WhatsApp send failed: ${detail}`), { status: 502 });
    }
  }

  // ─── PO Notification with Interactive Buttons ────────────────────────────────
  /**
   * Sends an interactive message to the seller with Accept / Reject quick-reply buttons.
   * Uses a TEXT interactive message (no approved template needed for testing).
   * For production, replace with an approved template message.
   */
  async sendPONotification({ to, poNumber, amount, currency = 'INR', deliveryDate, poId }) {
    const formattedAmount = new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: `📦 *New Purchase Order — JODL*\n\nPO Number: *${poNumber}*\nAmount: *${formattedAmount}*\nExpected Delivery: *${deliveryDate || 'TBD'}*\n\nPlease accept or reject this PO.`,
        },
        action: {
          buttons: [
            { type: 'reply', reply: { id: `accept_${poId}`, title: '✅ Accept' } },
            { type: 'reply', reply: { id: `reject_${poId}`, title: '❌ Reject' } },
          ],
        },
      },
    };

    return this.sendMessage(payload);
  }

  // ─── Invoice Posted Confirmation ─────────────────────────────────────────────
  async sendInvoiceConfirmation({ to, invoiceNumber, poNumber, amount, currency = 'INR' }) {
    const formattedAmount = new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        body: `✅ *Invoice Posted — JODL*\n\nYour invoice *${invoiceNumber}* against PO *${poNumber}* has been successfully posted to our accounting system.\n\nAmount: *${formattedAmount}*\n\nThank you! Our finance team will process payment per agreed terms.`,
      },
    };

    return this.sendMessage(payload);
  }

  // ─── PO Status Change Notification ──────────────────────────────────────────
  async sendPOStatusUpdate({ to, poNumber, status, reason = '' }) {
    const statusText = status === 'accepted'
      ? `✅ Accepted — please submit your invoice via the seller portal.`
      : `❌ Rejected${reason ? `: ${reason}` : '.'}`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        body: `📋 *PO Update — JODL*\n\nPO Number: *${poNumber}*\nStatus: ${statusText}`,
      },
    };

    return this.sendMessage(payload);
  }

  // ─── All Items Ready to Dispatch (admin notification) ────────────────────────
  async sendAllItemsReady({ to, poNumber, lineItemCount, sellerName, adminPoUrl }) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        body: `📦 *All items ready for dispatch*\n\nPO *${poNumber}* — all ${lineItemCount} line item${lineItemCount !== 1 ? 's' : ''} have been marked Ready to Dispatch by *${sellerName}*. Please issue DRI.\n\nView: ${adminPoUrl}`,
      },
    };
    return this.sendMessage(payload);
  }

  // ─── RTD ETA Revised (admin notification) ────────────────────────────────────
  async sendRTDEtaRevised({ to, poNumber, sellerName, itemDescription, originalEta, newEta, adminPoUrl }) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        body: `⚠️ *RTD ETA Revised*\n\nPO *${poNumber}* — *${sellerName}* has revised the Ready to Dispatch ETA for ${itemDescription}.\nOriginal: ${originalEta} → Revised: ${newEta}\n\nView: ${adminPoUrl}`,
      },
    };
    return this.sendMessage(payload);
  }

  // ─── Generic Text Message ────────────────────────────────────────────────────
  async sendTextMessage(to, message) {
    return this.sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: message },
    });
  }

  // ─── Webhook Helpers ─────────────────────────────────────────────────────────
  verifyWebhook(mode, token, challenge) {
    if (mode === 'subscribe' && token === this.verifyToken) {
      return { valid: true, challenge };
    }
    return { valid: false };
  }

  /**
   * Parse incoming webhook entry and extract message details.
   * Returns { from, type, text?, buttonReplyId?, buttonReplyTitle? }
   */
  parseWebhookMessage(body) {
    try {
      const entry    = body?.entry?.[0];
      const change   = entry?.changes?.[0];
      const value    = change?.value;
      const message  = value?.messages?.[0];

      if (!message) return null;

      const result = {
        from: message.from,
        type: message.type,
        messageId: message.id,
        timestamp: message.timestamp,
      };

      if (message.type === 'text') {
        result.text = message.text?.body;
      } else if (message.type === 'interactive') {
        const reply = message.interactive?.button_reply;
        result.buttonReplyId    = reply?.id;
        result.buttonReplyTitle = reply?.title;

        // Parse action from button id: e.g. "accept_PO-001" or "reject_PO-001"
        if (reply?.id) {
          const [action, ...rest] = reply.id.split('_');
          result.action = action;  // 'accept' | 'reject'
          result.poId   = rest.join('_');
        }
      }

      return result;
    } catch {
      return null;
    }
  }
}

module.exports = new WhatsAppService();
