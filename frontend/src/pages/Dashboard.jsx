import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, CheckCircle, XCircle, FileText, ArrowRight, RefreshCw } from 'lucide-react';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import { format } from 'date-fns';

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats,    setStats]    = useState(null);
  const [recentPOs, setRecentPOs] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const loadData = async () => {
    setLoading(true); setError('');
    try {
      const [statsRes, poRes] = await Promise.all([
        api.get('/purchase-orders/stats'),
        api.get('/purchase-orders?per_page=5'),
      ]);
      setStats(statsRes.data);
      setRecentPOs(poRes.data.purchaseorders || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const total = stats ? (stats.open + stats.billed + stats.cancelled) : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Overview of your purchase orders</p>
        </div>
        <button onClick={loadData} disabled={loading} className="btn-outline gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total POs"   value={total}           icon={ShoppingCart} color="bg-brand-600" />
        <StatCard label="Open / Pending" value={stats?.open}  icon={FileText}     color="bg-amber-500" />
        <StatCard label="Billed"      value={stats?.billed}   icon={CheckCircle}  color="bg-green-600" />
        <StatCard label="Cancelled"   value={stats?.cancelled} icon={XCircle}     color="bg-red-500"   />
      </div>

      {/* Recent POs */}
      <div className="card">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">Recent Purchase Orders</h2>
          <Link to="/purchase-orders" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          </div>
        ) : recentPOs.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No purchase orders found.</div>
        ) : (
          <>
            {/* Mobile card list */}
            <ul className="divide-y divide-gray-100 sm:hidden">
              {recentPOs.map(po => (
                <li key={po.purchaseorder_id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-brand-600 truncate">{po.purchaseorder_number}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {po.date ? format(new Date(po.date), 'dd MMM yyyy') : '—'}
                      </p>
                    </div>
                    <StatusBadge status={po.status} />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-800">
                      {po.currency_code} {Number(po.total || 0).toLocaleString('en-IN')}
                    </p>
                    <Link to={`/purchase-orders/${po.purchaseorder_id}`} className="text-xs font-medium text-brand-600 hover:underline">
                      View →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-th">PO Number</th>
                    <th className="table-th">Date</th>
                    <th className="table-th hidden md:table-cell">Expected Delivery</th>
                    <th className="table-th">Amount</th>
                    <th className="table-th">Status</th>
                    <th className="table-th" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentPOs.map(po => (
                    <tr key={po.purchaseorder_id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-td font-medium text-brand-600">{po.purchaseorder_number}</td>
                      <td className="table-td">{po.date ? format(new Date(po.date), 'dd MMM yyyy') : '—'}</td>
                      <td className="table-td hidden md:table-cell">
                        {po.expected_delivery_date ? format(new Date(po.expected_delivery_date), 'dd MMM yyyy') : '—'}
                      </td>
                      <td className="table-td font-medium">
                        {po.currency_code} {Number(po.total || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="table-td"><StatusBadge status={po.status} /></td>
                      <td className="table-td">
                        <Link to={`/purchase-orders/${po.purchaseorder_id}`} className="text-xs text-brand-600 hover:underline">
                          View
                        </Link>
                      </td>
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
