import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Search, CreditCard } from 'lucide-react';
import { format } from 'date-fns';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';

export default function Payments() {
  const [bills,   setBills]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');
  const [from,    setFrom]    = useState('');
  const [to,      setTo]      = useState('');

  const loadPayments = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (from)   params.append('from_date',   from);
      if (to)     params.append('to_date',     to);
      if (search) params.append('bill_number', search);
      const qs = params.toString();
      const { data } = await api.get(`/payments${qs ? `?${qs}` : ''}`);
      setBills(data.bills || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [from, to, search]);

  // Debounce search to avoid hitting backend on each keystroke
  useEffect(() => {
    const t = setTimeout(() => { loadPayments(); }, 350);
    return () => clearTimeout(t);
  }, [loadPayments]);

  const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Payments</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {!loading && `${bills.length} bill${bills.length !== 1 ? 's' : ''} found`}
          </p>
        </div>
        <button onClick={loadPayments} disabled={loading} className="btn-outline">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Search bill number…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <label className="text-xs whitespace-nowrap">From</label>
          <input type="date" className="input text-xs py-1.5 w-36" value={from} onChange={e => setFrom(e.target.value)} />
          <label className="text-xs whitespace-nowrap">To</label>
          <input type="date" className="input text-xs py-1.5 w-36" value={to}   onChange={e => setTo(e.target.value)} />
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : bills.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="h-6 w-6" />}
          title="No payment records found"
          subtitle="Payments against your invoices will appear here once processed."
        />
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {bills.map(b => (
              <li key={b.bill_id} className="card p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-bold text-brand-600 dark:text-brand-400">{b.bill_number}</p>
                  <StatusBadge status={b.payment_label || b.status} />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mb-3">
                  <span>Total: <span className="font-semibold text-gray-800 dark:text-gray-200">{b.currency_code} {fmt(b.total)}</span></span>
                  <span>Paid: <span className="font-semibold text-green-600 dark:text-green-400">{b.currency_code} {fmt(b.payment_made)}</span></span>
                  {b.balance > 0 && (
                    <span>Balance: <span className="font-semibold text-red-600 dark:text-red-400">{b.currency_code} {fmt(b.balance)}</span></span>
                  )}
                  {b.reference_number && (
                    <span className="col-span-2 truncate">PO: <span className="text-gray-700 dark:text-gray-300">{b.reference_number}</span></span>
                  )}
                </div>
                <Link to={`/payments/${b.bill_id}`} className="btn-outline w-full justify-center px-3 py-1.5 text-xs">
                  View Details
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="card overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                  <tr>
                    <th className="table-th">Bill No.</th>
                    <th className="table-th hidden lg:table-cell">PO Ref</th>
                    <th className="table-th">Bill Date</th>
                    <th className="table-th hidden lg:table-cell">Due Date</th>
                    <th className="table-th text-right">Total</th>
                    <th className="table-th text-right">Paid</th>
                    <th className="table-th text-right hidden lg:table-cell">TDS</th>
                    <th className="table-th text-right">Balance</th>
                    <th className="table-th">Status</th>
                    <th className="table-th">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {bills.map(b => (
                    <tr key={b.bill_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                      <td className="table-td font-medium text-brand-600 dark:text-brand-400">{b.bill_number}</td>
                      <td className="table-td hidden lg:table-cell text-gray-500 dark:text-gray-400">{b.reference_number || '—'}</td>
                      <td className="table-td whitespace-nowrap">{b.date ? format(new Date(b.date), 'dd MMM yyyy') : '—'}</td>
                      <td className="table-td whitespace-nowrap hidden lg:table-cell">{b.due_date ? format(new Date(b.due_date), 'dd MMM yyyy') : '—'}</td>
                      <td className="table-td text-right font-semibold whitespace-nowrap">{b.currency_code} {fmt(b.total)}</td>
                      <td className="table-td text-right whitespace-nowrap text-green-600 dark:text-green-400">{b.currency_code} {fmt(b.payment_made)}</td>
                      <td className="table-td text-right whitespace-nowrap hidden lg:table-cell text-gray-500 dark:text-gray-400">
                        {b.currency_code} {fmt(b.tds_amount)}
                      </td>
                      <td className={`table-td text-right font-semibold whitespace-nowrap ${
                        Number(b.balance) > 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}>
                        {b.currency_code} {fmt(b.balance)}
                      </td>
                      <td className="table-td"><StatusBadge status={b.payment_label || b.status} /></td>
                      <td className="table-td">
                        <Link to={`/payments/${b.bill_id}`} className="btn-outline px-3 py-1 text-xs">View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
