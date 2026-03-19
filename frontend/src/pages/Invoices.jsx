import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Search, FileText, Filter } from 'lucide-react';
import { format } from 'date-fns';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';

// Map Zoho bill status → display label + badge key
const BILL_STATUS_MAP = {
  draft:         { label: 'Draft',          badge: 'draft' },
  open:          { label: 'Sent',           badge: 'sent' },
  paid:          { label: 'Approved',       badge: 'approved' },
  overdue:       { label: 'Overdue',        badge: 'overdue' },
  partially_paid:{ label: 'Partially Paid', badge: 'partially_paid' },
  void:          { label: 'Void',           badge: 'cancelled' },
};

const STATUS_FILTERS = [
  { label: 'All',           value: '' },
  { label: 'Draft',         value: 'draft' },
  { label: 'Sent',          value: 'open' },
  { label: 'Approved',      value: 'paid' },
  { label: 'Partially Paid',value: 'partially_paid' },
  { label: 'Overdue',       value: 'overdue' },
];

function getBadgeStatus(bill) {
  const key = (bill.status || '').toLowerCase();
  return BILL_STATUS_MAP[key]?.badge || key;
}

export default function Invoices() {
  const [bills,   setBills]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [status,  setStatus]  = useState('');
  const [search,  setSearch]  = useState('');
  const [from,    setFrom]    = useState('');
  const [to,      setTo]      = useState('');

  const loadBills = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      if (from)   params.append('date_start', from);
      if (to)     params.append('date_end', to);
      const qs = params.toString();
      const { data } = await api.get(`/invoices${qs ? `?${qs}` : ''}`);
      setBills(data.bills || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [status, from, to]);

  useEffect(() => { loadBills(); }, [loadBills]);

  const filtered = bills.filter(b =>
    !search ||
    b.bill_number?.toLowerCase().includes(search.toLowerCase()) ||
    b.reference_number?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Invoices</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {!loading && `${filtered.length} invoice${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={loadBills} disabled={loading} className="btn-outline">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        {/* Row 1: search + date range */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              className="input pl-9"
              placeholder="Search invoice number…"
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

        {/* Row 2: status tabs */}
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1 w-fit">
          <Filter className="ml-1 h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                status === f.value
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No invoices found"
          subtitle={search ? 'Try a different search term.' : 'Invoices you post against purchase orders will appear here.'}
          action={
            <Link to="/purchase-orders" className="btn-outline text-xs">
              Go to Purchase Orders
            </Link>
          }
        />
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {filtered.map(b => (
              <li key={b.bill_id} className="card p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-bold text-brand-600 dark:text-brand-400">{b.bill_number}</p>
                  <StatusBadge status={getBadgeStatus(b)} />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mb-3">
                  <span>Date: <span className="text-gray-700 dark:text-gray-300">{b.date ? format(new Date(b.date), 'dd MMM yyyy') : '—'}</span></span>
                  <span>Due: <span className="text-gray-700 dark:text-gray-300">{b.due_date ? format(new Date(b.due_date), 'dd MMM yyyy') : '—'}</span></span>
                  <span>Total: <span className="font-semibold text-gray-800 dark:text-gray-200">{b.currency_code} {Number(b.total || 0).toLocaleString('en-IN')}</span></span>
                  <span>Paid: <span className="font-semibold text-green-600 dark:text-green-400">{b.currency_code} {Number(b.payment_made || 0).toLocaleString('en-IN')}</span></span>
                  {b.reference_number && (
                    <span className="col-span-2 truncate">PO Ref: <span className="text-gray-700 dark:text-gray-300">{b.reference_number}</span></span>
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
                    <th className="table-th">Date</th>
                    <th className="table-th hidden lg:table-cell">Due Date</th>
                    <th className="table-th text-right">Total</th>
                    <th className="table-th text-right hidden lg:table-cell">Paid</th>
                    <th className="table-th">Status</th>
                    <th className="table-th">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {filtered.map(b => (
                    <tr key={b.bill_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                      <td className="table-td font-medium text-brand-600 dark:text-brand-400">{b.bill_number}</td>
                      <td className="table-td hidden lg:table-cell text-gray-500 dark:text-gray-400">{b.reference_number || '—'}</td>
                      <td className="table-td whitespace-nowrap">{b.date ? format(new Date(b.date), 'dd MMM yyyy') : '—'}</td>
                      <td className="table-td whitespace-nowrap hidden lg:table-cell">{b.due_date ? format(new Date(b.due_date), 'dd MMM yyyy') : '—'}</td>
                      <td className="table-td text-right font-semibold whitespace-nowrap">
                        {b.currency_code} {Number(b.total || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="table-td text-right whitespace-nowrap hidden lg:table-cell text-green-600 dark:text-green-400">
                        {b.currency_code} {Number(b.payment_made || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="table-td"><StatusBadge status={getBadgeStatus(b)} /></td>
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
