/**
 * Payments routes — read-only payment visibility for sellers.
 * Accessible by: seller_admin, finance_user
 *
 * GET /api/payments              → list bills with payment status
 * GET /api/payments/:bill_id     → single bill + payment records + TDS breakdown
 */
const express = require('express');
const zoho    = require('../services/zohoBooksService');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authenticate);
router.use(requireRole('seller_admin', 'finance_user'));

// ─── GET /api/payments ────────────────────────────────────────────────────────
// List all bills for the seller with payment status.
// Query params: from_date, to_date, bill_number, page
router.get('/', async (req, res) => {
  const { from_date, to_date, bill_number, page = 1 } = req.query;
  const vendorId = req.seller.vendor_id;

  const params = { page };
  if (vendorId)    params.vendor_id   = vendorId;
  if (from_date)   params.date_start  = from_date;
  if (to_date)     params.date_end    = to_date;
  if (bill_number) params.bill_number = bill_number;

  const data = await zoho.getBills(params);

  // Normalise payment status label for frontend
  const bills = (data.bills || []).map(bill => ({
    ...bill,
    payment_label: getPaymentLabel(bill.status, bill.payment_made, bill.total),
  }));

  res.json({ bills, page_context: data.page_context });
});

// ─── GET /api/payments/:bill_id ───────────────────────────────────────────────
// Single bill + all payment records applied to it.
router.get('/:bill_id', async (req, res) => {
  const { bill_id } = req.params;

  const [billData, paymentsData] = await Promise.allSettled([
    zoho.getBillById(bill_id),
    zoho.getBillPayments(bill_id),
  ]);

  const bill     = billData.status     === 'fulfilled' ? billData.value?.bill         : null;
  const payments = paymentsData.status === 'fulfilled' ? paymentsData.value?.vendorpayments ?? [] : [];

  if (!bill) {
    return res.status(404).json({ error: true, message: 'Bill not found' });
  }

  // Compute TDS totals from payment records
  const totalTds    = payments.reduce((sum, p) => sum + (parseFloat(p.tds_amount) || 0), 0);
  const totalPaid   = parseFloat(bill.payment_made) || 0;
  const totalAmount = parseFloat(bill.total)        || 0;
  const balance     = parseFloat(bill.balance)      || 0;

  res.json({
    bill: {
      ...bill,
      payment_label: getPaymentLabel(bill.status, bill.payment_made, bill.total),
    },
    payments,
    summary: {
      total_amount: totalAmount,
      total_paid:   totalPaid,
      total_tds:    totalTds,
      balance_due:  balance,
    },
  });
});

// ─── Helper ───────────────────────────────────────────────────────────────────
function getPaymentLabel(status, paymentMade, total) {
  if (status === 'paid')                 return 'paid';
  if (status === 'overdue')              return 'overdue';
  if (parseFloat(paymentMade) > 0)       return 'partially_paid';
  if (parseFloat(paymentMade) === 0)     return 'unpaid';
  return status;
}

module.exports = router;
