import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Filter, RefreshCw, Search, Sparkles, Truck } from 'lucide-react';
import api from '../services/api';

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'ready_to_dispatch', label: 'Ready' },
  { key: 'partially_ready', label: 'Partial RTD' },
  { key: 'shipment_synced', label: 'Synced' },
  { key: 'awaiting_rtd', label: 'Awaiting RTD' },
];

const DISPATCH_STATUS_STYLES = {
  ready_to_dispatch: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  partially_ready: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  shipment_synced: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300',
  awaiting_rtd: 'bg-slate-100 text-slate-700 dark:bg-slate-800/80 dark:text-slate-200',
};

function fmtDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function humanizeStatus(value) {
  return String(value || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

export default function Dispatch() {
  const [rows, setRows] = useState([]);
  const [shipmentSync, setShipmentSync] = useState({ ok: true, error: '', organization_id: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadDispatches = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/dispatch');
      setRows(data.dispatches || []);
      setShipmentSync(data.shipment_sync || { ok: true, error: '', organization_id: data.organization_id || '' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load dispatch flow');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDispatches();
  }, [loadDispatches]);

  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      if (statusFilter !== 'all' && row.dispatch_status !== statusFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(row.po_number || '').toLowerCase().includes(q) ||
        String(row.reference_number || '').toLowerCase().includes(q) ||
        String(row.vendor_name || '').toLowerCase().includes(q) ||
        String(row.latest_shipment?.shipment_number || '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  const summary = useMemo(() => ({
    eligible: filteredRows.length,
    ready: filteredRows.filter(row => row.dispatch_status === 'ready_to_dispatch').length,
    synced: filteredRows.filter(row => row.dispatch_status === 'shipment_synced').length,
    readyLines: filteredRows.reduce((sum, row) => sum + Number(row.rtd_summary?.ready_line_count || 0), 0),
  }), [filteredRows]);

  return (
    <div className="space-y-5">
      <div className="page-hero">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="hero-title">Dispatch Control Tower</h2>
            <p className="hero-subtitle">Track RTD completion, monitor Zoho shipment sync, and move ready POs into dispatch execution.</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="chip-soft">Zoho Shipment Module</span>
              <span className="chip-soft">RTD to Dispatch</span>
            </div>
          </div>
          <span className="status-live text-white/90">
            <Sparkles className="h-3.5 w-3.5" />
            Dispatch active
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-base font-bold text-gray-900 dark:text-gray-100">Dispatch</h1>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {!loading && `${filteredRows.length} PO${filteredRows.length !== 1 ? 's' : ''} in dispatch workflow`}
          </p>
        </div>
        <button onClick={loadDispatches} disabled={loading} className="btn-outline shimmer-on-hover">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Eligible POs</p>
          <p className="mt-2 text-2xl font-black text-gray-900 dark:text-gray-100">{summary.eligible.toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Ready To Dispatch</p>
          <p className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">{summary.ready.toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Synced Shipments</p>
          <p className="mt-2 text-2xl font-black text-brand-600 dark:text-brand-400">{summary.synced.toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">RTD Line Items</p>
          <p className="mt-2 text-2xl font-black text-signal-600 dark:text-signal-400">{summary.readyLines.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {!shipmentSync.ok && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-300">
          Zoho shipment sync is not available right now. The Dispatch tab is still showing local RTD-ready POs, but shipment data could not be loaded.
          <div className="mt-1 text-xs opacity-80">{shipmentSync.error}</div>
        </div>
      )}

      {shipmentSync.organization_id && (
        <div className="rounded-xl border border-brand-100 bg-white/80 px-4 py-3 text-xs text-gray-500 dark:border-brand-900/40 dark:bg-slate-900/35 dark:text-gray-400">
          Zoho Books organization synced for dispatch: <span className="font-semibold text-gray-800 dark:text-gray-100">{shipmentSync.organization_id}</span>
        </div>
      )}

      <div className="control-dock flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[260px] max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Search PO, vendor, or shipment…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="dock-tabs">
          <Filter className="ml-1 h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
          {STATUS_FILTERS.map(filter => (
            <button
              key={filter.key}
              onClick={() => setStatusFilter(filter.key)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                statusFilter === filter.key
                  ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white'
                  : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="card py-16 text-center">
          <Truck className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">No dispatch-ready POs yet</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Accepted POs will appear here after RTD progress starts, and Zoho shipment records will attach automatically when available.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full min-w-[1120px]">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="table-th">PO</th>
                  <th className="table-th">Vendor</th>
                  <th className="table-th text-center">RTD Progress</th>
                  <th className="table-th">Shipment</th>
                  <th className="table-th text-center">Dispatch Stage</th>
                  <th className="table-th">Updated</th>
                  <th className="table-th text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredRows.map(row => (
                  <tr key={row.po_id}>
                    <td className="table-td">
                      <div>
                        <p className="font-semibold text-brand-600 dark:text-brand-400">{row.po_number}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{row.reference_number || 'No PO reference'}</p>
                      </div>
                    </td>
                    <td className="table-td">{row.vendor_name || '—'}</td>
                    <td className="table-td text-center">
                      <div className="inline-flex flex-col items-center gap-1">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800/80 dark:text-slate-200">
                          {row.rtd_summary?.ready_line_count || 0} / {row.rtd_summary?.total_line_count || 0} ready
                        </span>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          {row.rtd_summary?.latest_eta ? `Latest ETA ${row.rtd_summary.latest_eta}` : 'ETAs pending'}
                        </span>
                      </div>
                    </td>
                    <td className="table-td">
                      {row.latest_shipment ? (
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-gray-100">{row.latest_shipment.shipment_number}</p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {humanizeStatus(row.latest_shipment.shipment_status)} · {fmtDate(row.latest_shipment.shipment_date)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500 dark:text-gray-400">No Zoho shipment linked yet</span>
                      )}
                    </td>
                    <td className="table-td text-center">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${DISPATCH_STATUS_STYLES[row.dispatch_status] || DISPATCH_STATUS_STYLES.awaiting_rtd}`}>
                        {humanizeStatus(row.dispatch_status)}
                      </span>
                    </td>
                    <td className="table-td whitespace-nowrap">{fmtDate(row.last_updated_at)}</td>
                    <td className="table-td text-right">
                      <Link to={`/production/${row.po_id}`} className="btn-outline inline-flex">
                        Open Production
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 p-4 lg:hidden">
            {filteredRows.map(row => (
              <div key={row.po_id} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-brand-600 dark:text-brand-400">{row.po_number}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{row.vendor_name || '—'}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${DISPATCH_STATUS_STYLES[row.dispatch_status] || DISPATCH_STATUS_STYLES.awaiting_rtd}`}>
                    {humanizeStatus(row.dispatch_status)}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">RTD Ready</span>
                    <p className="font-semibold">{row.rtd_summary?.ready_line_count || 0} / {row.rtd_summary?.total_line_count || 0}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Shipment</span>
                    <p className="font-semibold">{row.latest_shipment?.shipment_number || 'Pending'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Latest ETA</span>
                    <p className="font-semibold">{row.rtd_summary?.latest_eta || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Updated</span>
                    <p className="font-semibold">{fmtDate(row.last_updated_at)}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end">
                  <Link to={`/production/${row.po_id}`} className="btn-outline inline-flex">
                    Open Production
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
