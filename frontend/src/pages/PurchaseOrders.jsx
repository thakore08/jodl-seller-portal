import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Search, Filter, Sparkles } from 'lucide-react';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import { format } from 'date-fns';

// ─── Effective status (kept in sync with PODetail.jsx) ───────────────────────
// local_status checked first — accept/reject are portal-local; Zoho stays 'issued'.
// Zoho 'open' maps to 'issued' (not 'accepted') — portal acceptance is always explicit.
function getEffectiveStatus(po) {
  if (!po) return null;
  if (po.local_status === 'rejected')   return 'rejected';
  if (po.local_status === 'dispatched') return 'dispatched';
  if (po.local_status === 'accepted')   return 'accepted';
  if (po.status === 'cancelled') return 'rejected';
  if (po.status === 'billed')    return 'invoiced';
  if (po.status === 'open')      return 'issued';   // requires explicit portal acceptance
  if (po.status === 'issued')    return 'issued';
  return null;
}

// ─── Status filter tabs ───────────────────────────────────────────────────────
// zohoStatus: passed as ?status= query to backend (narrows Zoho fetch when possible)
// effectiveStatuses: client-side filter by getEffectiveStatus(po) result; null = show all
//
// NOTE: "Issued" uses zohoStatus:'' (fetch all) because both Zoho 'issued' and
// Zoho 'open' (without local acceptance) map to effective 'issued'.
const STATUS_FILTERS = [
  { label: 'All',        zohoStatus: '',       effectiveStatuses: null },
  { label: 'Issued',     zohoStatus: '',       effectiveStatuses: ['issued'] },
  { label: 'Accepted',   zohoStatus: '',       effectiveStatuses: ['accepted'] },
  { label: 'Dispatched', zohoStatus: '',       effectiveStatuses: ['dispatched'] },
  { label: 'Invoiced',   zohoStatus: 'billed', effectiveStatuses: ['invoiced'] },
  { label: 'Rejected',   zohoStatus: '',       effectiveStatuses: ['rejected'] },
];

export default function PurchaseOrders() {
  const [pos,          setPOs]          = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [activeFilter, setActiveFilter] = useState(STATUS_FILTERS[0]);
  const [search,       setSearch]       = useState('');

  const loadPOs = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = activeFilter.zohoStatus ? `?status=${activeFilter.zohoStatus}` : '';
      const { data } = await api.get(`/purchase-orders${params}`);
      setPOs(data.purchaseorders || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  }, [activeFilter.zohoStatus]);

  useEffect(() => { loadPOs(); }, [loadPOs]);

  // Client-side filter: effective status + search
  const filtered = pos.filter(po => {
    const eff = getEffectiveStatus(po);
    if (activeFilter.effectiveStatuses) {
      if (!activeFilter.effectiveStatuses.includes(eff)) return false;
    }
    if (!search) return true;
    return (
      po.purchaseorder_number?.toLowerCase().includes(search.toLowerCase()) ||
      po.vendor_name?.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="space-y-5">
      <div className="page-hero">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="hero-title">Purchase Order Operations</h2>
            <p className="hero-subtitle">Manage order acceptance, dispatch readiness, and billing transition.</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="chip-soft">Lifecycle Tracking</span>
              <span className="chip-soft">Role-aware Actions</span>
            </div>
          </div>
          <span className="status-live text-white/90">
            <Sparkles className="h-3.5 w-3.5" />
            Active
          </span>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-base font-bold text-gray-900 dark:text-gray-100">Purchase Orders</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {!loading && `${filtered.length} order${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={loadPOs} disabled={loading} className="btn-outline shimmer-on-hover">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="control-dock flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-0 sm:min-w-[260px] max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Search PO number…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Status tabs */}
        <div className="dock-tabs">
          <Filter className="ml-1 h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
          {STATUS_FILTERS.map(f => {
            const isActive = activeFilter.label === f.label;
            return (
              <button
                key={f.label}
                onClick={() => setActiveFilter(f)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white'
                    : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
              >
                {f.label}
              </button>
            );
          })}
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
        <div className="card py-14 text-center text-sm text-gray-400 dark:text-gray-500">
          {search ? 'No POs match your search.' : 'No purchase orders found.'}
        </div>
      ) : (
        <>
          {/* Mobile cards — visible below md */}
          <ul className="space-y-3 md:hidden motion-stagger">
            {filtered.map(po => (
              <li key={po.purchaseorder_id} className="card glow-hover p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-bold text-brand-600 dark:text-brand-400">{po.purchaseorder_number}</p>
                  <StatusBadge status={getEffectiveStatus(po)} />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mb-3">
                  <span>Date: <span className="text-gray-700 dark:text-gray-300">{po.date ? format(new Date(po.date), 'dd MMM yyyy') : '—'}</span></span>
                  <span>Total: <span className="font-semibold text-gray-800 dark:text-gray-200">{po.currency_code} {Number(po.total || 0).toLocaleString('en-IN')}</span></span>
                  {po.vendor_name && (
                    <span className="col-span-2 truncate">Vendor: <span className="text-gray-700 dark:text-gray-300">{po.vendor_name}</span></span>
                  )}
                </div>
                <Link
                  to={`/purchase-orders/${po.purchaseorder_id}`}
                  className="btn-outline w-full justify-center px-3 py-1.5 text-xs"
                >
                  View Details
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop table — visible from md up */}
          <div className="card overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                  <tr>
                    <th className="table-th">PO Number</th>
                    <th className="table-th">Date</th>
                    <th className="table-th hidden lg:table-cell">Expected Delivery</th>
                    <th className="table-th hidden lg:table-cell">Vendor</th>
                    <th className="table-th">Total</th>
                    <th className="table-th">Status</th>
                    <th className="table-th">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {filtered.map(po => (
                    <tr key={po.purchaseorder_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                      <td className="table-td font-medium text-brand-600 dark:text-brand-400">{po.purchaseorder_number}</td>
                      <td className="table-td whitespace-nowrap">{po.date ? format(new Date(po.date), 'dd MMM yyyy') : '—'}</td>
                      <td className="table-td whitespace-nowrap hidden lg:table-cell">
                        {po.expected_delivery_date ? format(new Date(po.expected_delivery_date), 'dd MMM yyyy') : '—'}
                      </td>
                      <td className="table-td hidden lg:table-cell max-w-[160px] truncate">{po.vendor_name || '—'}</td>
                      <td className="table-td font-semibold whitespace-nowrap">
                        {po.currency_code} {Number(po.total || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="table-td"><StatusBadge status={getEffectiveStatus(po)} /></td>
                      <td className="table-td">
                        <Link to={`/purchase-orders/${po.purchaseorder_id}`} className="btn-table-action">
                          View
                        </Link>
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
