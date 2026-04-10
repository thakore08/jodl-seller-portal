import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Factory, Filter, RefreshCw, Search, Sparkles, TrendingUp } from 'lucide-react';
import api from '../services/api';

const STATUS_FILTERS = ['all', 'draft', 'submitted', 'approved'];

const STATUS_STYLES = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800/80 dark:text-slate-200',
  submitted: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

const PO_STAGE_STYLES = {
  accepted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  dispatched: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  invoiced: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
};

const PLAN_PROGRESS_STYLES = {
  started: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  not_started: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function ProductionPlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/purchase-orders/production-plans');
      setPlans(data.production_plans || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load production plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const filteredPlans = useMemo(() => {
    return plans.filter(plan => {
      if (statusFilter !== 'all' && plan.status !== statusFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(plan.po_number || '').toLowerCase().includes(q) ||
        String(plan.remarks || '').toLowerCase().includes(q) ||
        (plan.lines || []).some(line => String(line.item_name || '').toLowerCase().includes(q))
      );
    });
  }, [plans, search, statusFilter]);

  const summary = useMemo(() => ({
    poQty: filteredPlans.reduce((sum, plan) => sum + Number(plan.summary?.total_po_qty || 0), 0),
    planned: filteredPlans.reduce((sum, plan) => sum + Number(plan.summary?.total_planned_qty || 0), 0),
    actual: filteredPlans.reduce((sum, plan) => sum + Number(plan.summary?.total_actual_qty || 0), 0),
    remaining: filteredPlans.reduce((sum, plan) => sum + Number(plan.summary?.remaining_qty || 0), 0),
  }), [filteredPlans]);

  return (
    <div className="space-y-5">
      <div className="page-hero">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="hero-title">Production Planning Hub</h2>
            <p className="hero-subtitle">Track submitted schedules, compare plan vs actual output, and jump into PO-level production control.</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="chip-soft">Daily Actuals</span>
              <span className="chip-soft">Plan vs Actual</span>
            </div>
          </div>
          <span className="status-live text-white/90">
            <Sparkles className="h-3.5 w-3.5" />
            Production active
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-base font-bold text-gray-900 dark:text-gray-100">Production Plans</h1>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {!loading && `${filteredPlans.length} production PO${filteredPlans.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={loadPlans} disabled={loading} className="btn-outline shimmer-on-hover">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">PO Qty</p>
          <p className="mt-2 text-2xl font-black text-gray-900 dark:text-gray-100">{summary.poQty.toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Planned</p>
          <p className="mt-2 text-2xl font-black text-brand-600 dark:text-brand-400">{summary.planned.toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Actual</p>
          <p className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">{summary.actual.toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Remaining</p>
          <p className="mt-2 text-2xl font-black text-signal-600 dark:text-signal-400">{summary.remaining.toLocaleString('en-IN')}</p>
        </div>
      </div>

      <div className="control-dock flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[260px] max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Search PO or line item…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="dock-tabs">
          <Filter className="ml-1 h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
          {STATUS_FILTERS.map(filter => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                statusFilter === filter
                  ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white'
                  : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
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
      ) : filteredPlans.length === 0 ? (
        <div className="card py-16 text-center">
          <Factory className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">No production-ready POs yet</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Accepted purchase orders will appear here automatically. Once they do, you can open the PO and start the production schedule.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full min-w-[1040px]">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="table-th">PO</th>
                  <th className="table-th">Basis</th>
                  <th className="table-th">Horizon</th>
                  <th className="table-th text-right">PO Qty</th>
                  <th className="table-th text-right">Planned</th>
                  <th className="table-th text-right">Actual</th>
                  <th className="table-th text-right">Remaining</th>
                  <th className="table-th text-center">Status</th>
                  <th className="table-th">Updated</th>
                  <th className="table-th text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredPlans.map(plan => (
                  <tr key={plan.plan_id}>
                    <td className="table-td">
                      <div>
                        <p className="font-semibold text-brand-600 dark:text-brand-400">{plan.po_number}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${PO_STAGE_STYLES[plan.effective_status] || 'bg-slate-100 text-slate-700 dark:bg-slate-800/80 dark:text-slate-200'}`}>
                            {plan.effective_status === 'accepted' ? 'Accepted by Seller' : plan.effective_status}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${plan.has_saved_plan ? PLAN_PROGRESS_STYLES.started : PLAN_PROGRESS_STYLES.not_started}`}>
                            {plan.has_saved_plan ? 'Plan Started' : 'Plan Not Started'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{plan.line_count} line items</p>
                      </div>
                    </td>
                    <td className="table-td uppercase">{plan.planning_basis}</td>
                    <td className="table-td whitespace-nowrap">{plan.start_date} to {plan.end_date}</td>
                    <td className="table-td text-right">{Number(plan.summary?.total_po_qty || 0).toLocaleString('en-IN')}</td>
                    <td className="table-td text-right">{Number(plan.summary?.total_planned_qty || 0).toLocaleString('en-IN')}</td>
                    <td className="table-td text-right">{Number(plan.summary?.total_actual_qty || 0).toLocaleString('en-IN')}</td>
                    <td className="table-td text-right font-semibold">{Number(plan.summary?.remaining_qty || 0).toLocaleString('en-IN')}</td>
                    <td className="table-td text-center">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${STATUS_STYLES[plan.status] || STATUS_STYLES.draft}`}>
                        {plan.status}
                      </span>
                    </td>
                    <td className="table-td whitespace-nowrap">{fmtDate(plan.last_updated_at || plan.submitted_at || plan.approved_at)}</td>
                    <td className="table-td text-right">
                      <Link to={`/production/${plan.po_id}`} className="btn-outline inline-flex">
                        Open Production
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 p-4 lg:hidden">
            {filteredPlans.map(plan => (
              <div key={plan.plan_id} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-brand-600 dark:text-brand-400">{plan.po_number}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${PO_STAGE_STYLES[plan.effective_status] || 'bg-slate-100 text-slate-700 dark:bg-slate-800/80 dark:text-slate-200'}`}>
                        {plan.effective_status === 'accepted' ? 'Accepted by Seller' : plan.effective_status}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${plan.has_saved_plan ? PLAN_PROGRESS_STYLES.started : PLAN_PROGRESS_STYLES.not_started}`}>
                        {plan.has_saved_plan ? 'Plan Started' : 'Plan Not Started'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {plan.line_count} line items · {plan.planning_basis.toUpperCase()}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${STATUS_STYLES[plan.status] || STATUS_STYLES.draft}`}>
                    {plan.status}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500 dark:text-gray-400">Planned</span><p className="font-semibold">{Number(plan.summary?.total_planned_qty || 0).toLocaleString('en-IN')}</p></div>
                  <div><span className="text-gray-500 dark:text-gray-400">Actual</span><p className="font-semibold">{Number(plan.summary?.total_actual_qty || 0).toLocaleString('en-IN')}</p></div>
                  <div><span className="text-gray-500 dark:text-gray-400">Remaining</span><p className="font-semibold">{Number(plan.summary?.remaining_qty || 0).toLocaleString('en-IN')}</p></div>
                  <div><span className="text-gray-500 dark:text-gray-400">Updated</span><p className="font-semibold">{fmtDate(plan.last_updated_at || plan.submitted_at || plan.approved_at)}</p></div>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {plan.start_date} to {plan.end_date}
                  </span>
                  <Link to={`/production/${plan.po_id}`} className="btn-outline inline-flex">
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
