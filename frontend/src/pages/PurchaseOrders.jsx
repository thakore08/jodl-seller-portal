import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Search, Filter } from 'lucide-react';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import { format } from 'date-fns';

const STATUS_FILTERS = [
  { label: 'All',           value: '',              localFilter: null },
  { label: 'Open',          value: 'open',          localFilter: null },
  { label: 'In Production', value: 'open',          localFilter: 'in_production' },
  { label: 'Dispatched',    value: 'open',          localFilter: 'dispatched' },
  { label: 'Billed',        value: 'billed',        localFilter: null },
  { label: 'Cancelled',     value: 'cancelled',     localFilter: null },
  { label: 'Draft',         value: 'draft',         localFilter: null },
];

export default function PurchaseOrders() {
  const [pos,         setPOs]         = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [activeFilter, setActiveFilter] = useState(STATUS_FILTERS[0]);
  const [search,      setSearch]      = useState('');

  const loadPOs = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = activeFilter.value ? `?status=${activeFilter.value}` : '';
      const { data } = await api.get(`/purchase-orders${params}`);
      setPOs(data.purchaseorders || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  }, [activeFilter.value]);

  useEffect(() => { loadPOs(); }, [loadPOs]);

  const filtered = pos.filter(po => {
    // Client-side local_status filter (for In Production / Dispatched tabs)
    if (activeFilter.localFilter) {
      if (po.local_status !== activeFilter.localFilter) return false;
    } else if (activeFilter.value === 'open') {
      // "Open" tab: exclude locally-overridden ones (they appear in their own tabs)
      // Actually show all open POs including those with local_status for the main Open tab
    }
    if (!search) return true;
    return (
      po.purchaseorder_number?.toLowerCase().includes(search.toLowerCase()) ||
      po.vendor_name?.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Purchase Orders</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {!loading && `${filtered.length} order${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={loadPOs} disabled={loading} className="btn-outline">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
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
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1">
          <Filter className="ml-1 h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
          {STATUS_FILTERS.map(f => {
            const isActive = activeFilter.label === f.label;
            return (
              <button
                key={f.label}
                onClick={() => setActiveFilter(f)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white'
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

      {/* Mobile card list */}
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
          <ul className="space-y-3 md:hidden">
            {filtered.map(po => (
              <li key={po.purchaseorder_id} className="card p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-bold text-brand-600 dark:text-brand-400">{po.purchaseorder_number}</p>
                  <StatusBadge status={po.local_status || po.status} />
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
                      <td className="table-td"><StatusBadge status={po.local_status || po.status} /></td>
                      <td className="table-td">
                        <Link to={`/purchase-orders/${po.purchaseorder_id}`} className="btn-outline px-3 py-1 text-xs">
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
