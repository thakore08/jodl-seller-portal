import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Search, Filter } from 'lucide-react';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import { format } from 'date-fns';

const STATUS_FILTERS = [
  { label: 'All',       value: '' },
  { label: 'Open',      value: 'open' },
  { label: 'Billed',    value: 'billed' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Draft',     value: 'draft' },
];

export default function PurchaseOrders() {
  const [pos,     setPOs]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [status,  setStatus]  = useState('');
  const [search,  setSearch]  = useState('');

  const loadPOs = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = status ? `?status=${status}` : '';
      const { data } = await api.get(`/purchase-orders${params}`);
      setPOs(data.purchaseorders || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { loadPOs(); }, [loadPOs]);

  const filtered = pos.filter(po =>
    !search ||
    po.purchaseorder_number?.toLowerCase().includes(search.toLowerCase()) ||
    po.vendor_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Purchase Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Search PO number…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
          <Filter className="ml-1 h-4 w-4 text-gray-400 shrink-0" />
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                status === f.value
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="table-th">PO Number</th>
              <th className="table-th">Date</th>
              <th className="table-th hidden lg:table-cell">Expected Delivery</th>
              <th className="table-th hidden md:table-cell">Items</th>
              <th className="table-th">Total</th>
              <th className="table-th">Status</th>
              <th className="table-th">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center">
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-sm text-gray-400">
                  {search ? 'No POs match your search.' : 'No purchase orders found.'}
                </td>
              </tr>
            ) : filtered.map(po => (
              <tr key={po.purchaseorder_id} className="hover:bg-gray-50 transition-colors">
                <td className="table-td font-medium text-brand-600">{po.purchaseorder_number}</td>
                <td className="table-td">{po.date ? format(new Date(po.date), 'dd MMM yyyy') : '—'}</td>
                <td className="table-td hidden lg:table-cell">
                  {po.expected_delivery_date
                    ? format(new Date(po.expected_delivery_date), 'dd MMM yyyy')
                    : '—'}
                </td>
                <td className="table-td hidden md:table-cell">
                  {po.line_items?.length ?? '—'}
                </td>
                <td className="table-td font-semibold">
                  {po.currency_code} {Number(po.total || 0).toLocaleString('en-IN')}
                </td>
                <td className="table-td"><StatusBadge status={po.status} /></td>
                <td className="table-td">
                  <Link
                    to={`/purchase-orders/${po.purchaseorder_id}`}
                    className="btn-outline px-3 py-1 text-xs"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
