import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Search, FileText, Filter, MessageCircle } from 'lucide-react';
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

// WhatsApp invoice status → display label + colour
const WA_STATUS_MAP = {
  pending_admin_review: { label: 'Pending Review', colour: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700' },
  posted:               { label: 'Posted',         colour: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700' },
  correction_requested: { label: 'Correction Req', colour: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700' },
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

// ─── WhatsApp Invoice Card ─────────────────────────────────────────────────────
function WaInvoiceCard({ inv, onConfirm, onRequestCorrection }) {
  const [correctionNote, setCorrectionNote] = useState('');
  const [showCorrForm,   setShowCorrForm]   = useState(false);
  const [loading,        setLoading]        = useState(false);

  const statusInfo  = WA_STATUS_MAP[inv.status] || { label: inv.status, colour: '' };
  const header      = inv.extractedData?.header || {};
  const invoiceNo   = header.invoice_number  || '—';
  const amount      = header.total_amount    || 0;
  const invoiceDate = header.invoice_date    || inv.createdAt?.split('T')[0];

  async function handleConfirm() {
    setLoading(true);
    try { await onConfirm(inv.id); } finally { setLoading(false); }
  }

  async function handleCorrection(e) {
    e.preventDefault();
    if (!correctionNote.trim()) return;
    setLoading(true);
    try {
      await onRequestCorrection(inv.id, correctionNote.trim());
      setShowCorrForm(false);
      setCorrectionNote('');
    } finally { setLoading(false); }
  }

  return (
    <div className="card p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-green-500 shrink-0" />
          <p className="text-sm font-bold text-brand-600 dark:text-brand-400">{invoiceNo}</p>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded border ${statusInfo.colour}`}>
          {statusInfo.label}
        </span>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span>PO: <span className="text-gray-700 dark:text-gray-300">{inv.poNumber || '—'}</span></span>
        <span>Date: <span className="text-gray-700 dark:text-gray-300">{invoiceDate || '—'}</span></span>
        <span className="col-span-2">
          Amount: <span className="font-semibold text-gray-800 dark:text-gray-200">
            ₹{Number(amount).toLocaleString('en-IN')}
          </span>
        </span>
        <span className="col-span-2 text-gray-400 dark:text-gray-500 text-xs">
          Received: {format(new Date(inv.createdAt), 'dd MMM yyyy HH:mm')}
        </span>
      </div>

      {/* File link */}
      {inv.filePath && (
        <a
          href={`/uploads/${inv.filePath}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
        >
          📎 View invoice file
        </a>
      )}

      {/* Admin note if correction was requested */}
      {inv.adminNote && (
        <p className="text-xs text-red-600 dark:text-red-400 italic">
          Correction note: {inv.adminNote}
        </p>
      )}

      {/* Actions — only for pending review */}
      {inv.status === 'pending_admin_review' && (
        <div className="space-y-2 pt-1">
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="btn-primary w-full justify-center px-3 py-1.5 text-xs"
          >
            {loading ? 'Posting…' : '✅ Post to Zoho Books'}
          </button>

          {!showCorrForm ? (
            <button
              onClick={() => setShowCorrForm(true)}
              className="btn-outline w-full justify-center px-3 py-1.5 text-xs"
            >
              ✏️ Request Correction
            </button>
          ) : (
            <form onSubmit={handleCorrection} className="space-y-2">
              <textarea
                className="input text-xs w-full h-20 resize-none"
                placeholder="Describe what needs to be corrected…"
                value={correctionNote}
                onChange={e => setCorrectionNote(e.target.value)}
                required
              />
              <div className="flex gap-2">
                <button type="submit" disabled={loading || !correctionNote.trim()}
                  className="btn-primary flex-1 text-xs py-1.5">
                  Send
                </button>
                <button type="button" onClick={() => setShowCorrForm(false)}
                  className="btn-outline flex-1 text-xs py-1.5">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Invoices Page ────────────────────────────────────────────────────────
export default function Invoices() {
  const [activeTab, setActiveTab] = useState('zoho');   // 'zoho' | 'whatsapp'

  // Zoho bills state
  const [bills,   setBills]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [status,  setStatus]  = useState('');
  const [search,  setSearch]  = useState('');
  const [from,    setFrom]    = useState('');
  const [to,      setTo]      = useState('');

  // WhatsApp invoices state
  const [waInvoices,    setWaInvoices]    = useState([]);
  const [waLoading,     setWaLoading]     = useState(false);
  const [waError,       setWaError]       = useState('');

  // ── Load Zoho bills ────────────────────────────────────────────────────────
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

  // ── Load WhatsApp invoices ─────────────────────────────────────────────────
  const loadWaInvoices = useCallback(async () => {
    setWaLoading(true); setWaError('');
    try {
      const { data } = await api.get('/invoices/whatsapp');
      setWaInvoices(data.invoices || []);
    } catch (err) {
      setWaError(err.response?.data?.message || 'Failed to load WhatsApp invoices');
    } finally {
      setWaLoading(false);
    }
  }, []);

  useEffect(() => { loadBills(); }, [loadBills]);
  useEffect(() => { loadWaInvoices(); }, [loadWaInvoices]);

  const pendingWaCount = waInvoices.filter(i => i.status === 'pending_admin_review').length;

  const filtered = bills.filter(b =>
    !search ||
    b.bill_number?.toLowerCase().includes(search.toLowerCase()) ||
    b.reference_number?.toLowerCase().includes(search.toLowerCase())
  );

  // ── WA invoice actions ─────────────────────────────────────────────────────
  async function handleConfirm(id) {
    await api.post(`/invoices/${id}/confirm`);
    loadWaInvoices();
  }

  async function handleRequestCorrection(id, note) {
    await api.post(`/invoices/${id}/request-correction`, { note });
    loadWaInvoices();
  }

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
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Invoices</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {activeTab === 'zoho'
              ? (!loading && `${filtered.length} invoice${filtered.length !== 1 ? 's' : ''}`)
              : `${waInvoices.length} WhatsApp upload${waInvoices.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={activeTab === 'zoho' ? loadBills : loadWaInvoices}
          disabled={activeTab === 'zoho' ? loading : waLoading}
          className="btn-outline"
        >
          <RefreshCw className={`h-4 w-4 ${(activeTab === 'zoho' ? loading : waLoading) ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1 w-fit">
        <button
          onClick={() => setActiveTab('zoho')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'zoho'
              ? 'bg-brand-600 text-white'
              : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          All Invoices
        </button>
        <button
          onClick={() => setActiveTab('whatsapp')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'whatsapp'
              ? 'bg-green-600 text-white'
              : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
          }`}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          WhatsApp Uploads
          {pendingWaCount > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              activeTab === 'whatsapp' ? 'bg-white text-green-700' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
            }`}>
              {pendingWaCount}
            </span>
          )}
        </button>
      </div>

      {/* ── WhatsApp Invoices tab ────────────────────────────────────────────── */}
      {activeTab === 'whatsapp' && (
        <>
          {waError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">{waError}</div>
          )}
          {waLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-green-600 border-t-transparent" />
            </div>
          ) : waInvoices.length === 0 ? (
            <EmptyState
              icon={<MessageCircle className="h-6 w-6" />}
              title="No WhatsApp invoices"
              subtitle="Invoices sent via WhatsApp by vendors will appear here for review."
            />
          ) : (
            <>
              {/* Mobile cards */}
              <ul className="space-y-3 md:hidden">
                {waInvoices.map(inv => (
                  <li key={inv.id}>
                    <WaInvoiceCard
                      inv={inv}
                      onConfirm={handleConfirm}
                      onRequestCorrection={handleRequestCorrection}
                    />
                  </li>
                ))}
              </ul>

              {/* Desktop table */}
              <div className="card overflow-hidden hidden md:block">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                      <tr>
                        <th className="table-th">Source</th>
                        <th className="table-th">Invoice No.</th>
                        <th className="table-th">PO Number</th>
                        <th className="table-th">Amount</th>
                        <th className="table-th">Received</th>
                        <th className="table-th">Status</th>
                        <th className="table-th">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                      {waInvoices.map(inv => {
                        const header     = inv.extractedData?.header || {};
                        const invoiceNo  = header.invoice_number || '—';
                        const amount     = header.total_amount   || 0;
                        const statusInfo = WA_STATUS_MAP[inv.status] || { label: inv.status, colour: '' };

                        return (
                          <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                            <td className="table-td">
                              <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400 text-xs font-medium">
                                <MessageCircle className="h-3.5 w-3.5" />
                                WhatsApp
                              </span>
                            </td>
                            <td className="table-td font-medium text-brand-600 dark:text-brand-400">{invoiceNo}</td>
                            <td className="table-td text-gray-500 dark:text-gray-400">{inv.poNumber || '—'}</td>
                            <td className="table-td font-semibold whitespace-nowrap">
                              ₹{Number(amount).toLocaleString('en-IN')}
                            </td>
                            <td className="table-td whitespace-nowrap text-xs">
                              {format(new Date(inv.createdAt), 'dd MMM yyyy HH:mm')}
                            </td>
                            <td className="table-td">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded border ${statusInfo.colour}`}>
                                {statusInfo.label}
                              </span>
                            </td>
                            <td className="table-td">
                              <div className="flex gap-2">
                                {inv.filePath && (
                                  <a href={`/uploads/${inv.filePath}`} target="_blank" rel="noopener noreferrer"
                                    className="btn-outline px-2 py-1 text-xs">
                                    View
                                  </a>
                                )}
                                {inv.status === 'pending_admin_review' && (
                                  <>
                                    <button
                                      onClick={() => handleConfirm(inv.id)}
                                      className="btn-primary px-2 py-1 text-xs"
                                    >
                                      Post
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── Zoho Bills tab ───────────────────────────────────────────────────── */}
      {activeTab === 'zoho' && (
        <>
          {/* Filters */}
          <div className="flex flex-col gap-3">
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
        </>
      )}
    </div>
  );
}
