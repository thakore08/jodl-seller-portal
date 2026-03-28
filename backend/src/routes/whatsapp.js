/**
 * WhatsApp Webhook & Notification Routes
 *
 * Handles the complete WhatsApp workflow:
 *  Phase 1: PO notification (sent from Zoho webhook / manual trigger)
 *  Phase 2: Vendor accepts/rejects PO via WhatsApp reply
 *  Phase 3: Vendor uploads invoice via WhatsApp
 */

const express     = require('express');
const path        = require('path');
const fs          = require('fs');
const whatsapp    = require('../services/whatsappService');
const zoho        = require('../services/zohoBooksService');
const sessionSvc  = require('../services/whatsappSessionService');
const pdfExtractor   = require('../services/pdfExtractorService');
const invoiceMatcher = require('../services/invoiceMatchingService');
const { sellers }    = require('../data/sellers');
const { createWaInvoice, updateWaInvoice } = require('../data/waInvoices');
const { poLocalStatus } = require('../data/poLocalState');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// Max file size for WhatsApp media (16 MB Meta limit)
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

// ─── GET /api/whatsapp/webhook — Meta verification handshake ─────────────────
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
  // Acknowledge immediately — Meta/WhatsApp requires 200 within 20 seconds
  res.sendStatus(200);

  const message = whatsapp.parseWebhookMessage(req.body);
  if (!message) return;

  console.log('[WhatsApp] Incoming message:', JSON.stringify(message, null, 2));

  const phone = message.from; // without '+'

  // ── Find seller by phone ──────────────────────────────────────────────────
  const seller = sellers.find(
    s => s.whatsapp_number === `+${phone}` || s.phone === `+${phone}`
  );

  if (!seller) {
    console.warn('[WhatsApp] No seller found for number:', phone);
    return;
  }

  // ── Route by message type ─────────────────────────────────────────────────
  try {
    if (message.type === 'interactive') {
      await handleInteractiveReply(message, seller, phone);
    } else if (message.type === 'text') {
      await handleTextReply(message, seller, phone);
    } else if (message.type === 'document' || message.type === 'image') {
      await handleMediaUpload(message, seller, phone);
    }
  } catch (err) {
    console.error('[WhatsApp] Unhandled error in webhook handler:', err.message);
    await whatsapp.sendTextMessage(`+${phone}`, '⚠️ Something went wrong. Please try again or use the seller portal.')
      .catch(() => {});
  }
});

// ─── PHASE 2: Interactive button reply ───────────────────────────────────────
async function handleInteractiveReply(message, seller, phone) {
  const { action, poId } = message;
  if (!action || !poId) return;

  const session = sessionSvc.getSession(phone);
  const resolvedPoId     = poId     || session?.poId;
  const resolvedPoNumber = session?.poNumber || resolvedPoId;
  const resolvedPoUrl    = session?.poUrl    || '';

  if (action === 'accept') {
    await processPOAccept({ phone, seller, poId: resolvedPoId, poNumber: resolvedPoNumber, session });

  } else if (action === 'reject') {
    await processPOReject({ phone, seller, poId: resolvedPoId, poNumber: resolvedPoNumber, session });

  } else if (action === 'readiness' || action === 'dispatch') {
    // Seller tapped Material Readiness or Ready to Dispatch — send portal link
    const label = action === 'readiness' ? 'Material Readiness' : 'Ready to Dispatch';
    await whatsapp.sendTextMessage(`+${phone}`,
      `To update *${label}* for PO *${resolvedPoNumber}*, please visit the JODL Seller Portal:\n\n🔗 ${resolvedPoUrl || 'https://jodl-seller-portal.onrender.com'}`
    ).catch(() => {});

  } else if (action === 'invoice') {
    // Seller tapped Upload Invoice — set session to awaiting invoice
    sessionSvc.updateSession(phone, { state: 'awaiting_invoice' });
    await whatsapp.sendTextMessage(`+${phone}`,
      `📎 Please send your invoice for PO *${resolvedPoNumber}* as a *PDF file* or *image* in this chat.`
    ).catch(() => {});
  }
}

// ─── PHASE 2: Text reply (ACCEPT / REJECT / invoice selection / reason) ───────
async function handleTextReply(message, seller, phone) {
  const text    = (message.text || '').trim();
  const session = sessionSvc.getSession(phone);

  // ── No active session ────────────────────────────────────────────────────
  if (!session || session.state === 'expired') {
    await whatsapp.sendTextMessage(`+${phone}`,
      'No pending PO found. Please contact JODL support or use the seller portal.'
    ).catch(() => {});
    return;
  }

  // ── Awaiting PO accept/reject ────────────────────────────────────────────
  if (session.state === 'awaiting_po_response') {
    const upper = text.toUpperCase();
    const isAccept = ['ACCEPT', 'YES', 'OK', 'CONFIRM', '1'].some(k => upper.includes(k));
    const isReject = ['REJECT', 'NO', 'DECLINE', '2'].some(k => upper.includes(k));

    if (isAccept) {
      await processPOAccept({ phone, seller, poId: session.poId, poNumber: session.poNumber, session });
    } else if (isReject) {
      await processPOReject({ phone, seller, poId: session.poId, poNumber: session.poNumber, session });
    } else {
      // Re-prompt
      await whatsapp.sendTextMessage(`+${phone}`,
        `Please reply *ACCEPT* or *REJECT* for PO *${session.poNumber}*.`
      ).catch(() => {});
    }
    return;
  }

  // ── Awaiting rejection reason ────────────────────────────────────────────
  if (session.state === 'awaiting_rejection_reason') {
    const reason = text;
    // Add comment to Zoho PO
    await zoho.addCommentToPO(session.poId, `Rejection reason from vendor: ${reason}`).catch(() => {});

    // Notify admin
    const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER;
    if (adminPhone && whatsapp.isConfigured) {
      await whatsapp.sendTextMessage(adminPhone,
        `❌ *PO Rejected by Vendor*\n\nPO: *${session.poNumber}*\nVendor: *${seller.company}*\nReason: ${reason}`
      ).catch(() => {});
    }

    await whatsapp.sendTextMessage(`+${phone}`,
      `Thank you. Your rejection reason has been recorded. Our team will review and get back to you.`
    ).catch(() => {});

    sessionSvc.updateSession(phone, { state: 'completed' });
    return;
  }

  // ── Awaiting PO selection (multiple open POs) ────────────────────────────
  if (session.state === 'awaiting_po_selection') {
    const openPOs = session._openPOs || [];
    let selected  = null;

    // Try numeric selection first: "1", "2", "3"
    const numChoice = parseInt(text, 10);
    if (!isNaN(numChoice) && numChoice >= 1 && numChoice <= openPOs.length) {
      selected = openPOs[numChoice - 1];
    } else {
      // Try matching by PO number text
      selected = openPOs.find(po =>
        po.purchaseorder_number?.toLowerCase() === text.toLowerCase()
      );
    }

    if (!selected) {
      await whatsapp.sendTextMessage(`+${phone}`,
        `Please reply with a number (1–${openPOs.length}) or the exact PO number.`
      ).catch(() => {});
      return;
    }

    sessionSvc.updateSession(phone, {
      state:          'awaiting_invoice',
      selectedPoId:   selected.purchaseorder_id,
      poId:           selected.purchaseorder_id,
      poNumber:       selected.purchaseorder_number,
      _openPOs:       undefined,
    });

    await whatsapp.sendTextMessage(`+${phone}`,
      `✅ PO *${selected.purchaseorder_number}* selected.\n\nPlease send your invoice as a *PDF* or *image* in this chat.`
    ).catch(() => {});
    return;
  }

  // ── Awaiting invoice — text received instead of document ─────────────────
  if (session.state === 'awaiting_invoice') {
    await whatsapp.sendTextMessage(`+${phone}`,
      `Please send your invoice as a *PDF file* or *image*. Text messages cannot be processed as invoices.`
    ).catch(() => {});
    return;
  }

  // ── Fallthrough ──────────────────────────────────────────────────────────
  await whatsapp.sendTextMessage(`+${phone}`,
    `I'm not sure how to handle that. Please use the seller portal or contact JODL support.`
  ).catch(() => {});
}

// ─── PHASE 3: Document or Image (invoice upload) ──────────────────────────────
async function handleMediaUpload(message, seller, phone) {
  const session = sessionSvc.getSession(phone);

  if (!session || !['awaiting_invoice', 'invoice_uploaded'].includes(session.state)) {
    await whatsapp.sendTextMessage(`+${phone}`,
      'No active PO session found. Please accept a PO first before sending an invoice.'
    ).catch(() => {});
    return;
  }

  // ── Acknowledge immediately ───────────────────────────────────────────────
  await whatsapp.sendTextMessage(`+${phone}`, '⏳ Received your invoice. Processing...').catch(() => {});

  // ── Check file size (Meta includes file_size in webhook, but we check after download) ─
  const mediaId    = message.mediaId;
  const mimeType   = message.mimeType || 'application/octet-stream';
  const filename   = message.filename || `invoice_${Date.now()}.pdf`;

  // ── Download from Meta ─────────────────────────────────────────────────────
  let mediaBuffer;
  try {
    const media = await whatsapp.downloadMedia(mediaId);
    mediaBuffer = media.buffer;

    if (media.fileSize > MAX_MEDIA_BYTES) {
      await whatsapp.sendTextMessage(`+${phone}`,
        '⚠️ File too large. Please compress the file or upload via the seller portal.'
      ).catch(() => {});
      return;
    }
  } catch (err) {
    console.error('[WhatsApp] Media download failed:', err.message);
    await whatsapp.sendTextMessage(`+${phone}`,
      '⚠️ Could not download your file. Please try again or upload via the seller portal.'
    ).catch(() => {});
    return;
  }

  // ── Determine target PO ────────────────────────────────────────────────────
  let poId     = session.selectedPoId || session.poId;
  let poNumber = session.poNumber;

  // If vendor has multiple accepted POs, prompt for selection first
  if (!poId) {
    try {
      const openData = await zoho.getPurchaseOrders({
        status:    'open',
        vendor_id: seller.vendor_id,
      });
      const openPOs = openData.purchaseorders || [];

      if (openPOs.length === 0) {
        await whatsapp.sendTextMessage(`+${phone}`,
          'No open purchase orders found for your account. Please contact JODL support.'
        ).catch(() => {});
        return;
      }

      if (openPOs.length > 1) {
        sessionSvc.updateSession(phone, { state: 'awaiting_po_selection', _openPOs: openPOs });
        await whatsapp.sendPOSelectionPrompt({ to: `+${phone}`, pos: openPOs });
        return;
      }

      poId     = openPOs[0].purchaseorder_id;
      poNumber = openPOs[0].purchaseorder_number;
      sessionSvc.updateSession(phone, { poId, poNumber, selectedPoId: poId });
    } catch (err) {
      console.error('[WhatsApp] Failed to fetch open POs:', err.message);
    }
  }

  // ── Save file to uploads dir ────────────────────────────────────────────────
  const ext        = path.extname(filename) || (mimeType.includes('pdf') ? '.pdf' : '.jpg');
  const savedName  = `wa_${seller.id}_${(poNumber || 'unknown').replace(/[^a-zA-Z0-9-]/g, '')}_${Date.now()}${ext}`;
  const uploadDir  = process.env.UPLOAD_DIR || './uploads';
  const filePath   = path.join(uploadDir, savedName);

  try {
    fs.writeFileSync(filePath, mediaBuffer);
  } catch (err) {
    console.error('[WhatsApp] Failed to save media file:', err.message);
    await whatsapp.sendTextMessage(`+${phone}`,
      '⚠️ Could not save your file. Please try again or upload via the seller portal.'
    ).catch(() => {});
    return;
  }

  // ── Run PDF extraction if PDF ──────────────────────────────────────────────
  let extractedData = null;
  let matchResults  = null;

  const isPdf = mimeType.includes('pdf') || ext.toLowerCase() === '.pdf';
  if (isPdf) {
    try {
      extractedData = await pdfExtractor.extractFromBuffer(mediaBuffer, savedName);

      // Match against PO if we have a poId
      if (poId && !extractedData.is_scanned) {
        try {
          const poData = await zoho.getPurchaseOrderById(poId);
          matchResults = invoiceMatcher.matchLineItems(
            extractedData.line_items || [],
            poData.purchaseorder?.line_items || []
          );
        } catch (err) {
          console.warn('[WhatsApp] PO matching failed:', err.message);
        }
      }
    } catch (err) {
      console.warn('[WhatsApp] PDF extraction failed:', err.message);
      // Still save the record — flag for manual review
    }
  }

  // ── Create WA invoice record ────────────────────────────────────────────────
  const waInvoice = createWaInvoice({
    sellerId:         seller.id,
    sellerPhone:      phone,
    poId,
    poNumber,
    filePath:         savedName,
    originalFilename: filename,
    mimeType,
    extractedData,
    matchResults,
    status: 'pending_admin_review',
  });

  // Update session
  sessionSvc.updateSession(phone, { state: 'invoice_uploaded', invoiceId: waInvoice.id });

  // ── Auto-post to Zoho Books ────────────────────────────────────────────────
  const extracted    = extractedData?.header || {};
  const today        = new Date().toISOString().split('T')[0];
  const invoiceNumber = extracted.invoice_number || `WA-${Date.now()}`;
  const amount        = extracted.total_amount || 0;
  const formattedAmt  = amount
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount)
    : '(to be verified)';

  let posted = false;
  try {
    const billPayload = {
      vendor_id:         seller.vendor_id,
      date:              extracted.invoice_date || today,
      bill_number:       invoiceNumber,
      purchaseorder_ids: poId ? [poId] : [],
      line_items:        (extractedData?.line_items || []).map(item => ({
        name:       item.description || item.name || 'Line item',
        quantity:   item.quantity    || 1,
        rate:       item.unit_price  || item.rate || 0,
        account_id: item.account_id  || '',
        item_id:    item.item_id     || '',
      })),
      notes: `Invoice received via WhatsApp. WA record ID: ${waInvoice.id}`,
    };

    const result = await zoho.createBill(billPayload);
    const billId  = result.bill?.bill_id;
    updateWaInvoice(waInvoice.id, { status: 'posted', zohoBillId: billId });
    posted = true;
    console.log(`[WhatsApp] Invoice auto-posted to Zoho Books. Bill ID: ${billId}, WA invoice: ${waInvoice.id}`);
  } catch (err) {
    console.error(`[WhatsApp] Auto-post to Zoho failed for ${waInvoice.id}:`, err.message);
    // Invoice stays as pending_admin_review for manual posting
  }

  // ── Send confirmation to seller ────────────────────────────────────────────
  if (posted) {
    await whatsapp.sendTextMessage(`+${phone}`,
      `✅ *Purchase Bill Posted to JODL!*\n\nYour invoice has been successfully received and posted to the JODL accounting system.\n\nInvoice No: *${invoiceNumber}*\nAgainst PO: *${poNumber || 'N/A'}*\nAmount: *${formattedAmt}*\n\nOur finance team will process payment per agreed terms. Thank you! 🙏`
    ).catch(() => {});
  } else {
    await whatsapp.sendTextMessage(`+${phone}`,
      `✅ *Invoice Received!*\n\nInvoice No: *${invoiceNumber}*\nAgainst PO: *${poNumber || 'N/A'}*\nAmount: *${formattedAmt}*\n\nOur team will review and post to the accounting system shortly. You'll receive a confirmation once done.`
    ).catch(() => {});
  }

  console.log(`[WhatsApp] Invoice received from ${phone}, WA invoice ID: ${waInvoice.id}`);
}

// ─── Helper: Process PO Accept ────────────────────────────────────────────────
async function processPOAccept({ phone, seller, poId, poNumber, session }) {
  // Retry logic for Zoho API
  let accepted = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await zoho.acceptPurchaseOrder(poId);
      accepted = true;
      break;
    } catch (err) {
      console.warn(`[WhatsApp] Accept PO attempt ${attempt}/3 failed:`, err.message);
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1000));
    }
  }

  if (!accepted) {
    await whatsapp.sendTextMessage(`+${phone}`,
      `⚠️ Could not accept PO *${poNumber}* at this time. Please try again or use the seller portal.`
    ).catch(() => {});
    return;
  }

  // Mark accepted in JODL local state
  poLocalStatus.set(poId, 'accepted');

  // Build PO portal link and shorten if Bitly is configured
  const frontendUrl = process.env.FRONTEND_URL || 'https://jodl-seller-portal.onrender.com';
  const poUrl = await whatsapp._shortenUrl(`${frontendUrl}/purchase-orders/${poId}`);

  // Store poUrl in session for later button taps (readiness / dispatch)
  sessionSvc.updateSession(phone, { state: 'awaiting_invoice', poUrl });

  // Send post-acceptance action menu
  await whatsapp.sendPostAcceptanceMenu({ to: `+${phone}`, poNumber, poId, poUrl }).catch(() => {});
  console.log(`[WhatsApp] PO ${poNumber} accepted by ${phone}`);
}

// ─── Helper: Process PO Reject ────────────────────────────────────────────────
async function processPOReject({ phone, seller, poId, poNumber, session }) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await zoho.rejectPurchaseOrder(poId, 'Rejected via WhatsApp');
      break;
    } catch (err) {
      console.warn(`[WhatsApp] Reject PO attempt ${attempt}/3 failed:`, err.message);
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1000));
    }
  }

  // Mark rejected in JODL local state
  poLocalStatus.set(poId, 'rejected');

  sessionSvc.updateSession(phone, { state: 'awaiting_rejection_reason' });

  await whatsapp.sendTextMessage(`+${phone}`,
    `❌ *PO #${poNumber} Rejected*\n\nPlease reply with the reason for rejection so we can resolve this quickly.`
  ).catch(() => {});

  console.log(`[WhatsApp] PO ${poNumber} rejected by ${phone}`);
}

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

// ─── POST /api/whatsapp/notify-po (auth required) ────────────────────────────
// Manual trigger: send PO notification for a given PO ID
router.post('/notify-po', authenticate, async (req, res) => {
  const { poId } = req.body;
  if (!poId) return res.status(400).json({ error: true, message: 'poId required' });

  const poData = await zoho.getPurchaseOrderById(poId);
  const po     = poData.purchaseorder;

  const result = await whatsapp.triggerPONotification(po);
  res.json({ success: true, result });
});

// ─── GET /api/whatsapp/app-info (auth required) ──────────────────────────────
// Fetches app details including secret from Meta
router.get('/app-info', authenticate, async (req, res) => {
  const axios       = require('axios');
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const appId       = process.env.WHATSAPP_APP_ID;
  const apiVersion  = process.env.WHATSAPP_API_VERSION || 'v19.0';

  try {
    const response = await axios.get(
      `https://graph.facebook.com/${apiVersion}/${appId}`,
      {
        params: { fields: 'id,name,secret', access_token: accessToken },
      }
    );
    res.json({ success: true, app: response.data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.response?.data || e.message });
  }
});

// ─── GET /api/whatsapp/token-info (auth required) ────────────────────────────
// Inspects the WhatsApp access token — shows app, scopes, expiry, linked WABAs
router.get('/token-info', authenticate, async (req, res) => {
  const axios       = require('axios');
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion  = process.env.WHATSAPP_API_VERSION || 'v19.0';
  const results     = { tokenPrefix: accessToken?.slice(0, 20) + '...' };

  // 1. /me — who does this token belong to?
  try {
    const me = await axios.get(`https://graph.facebook.com/${apiVersion}/me`,
      { headers: { Authorization: `Bearer ${accessToken}` } });
    results.me = me.data;
  } catch (e) { results.meError = e.response?.data || e.message; }

  // 2. debug_token — scopes, expiry, app
  try {
    const dbg = await axios.get(
      `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${accessToken}`);
    results.debug = dbg.data?.data;
  } catch (e) { results.debugError = e.response?.data || e.message; }

  // 3. List WABAs this token can see
  try {
    const biz = await axios.get(
      `https://graph.facebook.com/${apiVersion}/me/businesses`,
      { headers: { Authorization: `Bearer ${accessToken}` } });
    results.businesses = biz.data?.data;
  } catch (e) { results.businessesError = e.response?.data || e.message; }

  res.json(results);
});

// ─── GET /api/whatsapp/phone-numbers (auth required) ─────────────────────────
// Fetches all phone numbers linked to the WABA from Meta
router.get('/phone-numbers', authenticate, async (req, res) => {
  const axios      = require('axios');
  const wabaId     = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion  = process.env.WHATSAPP_API_VERSION || 'v19.0';

  try {
    const response = await axios.get(
      `https://graph.facebook.com/${apiVersion}/${wabaId}/phone_numbers`,
      {
        params: { fields: 'id,display_phone_number,verified_name,quality_rating,status' },
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    res.json({ success: true, waba_id: wabaId, phone_numbers: response.data.data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.response?.data || e.message });
  }
});

// ─── GET /api/whatsapp/debug (auth required) ──────────────────────────────────
// Returns Meta phone number info + sends a test text message to reveal actual API response
router.get('/debug', authenticate, async (req, res) => {
  const axios = require('axios');
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion    = process.env.WHATSAPP_API_VERSION || 'v19.0';
  const to            = '917738305384';

  const results = { phoneNumberId, tokenPrefix: accessToken?.slice(0, 20) + '...', to };

  // 1. Fetch phone number details from Meta
  try {
    const info = await axios.get(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    results.phoneInfo = info.data;
  } catch (e) {
    results.phoneInfoError = e.response?.data || e.message;
  }

  // 2. Send hello_world template (guaranteed delivery, no 24h window restriction)
  try {
    const msg = await axios.post(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: 'hello_world',
          language: { code: 'en_US' },
        },
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
    results.templateResponse = msg.data;
  } catch (e) {
    results.templateError = e.response?.data || e.message;
  }

  // 3. Also send a plain text message
  try {
    const msg = await axios.post(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: 'JODL debug test — plain text message ✅' },
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
    results.textResponse = msg.data;
  } catch (e) {
    results.textError = e.response?.data || e.message;
  }

  res.json(results);
});

module.exports = router;
