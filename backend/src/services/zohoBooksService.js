/**
 * Zoho Books Service
 * Handles all Zoho Books API v3 interactions for the JODL Seller Portal.
 * Organisation: 60032173740 (QA / Sandbox)
 */
const axios = require('axios');

class ZohoBooksService {
  constructor() {
    this.orgId    = process.env.ZOHO_ORG_ID    || '60032173740';
    this.apiBase  = process.env.ZOHO_API_BASE  || 'https://sandbox.zohoapis.com/books/v3';
    this.authUrl  = process.env.ZOHO_AUTH_URL  || 'https://accounts.zoho.com/oauth/v2/token';
    this._token   = null;
    this._expiry  = null;
  }

  // ─── OAuth Token Management ──────────────────────────────────────────────────
  async getAccessToken() {
    if (this._token && this._expiry && Date.now() < this._expiry) {
      return this._token;
    }

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
    return this._token;
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
      const msg = err.response?.data?.message || err.message;
      const status = err.response?.status || 500;
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
