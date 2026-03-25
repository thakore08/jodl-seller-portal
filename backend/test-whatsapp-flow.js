/**
 * test-whatsapp-flow.js
 *
 * Simulates the complete WhatsApp workflow end-to-end by making HTTP requests
 * to the local backend.
 *
 * Usage:
 *   node test-whatsapp-flow.js
 *
 * Prerequisites:
 *   - Backend running on http://localhost:5000
 *   - Heena Steel seller exists (email: heena@demo.com, vendor_id set)
 *   - At least one PO in Zoho Books for Heena Steel
 */

'use strict';

const http = require('http');

const BASE_URL      = process.env.TEST_BASE_URL || 'http://localhost:5000';
const SELLER_EMAIL  = 'heena@demo.com';
const SELLER_PASS   = 'password123';
const SELLER_PHONE  = '917738305384';  // without +

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url     = new URL(`${BASE_URL}${path}`);
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port:     url.port || 80,
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function log(step, status, data) {
  const icon = status === 'ok' ? '✅' : status === 'skip' ? '⏭️ ' : '❌';
  console.log(`\n${icon} STEP ${step}`);
  if (typeof data === 'object') {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(data);
  }
}

// ─── Build a mock Zoho webhook payload ───────────────────────────────────────
function mockZohoWebhook(eventType, po) {
  return {
    event:           eventType,
    organization_id: '60032173740',
    token:           process.env.ZOHO_WEBHOOK_SECRET || '',
    data:            { purchaseorder: po },
  };
}

// ─── Build a mock WhatsApp webhook payload ────────────────────────────────────
function mockWaWebhook({ from, type, text, buttonReplyId }) {
  const message = { from, id: `msg_test_${Date.now()}`, timestamp: String(Date.now()) };

  if (type === 'text') {
    message.type = 'text';
    message.text = { body: text };
  } else if (type === 'interactive') {
    message.type = 'interactive';
    const [action, ...rest] = buttonReplyId.split('_');
    message.interactive = {
      type: 'button_reply',
      button_reply: {
        id:    buttonReplyId,
        title: action === 'accept' ? '✅ Accept PO' : '❌ Reject PO',
      },
    };
  }

  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'test_entry',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          messages: [message],
        },
      }],
    }],
  };
}

// ─── Main test flow ───────────────────────────────────────────────────────────
async function run() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  JODL WhatsApp Flow — End-to-End Test');
  console.log(`  Backend: ${BASE_URL}`);
  console.log('═══════════════════════════════════════════════════════');

  // ── Step 0: Health check ─────────────────────────────────────────────────
  const health = await request('GET', '/health');
  if (health.status !== 200) {
    console.error('❌ Backend is not running. Start it with: npm run dev');
    process.exit(1);
  }
  log(0, 'ok', 'Backend is running ✓');

  // ── Step 1: Login as Heena Steel ─────────────────────────────────────────
  const loginRes = await request('POST', '/api/auth/login', {
    email: SELLER_EMAIL, password: SELLER_PASS,
  });

  if (loginRes.status !== 200 || !loginRes.body.token) {
    log(1, 'fail', { message: 'Login failed', response: loginRes.body });
    process.exit(1);
  }
  const token = loginRes.body.token;
  log(1, 'ok', { message: 'Logged in as Heena Steel', token: token.slice(0, 30) + '…' });

  const authHeader = { Authorization: `Bearer ${token}` };

  // ── Step 2: Fetch a PO for Heena Steel ───────────────────────────────────
  const posRes = await request('GET', '/api/purchase-orders', null, authHeader);
  const pos    = posRes.body?.purchaseorders || posRes.body?.purchase_orders || [];

  if (pos.length === 0) {
    log(2, 'skip', 'No POs found for Heena Steel — skipping Zoho webhook simulation.\nCreate a PO in Zoho Books for this vendor first.');
  } else {
    const po = pos[0];
    log(2, 'ok', {
      message: `Found PO: ${po.purchaseorder_number}`,
      poId:    po.purchaseorder_id,
      total:   po.total,
      status:  po.status,
    });

    // ── Step 3: Simulate Zoho webhook → PO created ────────────────────────
    console.log('\n[Step 3] Simulating Zoho webhook: purchaseorder_issued…');
    const zohoWebhookBody = mockZohoWebhook('purchaseorder_issued', po);
    const zohoRes = await request('POST', '/api/zoho/webhook', zohoWebhookBody);
    log(3, zohoRes.status === 200 ? 'ok' : 'fail', {
      message: 'Zoho webhook response',
      status:  zohoRes.status,
      note:    'Check server logs for [WhatsApp] PO notification output',
    });
  }

  // ── Step 4: Simulate vendor ACCEPT reply (text) ──────────────────────────
  console.log('\n[Step 4] Simulating vendor WhatsApp reply: "ACCEPT"…');
  const acceptBody = mockWaWebhook({ from: SELLER_PHONE, type: 'text', text: 'ACCEPT' });
  const acceptRes  = await request('POST', '/api/whatsapp/webhook', acceptBody);
  log(4, acceptRes.status === 200 ? 'ok' : 'fail', {
    message: 'WhatsApp text ACCEPT webhook',
    status:  acceptRes.status,
    note:    'Check server logs for session state: awaiting_po_response → awaiting_invoice',
  });

  // ── Step 5: Simulate vendor ACCEPT via interactive button ────────────────
  if (pos.length > 0) {
    const po = pos[0];
    console.log('\n[Step 5] Simulating vendor interactive button: accept…');
    const btnBody = mockWaWebhook({
      from:          SELLER_PHONE,
      type:          'interactive',
      buttonReplyId: `accept_${po.purchaseorder_id}`,
    });
    const btnRes = await request('POST', '/api/whatsapp/webhook', btnBody);
    log(5, btnRes.status === 200 ? 'ok' : 'fail', {
      message: 'WhatsApp button reply webhook',
      status:  btnRes.status,
      note:    'Check server logs for PO accept + invoice upload prompt',
    });
  } else {
    log(5, 'skip', 'No PO available for button reply test');
  }

  // ── Step 6: Check session state ──────────────────────────────────────────
  console.log('\n[Step 6] Checking session state via WhatsApp status endpoint…');
  const statusRes = await request('GET', '/api/whatsapp/status', null, authHeader);
  log(6, statusRes.status === 200 ? 'ok' : 'fail', statusRes.body);

  // ── Step 7: Check WhatsApp invoices list ─────────────────────────────────
  console.log('\n[Step 7] Fetching WhatsApp invoice queue (admin review list)…');
  const waInvRes = await request('GET', '/api/invoices/whatsapp', null, authHeader);
  log(7, waInvRes.status === 200 ? 'ok' : 'fail', {
    count:    waInvRes.body?.count || 0,
    invoices: (waInvRes.body?.invoices || []).slice(0, 2).map(i => ({
      id:     i.id,
      poNumber: i.poNumber,
      status: i.status,
    })),
  });

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Test complete. Check server logs for full detail.');
  console.log('  Key things to verify:');
  console.log('  1. [WhatsApp] PO notification sent (Step 3 — needs real WA config)');
  console.log('  2. [WhatsApp Session] state transitions in server logs (Steps 4-5)');
  console.log('  3. WA invoice queue is accessible (Step 7)');
  console.log('═══════════════════════════════════════════════════════\n');
}

run().catch(err => {
  console.error('Test runner error:', err.message);
  process.exit(1);
});
