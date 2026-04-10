/**
 * Zoho Books Service
 * Handles all Zoho Books API v3 interactions for the JODL Seller Portal.
 * Organisation: 60032173740 (QA / Sandbox)
 */
const axios = require('axios');

class ZohoBooksService {
  constructor() {
    this.orgId           = process.env.ZOHO_ORG_ID    || '60032173740';
    this.apiBase         = process.env.ZOHO_API_BASE  || 'https://sandbox.zohoapis.com/books/v3';
    this.authUrl         = process.env.ZOHO_AUTH_URL  || 'https://accounts.zoho.com/oauth/v2/token';
    this._token          = null;
    this._expiry         = null;
    this._schedulerTimer = null;
  }

  // ─── OAuth Token Management ──────────────────────────────────────────────────

  /**
   * Unconditionally fetches a fresh access token from Zoho and caches it.
   * Called by the scheduler and by getAccessToken() when the cache is stale.
   */
  async _refreshToken() {
    if (!process.env.ZOHO_REFRESH_TOKEN || !process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_CLIENT_SECRET) {
      throw Object.assign(
        new Error('Zoho credentials are not configured. Please set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN in .env'),
        { status: 503 }
      );
    }

    const params = new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: process.env.ZOHO_REFRESH_TOKEN,
      client_id:     process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
    });

    const response = await axios.post(this.authUrl, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (response.data.error) {
      throw Object.assign(
        new Error(`Zoho OAuth error: ${response.data.error}`),
        { status: 503 }
      );
    }

    this._token  = response.data.access_token;
    this._expiry = Date.now() + ((response.data.expires_in || 3600) - 300) * 1000;
    console.log(`[ZohoToken] Access token refreshed. Next expiry: ${new Date(this._expiry).toISOString()}`);
    return this._token;
  }

  /**
   * Returns a valid access token. Uses the cached token if still valid,
   * otherwise falls back to fetching a fresh one.
   */
  async getAccessToken() {
    if (this._token && this._expiry && Date.now() < this._expiry) {
      return this._token;
    }
    return this._refreshToken();
  }

  /**
   * Starts a background scheduler that proactively refreshes the Zoho access
   * token every ZOHO_TOKEN_REFRESH_INTERVAL_MINS minutes (default: 50).
   * An immediate refresh is performed on startup so the token is ready before
   * the first API request arrives.
   *
   * Safe to call multiple times — clears any existing timer first.
   */
  startTokenRefreshScheduler() {
    if (this._schedulerTimer) {
      clearInterval(this._schedulerTimer);
    }

    const intervalMins = parseInt(process.env.ZOHO_TOKEN_REFRESH_INTERVAL_MINS || '50', 10);
    const intervalMs   = intervalMins * 60 * 1000;

    // Warm up immediately on startup
    this._refreshToken().catch((err) =>
      console.error('[ZohoToken] Initial token refresh failed:', err.message)
    );

    this._schedulerTimer = setInterval(() => {
      console.log('[ZohoToken] Scheduled refresh triggered.');
      this._refreshToken().catch((err) =>
        console.error('[ZohoToken] Scheduled token refresh failed:', err.message)
      );
    }, intervalMs);

    // Prevent the timer from blocking process exit
    if (this._schedulerTimer.unref) this._schedulerTimer.unref();

    console.log(`[ZohoToken] Token refresh scheduler started — interval: ${intervalMins} min(s).`);
  }

  async request(method, endpoint, data = null, params = {}) {
    const token = await this.getAccessToken();

    const config = {
      method,
      url: `${this.apiBase}${endpoint}`,
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      params: { organization_id: this.orgId, ...params },
    };

    if (data) config.data = data;

    try {
      const response = await axios(config);
      return response.data;
    } catch (err) {
      const msg    = err.response?.data?.message || err.message;
      const code   = err.response?.data?.code;
      const status = err.response?.status || 500;
      console.error('[Zoho] API error', status, code, msg, JSON.stringify(err.response?.data));
      throw Object.assign(new Error(`Zoho Books API error: ${msg}`), { status });
    }
  }

  // ─── Purchase Orders ─────────────────────────────────────────────────────────
  /**
   * List purchase orders.
   * @param {Object} filters - e.g. { status: 'open', vendor_id: '...' }
   */
  async getPurchaseOrders(filters = {}) {
    return this.request('GET', '/purchaseorders', null, filters);
  }

  async getPurchaseOrderById(id) {
    return this.request('GET', `/purchaseorders/${id}`);
  }

  /**
   * Fetch shipment-module records from the custom OMS shipment module.
   * This uses the same Zoho Books org and token configuration as PO sync.
   */
  async getShipmentModule(filters = {}) {
    return this.request('GET', '/cm_oms_shipment_module', null, filters);
  }

  /**
   * Accept a PO — marks status as "open" (confirmed by vendor).
   * If already open, Zoho returns it as-is.
   */
  async acceptPurchaseOrder(id) {
    return this.request('POST', `/purchaseorders/${id}/status/open`);
  }

  /**
   * Reject a PO — cancels it and optionally adds a comment.
   */
  async rejectPurchaseOrder(id, reason = '') {
    if (reason) {
      await this.addCommentToPO(id, `Rejected by vendor: ${reason}`).catch(() => {});
    }
    return this.request('POST', `/purchaseorders/${id}/status/cancelled`);
  }

  async addCommentToPO(id, note) {
    return this.request('POST', `/purchaseorders/${id}/comments`, { description: note });
  }

  // ─── Bills (Vendor Invoices) ─────────────────────────────────────────────────
  /**
   * Create a Bill in Zoho Books against a Purchase Order.
   *
   * billData shape:
   * {
   *   vendor_id, date, due_date, bill_number,
   *   purchaseorder_ids: [{ purchaseorder_id }],
   *   line_items: [{ item_id, name, description, rate, quantity, account_id }],
   *   notes, terms
   * }
   */
  async createBill(billData) {
    return this.request('POST', '/bills', billData);
  }

  /** Submit a draft bill for approval (moves draft → open when no approval workflow). */
  async submitBill(billId) {
    return this.request('POST', `/bills/${billId}/submit`);
  }

  /** Approve a submitted bill (moves pending_approval → open). */
  async approveBill(billId) {
    return this.request('POST', `/bills/${billId}/approve`);
  }

  async getBills(filters = {}) {
    return this.request('GET', '/bills', null, filters);
  }

  async getBillById(id) {
    return this.request('GET', `/bills/${id}`);
  }

  // ─── Contacts / Vendors ──────────────────────────────────────────────────────
  async getVendors(filters = {}) {
    return this.request('GET', '/contacts', null, { contact_type: 'vendor', ...filters });
  }

  async getVendorById(id) {
    return this.request('GET', `/contacts/${id}`);
  }

  // ─── Bill Payments ───────────────────────────────────────────────────────────
  /**
   * Get all payment records applied to a specific bill (vendor invoice).
   * Returns: { vendorpayments: [...] }
   */
  async getBillPayments(billId) {
    return this.request('GET', `/bills/${billId}/payments`);
  }

  /**
   * Get all vendor payment records for a vendor.
   * @param {string} vendorId - Zoho Books vendor/contact ID
   * @param {Object} filters  - e.g. { date_start, date_end }
   * Returns: { vendorpayments: [...] }
   */
  async getVendorPayments(vendorId, filters = {}) {
    return this.request('GET', '/vendorpayments', null, {
      vendor_id: vendorId,
      ...filters,
    });
  }

  /**
   * Update a bill's custom fields (e.g. store PO reference).
   * customFields: [{ label: 'PO Reference', value: 'PO-001' }]
   */
  async updateBillCustomField(billId, poId) {
    return this.request('PUT', `/bills/${billId}`, {
      custom_fields: [{ label: 'PO Reference', value: poId }],
    });
  }

  /** Delete a bill by ID (used for rollback when invoice creation fails after bill was created). */
  async deleteBill(billId) {
    return this.request('DELETE', `/bills/${billId}`);
  }

  /**
   * Fetch custom field definitions for a Zoho Books module.
   * module: 'invoices' | 'salesorders' | 'bills' | etc.
   * Returns: array of { customfield_id, label, api_name, data_type, ... }
   */
  async getCustomFieldsByModule(module) {
    const data = await this.request('GET', '/settings/customfields', null, { module });
    const cfs = data.customfields;
    return Array.isArray(cfs) ? cfs : [];
  }

  // ─── Sales Orders ─────────────────────────────────────────────────────────────
  /**
   * Look up a Sales Order by its human-readable SO number (e.g. "SO-00123").
   * Returns: { salesorders: [...] }  ← summary list, may lack full line_items
   */
  async getSalesOrderByNumber(soNumber) {
    return this.request('GET', '/salesorders', null, { salesorder_number: soNumber });
  }

  /**
   * Fetch full Sales Order details by internal ID (includes complete line_items).
   * Returns: { salesorder: { salesorder_id, customer_id, line_items: [...], ... } }
   */
  async getSalesOrderById(soId) {
    return this.request('GET', `/salesorders/${soId}`);
  }

  // ─── Invoices (Customer Invoices) ────────────────────────────────────────────
  async createInvoice(invoiceData) {
    return this.request('POST', '/invoices', invoiceData);
  }

  async submitInvoice(invoiceId) {
    return this.request('POST', `/invoices/${invoiceId}/submit`);
  }

  async approveInvoice(invoiceId) {
    return this.request('POST', `/invoices/${invoiceId}/approve`);
  }

  async markInvoiceSent(invoiceId) {
    return this.request('POST', `/invoices/${invoiceId}/status/sent`);
  }

  /**
   * Fetch the PDF bytes for a Zoho Books invoice.
   * Returns a Buffer containing the raw PDF data.
   */
  async getInvoicePdf(invoiceId) {
    const token = await this.getAccessToken();
    const response = await axios.get(
      `${this.apiBase}/invoices/${invoiceId}`,
      {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
        params:  { organization_id: this.orgId, accept: 'pdf' },
        responseType: 'arraybuffer',
      }
    );
    return Buffer.from(response.data);
  }

  // ─── Dashboard Stats ─────────────────────────────────────────────────────────
  async getPOStats(vendorId) {
    const [open, billed, cancelled] = await Promise.allSettled([
      this.getPurchaseOrders({ status: 'open',      ...(vendorId && { vendor_id: vendorId }) }),
      this.getPurchaseOrders({ status: 'billed',    ...(vendorId && { vendor_id: vendorId }) }),
      this.getPurchaseOrders({ status: 'cancelled', ...(vendorId && { vendor_id: vendorId }) }),
    ]);

    return {
      open:       open.value?.purchaseorders?.length      ?? 0,
      billed:     billed.value?.purchaseorders?.length    ?? 0,
      cancelled:  cancelled.value?.purchaseorders?.length ?? 0,
    };
  }
}

module.exports = new ZohoBooksService();
