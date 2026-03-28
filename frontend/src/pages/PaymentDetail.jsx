import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, CreditCard, Calendar, Building2, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';

function InfoRow({ label, value, className = '' }) {
  return (
    <div>
      <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
      <p className={`text-sm font-medium text-gray-900 dark:text-gray-100 ${className}`}>{value || '—'}</p>
    </div>
  );
}

export default function PaymentDetail() {
  const { id }        = useParams();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    setLoading(true); setError('');
    api.get(`/payments/${id}`)
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.message || 'Failed to load payment details'))
      .finally(() => setLoading(false));
  }, [id]);

  const fmt = v => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const { bill, payments, summary } = data;

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="page-hero">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="hero-title">Payment Detail Lens</h2>
            <p className="hero-subtitle">Deep view into payment history, TDS deductions, and balance movement.</p>
            <div className="mt-3">
              <span className="chip-soft">Bill: {bill.bill_number}</span>
            </div>
          </div>
          <span className="status-live text-white/90">
            <Sparkles className="h-3.5 w-3.5" />
            Reconciled
          </span>
        </div>
      </div>

      {/* Back */}
      <Link to="/payments" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
        <ArrowLeft className="h-4 w-4" /> Back to Payments
      </Link>

      {/* Bill Header */}
      <div className="card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">{bill.bill_number}</h1>
              <StatusBadge status={data.payment_label || bill.status} />
            </div>
            {bill.vendor_name && (
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {bill.vendor_name}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 border-t border-gray-100 dark:border-gray-700 pt-4">
          <InfoRow
            label="Bill Date"
            value={bill.date ? format(new Date(bill.date), 'dd MMM yyyy') : '—'}
          />
          <InfoRow
            label="Due Date"
            value={bill.due_date ? format(new Date(bill.due_date), 'dd MMM yyyy') : '—'}
          />
          <InfoRow
            label="PO Reference"
            value={bill.reference_number || bill.purchaseorder_number}
          />
          <InfoRow
            label="Currency"
            value={bill.currency_code}
          />
        </div>
      </div>

      {/* Payment Summary */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          Payment Summary
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Bill Total</p>
            <p className="text-base font-bold text-gray-900 dark:text-gray-100">
              {bill.currency_code} {fmt(summary?.total_amount ?? bill.total)}
            </p>
          </div>
          <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Total Paid</p>
            <p className="text-base font-bold text-green-600 dark:text-green-400">
              {bill.currency_code} {fmt(summary?.total_paid ?? bill.payment_made)}
            </p>
          </div>
          <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">TDS Deducted</p>
            <p className="text-base font-bold text-amber-600 dark:text-amber-400">
              {bill.currency_code} {fmt(summary?.total_tds ?? bill.tds_amount)}
            </p>
          </div>
          <div className={`text-center p-3 rounded-lg ${
            Number(summary?.balance_due ?? bill.balance) > 0
              ? 'bg-red-50 dark:bg-red-900/20'
              : 'bg-gray-50 dark:bg-gray-700/50'
          }`}>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Balance Due</p>
            <p className={`text-base font-bold ${
              Number(summary?.balance_due ?? bill.balance) > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-500 dark:text-gray-400'
            }`}>
              {bill.currency_code} {fmt(summary?.balance_due ?? bill.balance)}
            </p>
          </div>
        </div>
      </div>

      {/* Payment History */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            Payment History
          </h2>
        </div>

        {!payments || payments.length === 0 ? (
          <EmptyState
            icon={<CreditCard className="h-5 w-5" />}
            title="No payments recorded"
            subtitle="Payments against this bill will appear here once processed by JODL."
          />
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="divide-y divide-gray-100 dark:divide-gray-700 sm:hidden">
              {payments.map((p, idx) => (
                <li key={p.payment_id || idx} className="px-4 py-3 space-y-1">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {bill.currency_code} {fmt(p.amount_applied ?? p.amount)}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {p.date ? format(new Date(p.date), 'dd MMM yyyy') : '—'}
                    </p>
                  </div>
                  {p.payment_number && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">Ref: {p.payment_number}</p>
                  )}
                  {p.tds_amount > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">TDS: {bill.currency_code} {fmt(p.tds_amount)}</p>
                  )}
                  {p.payment_mode && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">Mode: {p.payment_mode}</p>
                  )}
                  {p.reference_number && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">UTR/Ref: {p.reference_number}</p>
                  )}
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="table-th">Date</th>
                    <th className="table-th">Payment No.</th>
                    <th className="table-th text-right">Amount</th>
                    <th className="table-th text-right">TDS Deducted</th>
                    <th className="table-th">Mode</th>
                    <th className="table-th">Reference / UTR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {payments.map((p, idx) => (
                    <tr key={p.payment_id || idx}>
                      <td className="table-td whitespace-nowrap">{p.date ? format(new Date(p.date), 'dd MMM yyyy') : '—'}</td>
                      <td className="table-td text-gray-600 dark:text-gray-300">{p.payment_number || '—'}</td>
                      <td className="table-td text-right font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">
                        {bill.currency_code} {fmt(p.amount_applied ?? p.amount)}
                      </td>
                      <td className="table-td text-right whitespace-nowrap text-amber-600 dark:text-amber-400">
                        {p.tds_amount > 0 ? `${bill.currency_code} ${fmt(p.tds_amount)}` : '—'}
                      </td>
                      <td className="table-td text-gray-500 dark:text-gray-400">{p.payment_mode || '—'}</td>
                      <td className="table-td text-gray-500 dark:text-gray-400">{p.reference_number || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
