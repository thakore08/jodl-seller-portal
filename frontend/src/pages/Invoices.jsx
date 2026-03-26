import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Search, FileText, Filter, Sparkles } from 'lucide-react';
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
    <div className="space-y-5">
      <div className="page-hero">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="hero-title">Invoice Intelligence</h2>
            <p className="hero-subtitle">Review OCR-extracted bill data, mapping confidence, and posting status.</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="chip-soft">OCR Assisted</span>
              <span className="chip-soft">Finance Validation</span>
            </div>
          </div>
          <span className="status-live text-white/90">
            <Sparkles className="h-3.5 w-3.5" />
            Synced
          </span>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-base font-bold text-gray-900 dark:text-gray-100">Invoices</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {!loading && `${filtered.length} invoice${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={loadBills} disabled={loading} className="btn-outline shimmer-on-hover">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="control-dock flex flex-col gap-3">
        {/* Row 1: search + date range */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-0 sm:min-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              className="input pl-9"
              placeholder="Search invoice number…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
            <label className="dock-label">From</label>
            <input type="date" className="input w-full text-xs py-1.5 sm:w-36" value={from} onChange={e => setFrom(e.target.value)} />
            <label className="dock-label">To</label>
            <input type="date" className="input w-full text-xs py-1.5 sm:w-36" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </div>

        {/* Row 2: status tabs */}
        <div className="dock-tabs">
          <Filter className="ml-1 h-4 w-4 text-gray-500 dark:text-slate-300 shrink-0" />
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                status === f.value
                  ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white'
                  : 'text-gray-600 dark:text-slate-200/90 hover:bg-gray-100 dark:hover:bg-slate-700/80'
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
          <ul className="space-y-3 md:hidden motion-stagger">
            {filtered.map(b => (
              <li key={b.bill_id} className="card glow-hover p-4">
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
                        <Link to={`/payments/${b.bill_id}`} className="btn-table-action">View</Link>
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
