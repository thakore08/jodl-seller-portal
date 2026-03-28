/**
 * WhatsApp Business Cloud API Service (Meta Graph API)
 *
 * Handles:
 *  1. Sending PO notifications to sellers with Accept/Reject buttons
 *  2. Sending invoice confirmation messages
 *  3. Parsing incoming webhook messages (button replies, text, documents, images)
 *  4. Downloading media from Meta's servers
 *  5. Triggering PO notifications from Zoho webhook events
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
    this.appId          = process.env.WHATSAPP_APP_ID;
    this.appSecret      = process.env.WHATSAPP_APP_SECRET;

    // Exchange short-lived token for 60-day token on startup, then refresh every 50 days
    if (this.appId && this.appSecret && this.accessToken) {
      this._exchangeAndSchedule();
    }
  }

  // ─── Token Auto-Refresh ───────────────────────────────────────────────────
  async _exchangeToken() {
    try {
      const res = await axios.get(`${this.baseUrl}/oauth/access_token`, {
        params: {
          grant_type:        'fb_exchange_token',
          client_id:         this.appId,
          client_secret:     this.appSecret,
          fb_exchange_token: this.accessToken,
        },
      });
      this.accessToken = res.data.access_token;
      const expiresIn  = res.data.expires_in;
      const days        = expiresIn ? Math.round(expiresIn / 86400) : '~60';
      console.log(`[WhatsApp] Token exchanged — valid for ${days} days`);
      return true;
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      console.warn(`[WhatsApp] Token exchange failed: ${msg}`);
      return false;
    }
  }

  async _exchangeAndSchedule() {
    await this._exchangeToken();
    // Refresh every 50 days (tokens last 60 days)
    const FIFTY_DAYS_MS = 50 * 24 * 60 * 60 * 1000;
    this._refreshTimer = setInterval(async () => {
      console.log('[WhatsApp] Scheduled token refresh...');
      await this._exchangeToken();
    }, FIFTY_DAYS_MS);
    // Don't block process exit
    if (this._refreshTimer.unref) this._refreshTimer.unref();
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

  // ─── URL Shortener (Bitly, optional) ─────────────────────────────────────
  /**
   * Shortens a URL via Bitly if BITLY_ACCESS_TOKEN is set, otherwise returns as-is.
   */
  async _shortenUrl(longUrl) {
    const token = process.env.BITLY_ACCESS_TOKEN;
    if (!token) return longUrl;
    try {
      const res = await axios.post(
        'https://api-ssl.bitly.com/v4/shorten',
        { long_url: longUrl },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      return res.data.link || longUrl;
    } catch {
      return longUrl;
    }
  }

  // ─── PO Notification with Interactive Buttons ─────────────────────────────
  /**
   * Sends an interactive message to the seller with Accept / Reject quick-reply buttons
   * and a link to view the PO on the JODL seller portal.
   */
  async sendPONotification({ to, poNumber, amount, currency = 'INR', deliveryDate, poId, itemCount }) {
    const formattedAmount = new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);
    const frontendUrl = process.env.FRONTEND_URL || 'https://jodl-seller-portal.onrender.com';
    const poUrl = await this._shortenUrl(`${frontendUrl}/purchase-orders/${poId}`);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: `📦 *New Purchase Order — JODL*\n\nPO Number: *${poNumber}*\nAmount: *${formattedAmount}*\nDelivery Date: *${deliveryDate || 'TBD'}*\nItems: ${itemCount || 0} line item(s)\n\n🔗 View PO: ${poUrl}\n\nPlease review and tap a button below 👇`,
        },
        action: {
          buttons: [
            { type: 'reply', reply: { id: `accept_${poId}`, title: '✅ Accept PO' } },
            { type: 'reply', reply: { id: `reject_${poId}`, title: '❌ Reject PO' } },
          ],
        },
      },
    };

    return this.sendMessage(payload);
  }

  // ─── Post-Acceptance Action Menu ───────────────────────────────────────────
  /**
   * Sent after seller accepts a PO. Three interactive buttons:
   *   📋 Readiness   → bot replies with PO portal link
   *   🚚 Dispatch    → bot replies with PO portal link
   *   📎 Upload Invoice → triggers invoice upload flow
   */
  async sendPostAcceptanceMenu({ to, poNumber, poId, poUrl }) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: `PO ${poNumber} accepted. What would you like to do next?`,
        },
        action: {
          buttons: [
            { type: 'reply', reply: { id: `invoice_${poId}`,  title: 'Upload Invoice' } },
            { type: 'reply', reply: { id: `portal_${poId}`,   title: 'View PO' } },
          ],
        },
      },
    };
    console.log('[WhatsApp] sendPostAcceptanceMenu payload:', JSON.stringify(payload));
    const result = await this.sendMessage(payload);
    console.log('[WhatsApp] sendPostAcceptanceMenu Meta response:', JSON.stringify(result));
    return result;
  }

  // ─── Invoice Posted Confirmation ──────────────────────────────────────────
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

  // ─── PO Status Change Notification ───────────────────────────────────────
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

  // ─── All Items Ready to Dispatch (admin notification) ─────────────────────
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

  // ─── RTD ETA Revised (admin notification) ─────────────────────────────────
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

  // ─── Generic Text Message ─────────────────────────────────────────────────
  async sendTextMessage(to, message) {
    return this.sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: message },
    });
  }

  // ─── Invoice Correction Request ───────────────────────────────────────────
  /**
   * Sends a correction request message to a vendor for their uploaded invoice.
   *
   * @param {string} to         - Vendor phone number
   * @param {string} poNumber   - PO number the invoice was against
   * @param {string} adminNote  - Admin's note explaining what needs correcting
   */
  async sendInvoiceCorrectionRequest({ to, poNumber, adminNote }) {
    return this.sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        body: `⚠️ *Invoice Correction Required*\n\nInvoice against PO *${poNumber}* needs correction:\n\n"${adminNote}"\n\nPlease send the corrected invoice in this chat.`,
      },
    });
  }

  // ─── PO Accept/Upload Invoice Prompt ─────────────────────────────────────
  /**
   * Sends the post-acceptance message prompting vendor to upload their invoice.
   */
  async sendInvoiceUploadPrompt({ to, poNumber }) {
    return this.sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        body: `✅ *PO #${poNumber} Accepted!*\n\nThank you for accepting the purchase order.\n\n📎 Please upload your invoice against this PO.\nSend the invoice as a *PDF file* or *image* in this chat.\n\nYour invoice will be automatically processed and posted to our system.`,
      },
    });
  }

  // ─── Multi-PO Selection Prompt ────────────────────────────────────────────
  /**
   * Prompts vendor to select which PO their invoice is against.
   *
   * @param {string}   to   - Vendor phone
   * @param {Array}    pos  - Array of { poNumber, total, currency_code }
   */
  async sendPOSelectionPrompt({ to, pos }) {
    const lines = pos.map((po, i) => {
      const nums = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
      const amt  = new Intl.NumberFormat('en-IN', { style: 'currency', currency: po.currency_code || 'INR' }).format(po.total || 0);
      return `${nums[i] || `${i + 1}.`}  ${po.purchaseorder_number} — ${amt}`;
    });

    return this.sendTextMessage(to,
      `📋 *Select PO for this Invoice*\n\nYou have multiple open Purchase Orders.\nReply with the number or the PO number this invoice is against:\n\n${lines.join('\n')}`
    );
  }

  // ─── Media Download ───────────────────────────────────────────────────────
  /**
   * Downloads a media file from Meta's servers using a media ID.
   * First fetches the download URL, then downloads the binary.
   *
   * @param {string} mediaId  - Media ID from webhook message
   * @returns {{ buffer: Buffer, mimeType: string, fileSize: number }}
   */
  async downloadMedia(mediaId) {
    this._requireConfig();
    try {
      // Step 1: Get media info (URL, mime_type, file_size)
      const infoRes = await axios.get(
        `${this.baseUrl}/${mediaId}`,
        { headers: { Authorization: `Bearer ${this.accessToken}` } }
      );
      const { url, mime_type, file_size } = infoRes.data;

      // Step 2: Download binary from the URL
      const fileRes = await axios.get(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        responseType: 'arraybuffer',
      });

      return {
        buffer:   Buffer.from(fileRes.data),
        mimeType: mime_type || 'application/octet-stream',
        fileSize: file_size || fileRes.data.byteLength,
      };
    } catch (err) {
      const detail = err.response?.data?.error?.message || err.message;
      throw Object.assign(new Error(`WhatsApp media download failed: ${detail}`), { status: 502 });
    }
  }

  // ─── Trigger PO Notification (called from Zoho webhook) ──────────────────
  /**
   * Finds the seller for a given Zoho vendor_id, checks notification prefs,
   * and sends the PO notification with Accept/Reject buttons.
   *
   * @param {Object} poData - Raw Zoho purchaseorder object
   * @returns {{ sent: boolean, reason?: string }}
   */
  async triggerPONotification(poData) {
    const { sellers }  = require('../data/sellers');
    const sessionSvc   = require('./whatsappSessionService');

    const vendorId = poData.vendor_id;
    const seller   = sellers.find(s => s.vendor_id === vendorId);

    if (!seller) {
      console.warn(`[WhatsApp] triggerPONotification: no seller for vendor_id=${vendorId}`);
      return { sent: false, reason: 'seller_not_found' };
    }

    if (!seller.whatsapp_enabled) {
      return { sent: false, reason: 'whatsapp_disabled' };
    }

    if (!seller.notifications?.new_po) {
      return { sent: false, reason: 'notification_disabled' };
    }

    const to = seller.whatsapp_number;
    if (!to) {
      return { sent: false, reason: 'no_phone_number' };
    }

    const poId       = poData.purchaseorder_id;
    const poNumber   = poData.purchaseorder_number;
    const amount     = poData.total || 0;
    const currency   = poData.currency_code || 'INR';
    const deliveryDate = poData.expected_delivery_date || poData.delivery_date || '';
    const itemCount  = (poData.line_items || []).length;

    await this.sendPONotification({ to, poNumber, amount, currency, deliveryDate, poId, itemCount });

    // Create a session for this vendor to track their response
    sessionSvc.createSession(to.replace(/^\+/, ''), {
      sellerId: seller.id,
      poId,
      poNumber,
      state: 'awaiting_po_response',
    });

    console.log(`[WhatsApp] PO notification sent for ${poNumber} to ${to}`);
    return { sent: true };
  }

  // ─── Webhook Helpers ──────────────────────────────────────────────────────
  verifyWebhook(mode, token, challenge) {
    if (mode === 'subscribe' && token === this.verifyToken) {
      return { valid: true, challenge };
    }
    return { valid: false };
  }

  /**
   * Parse incoming webhook entry and extract message details.
   * Returns { from, type, text?, buttonReplyId?, action?, poId?, mediaId?, mimeType?, filename? }
   */
  parseWebhookMessage(body) {
    try {
      const entry    = body?.entry?.[0];
      const change   = entry?.changes?.[0];
      const value    = change?.value;
      const message  = value?.messages?.[0];

      if (!message) return null;

      const result = {
        from:      message.from,
        type:      message.type,
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

      } else if (message.type === 'document') {
        result.mediaId  = message.document?.id;
        result.mimeType = message.document?.mime_type;
        result.filename = message.document?.filename;
        result.caption  = message.document?.caption;

      } else if (message.type === 'image') {
        result.mediaId  = message.image?.id;
        result.mimeType = message.image?.mime_type;
        result.filename = `image_${message.id}.jpg`;
        result.caption  = message.image?.caption;
      }

      return result;
    } catch {
      return null;
    }
  }
}

module.exports = new WhatsAppService();
