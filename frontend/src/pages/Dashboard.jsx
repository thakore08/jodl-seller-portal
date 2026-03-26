import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, CheckCircle, XCircle, FileText, ArrowRight, RefreshCw, Sparkles } from 'lucide-react';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import { format } from 'date-fns';

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="card glow-hover p-5 flex items-center gap-4">
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl shadow-md ${color}`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value ?? '—'}</p>
        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
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
    <div className="space-y-6">
      <div className="page-hero">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="hero-title">Operations Overview</h2>
            <p className="hero-subtitle">Live visibility into purchase orders, invoices, and billing progress.</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="chip-soft">Seller Workspace</span>
              <span className="chip-soft">Real-time sync</span>
            </div>
          </div>
          <span className="status-live text-white/90">
            <Sparkles className="h-3.5 w-3.5" />
            Live
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">KPI Snapshot</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Overview of your purchase order lifecycle</p>
        </div>
        <button onClick={loadData} disabled={loading} className="btn-outline gap-2 shimmer-on-hover">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 motion-stagger">
        <StatCard label="Total POs"      value={total}            icon={ShoppingCart} color="bg-gradient-to-br from-brand-500 to-brand-700" />
        <StatCard label="Open / Pending" value={stats?.open}      icon={FileText}     color="bg-gradient-to-br from-amber-400 to-orange-500" />
        <StatCard label="Billed"         value={stats?.billed}    icon={CheckCircle}  color="bg-green-600" />
        <StatCard label="Cancelled"      value={stats?.cancelled} icon={XCircle}      color="bg-gradient-to-br from-red-500 to-signal-500" />
      </div>

      {/* Recent POs */}
      <div className="card">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 px-5 py-4">
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Recent Purchase Orders</h2>
          <Link to="/purchase-orders" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          </div>
        ) : recentPOs.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">No purchase orders found.</div>
        ) : (
          <>
            {/* Mobile card list */}
            <ul className="divide-y divide-gray-100 dark:divide-gray-700 sm:hidden">
              {recentPOs.map(po => (
                <li key={po.purchaseorder_id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-brand-600 dark:text-brand-400 truncate">{po.purchaseorder_number}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {po.date ? format(new Date(po.date), 'dd MMM yyyy') : '—'}
                      </p>
                    </div>
                    <StatusBadge status={po.status} />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {po.currency_code} {Number(po.total || 0).toLocaleString('en-IN')}
                    </p>
                    <Link to={`/purchase-orders/${po.purchaseorder_id}`} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
                      View →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                  <tr>
                    <th className="table-th">PO Number</th>
                    <th className="table-th">Date</th>
                    <th className="table-th hidden md:table-cell">Expected Delivery</th>
                    <th className="table-th">Amount</th>
                    <th className="table-th">Status</th>
                    <th className="table-th" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {recentPOs.map(po => (
                    <tr key={po.purchaseorder_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                      <td className="table-td font-medium text-brand-600 dark:text-brand-400">{po.purchaseorder_number}</td>
                      <td className="table-td">{po.date ? format(new Date(po.date), 'dd MMM yyyy') : '—'}</td>
                      <td className="table-td hidden md:table-cell">
                        {po.expected_delivery_date ? format(new Date(po.expected_delivery_date), 'dd MMM yyyy') : '—'}
                      </td>
                      <td className="table-td font-medium">
                        {po.currency_code} {Number(po.total || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="table-td"><StatusBadge status={po.status} /></td>
                      <td className="table-td">
                        <Link to={`/purchase-orders/${po.purchaseorder_id}`} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
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
