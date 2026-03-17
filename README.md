# JODL Seller Portal

A full-stack seller portal integrated with **Zoho Books QA** (Org ID: `60032173740`) with WhatsApp for Business support.

---

## Features

| Priority | Feature |
|----------|---------|
| 1 | View Purchase Orders from Zoho Books — Accept or Reject |
| 2 | Post Invoice against a selected PO (auto-posted to Zoho Books as a Bill) |
| 3 | WhatsApp for Business — PO notifications + Accept/Reject via WhatsApp |

---

## Project Structure

```
jodl-seller-portal/
├── backend/          # Express.js API
│   ├── src/
│   │   ├── routes/   # auth, purchaseOrders, invoices, whatsapp
│   │   ├── services/ # zohoBooksService, whatsappService
│   │   ├── middleware/
│   │   └── data/     # sellers store (replace with DB in prod)
│   └── server.js
└── frontend/         # React + Vite + Tailwind CSS
    └── src/
        ├── pages/    # Login, Dashboard, PurchaseOrders, PODetail, WhatsApp
        ├── components/
        ├── context/  # AuthContext
        └── services/ # api.js (Axios)
```

---

## Quick Start

### 1. Backend setup

```bash
cd backend
npm install
cp .env.example .env   # fill in Zoho + WhatsApp credentials
npm run dev            # http://localhost:5000
```

### 2. Frontend setup

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

### 3. Default login

| Email | Password |
|-------|----------|
| seller@demo.com | password123 |

---

## Zoho Books Configuration

You need a Zoho API OAuth application with these scopes:

```
ZohoBooks.purchaseorders.READ
ZohoBooks.purchaseorders.UPDATE
ZohoBooks.bills.CREATE
ZohoBooks.bills.READ
ZohoBooks.contacts.READ
```

**Steps to get a refresh token:**

1. Go to [Zoho API Console](https://api-console.zoho.com/)
2. Create a **Self Client** application
3. Generate a grant token with the scopes above (type: `offline_access`)
4. Exchange for a refresh token:

```bash
curl -X POST https://accounts.zoho.com/oauth/v2/token \
  -d "grant_type=authorization_code&client_id=<ID>&client_secret=<SECRET>&redirect_uri=<URI>&code=<GRANT_CODE>"
```

Add to `backend/.env`:
```
ZOHO_CLIENT_ID=...
ZOHO_CLIENT_SECRET=...
ZOHO_REFRESH_TOKEN=...
ZOHO_ORG_ID=60032173740
ZOHO_API_BASE=https://sandbox.zohoapis.com/books/v3
```

---

## WhatsApp Business (Meta Cloud API)

1. Create a Meta Developer App at [developers.facebook.com](https://developers.facebook.com/)
2. Add the **WhatsApp** product
3. Get your **Phone Number ID** and **Permanent Access Token**
4. Register the webhook URL: `https://your-domain.com/api/whatsapp/webhook`
5. Set the verify token to match `WHATSAPP_VERIFY_TOKEN` in your `.env`

Add to `backend/.env`:
```
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_VERIFY_TOKEN=jodl_verify_token
```

### WhatsApp flows

```
New PO in Zoho Books
        ↓
POST /api/purchase-orders/:id/notify
        ↓
Seller receives WhatsApp with [Accept] [Reject] buttons
        ↓
Seller taps button → webhook fires → Zoho Books updated
        ↓
Seller logs in → Create Invoice → Zoho Books Bill created
        ↓
WhatsApp confirmation sent to seller
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Seller login → JWT token |
| GET | `/api/auth/me` | Get current seller profile |
| GET | `/api/purchase-orders` | List POs (filtered by vendor_id) |
| GET | `/api/purchase-orders/stats` | PO counts by status |
| GET | `/api/purchase-orders/:id` | Get PO details |
| POST | `/api/purchase-orders/:id/accept` | Accept PO |
| POST | `/api/purchase-orders/:id/reject` | Reject PO (with reason) |
| POST | `/api/purchase-orders/:id/notify` | Send WhatsApp notification |
| GET | `/api/invoices` | List bills |
| POST | `/api/invoices` | Create bill in Zoho Books |
| GET | `/api/whatsapp/status` | WhatsApp config status |
| POST | `/api/whatsapp/send-test` | Send test WhatsApp message |
| POST | `/api/whatsapp/update-settings` | Update seller WhatsApp prefs |
| GET | `/api/whatsapp/webhook` | Meta webhook verification |
| POST | `/api/whatsapp/webhook` | Receive WhatsApp messages |

---

## Production Checklist

- [ ] Replace in-memory seller store (`src/data/sellers.js`) with a real database
- [ ] Set strong `JWT_SECRET` in environment
- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS for the public webhook URL
- [ ] Configure each seller's `vendor_id` to match their Zoho Books contact ID
- [ ] Register WhatsApp message templates in Meta Business Manager for production use
- [ ] Add rate limiting and input validation
