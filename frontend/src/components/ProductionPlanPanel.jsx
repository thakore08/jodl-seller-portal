import React, { useEffect, useState } from 'react';
import {
  CalendarRange, CheckCircle2, Factory, Save, Send, Target,
  TrendingUp, Wrench,
} from 'lucide-react';
import {
  eachDayOfInterval, format, isAfter, parseISO, startOfMonth, startOfWeek,
} from 'date-fns';

const BASIS_HELP = {
  day: 'Best when the supplier plans exact output by date.',
  week: 'Distribute planned quantities evenly by week, then down to daily rows.',
  month: 'Distribute planned quantities evenly by month, then down to daily rows.',
};

const STATUS_CLASSES = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800/80 dark:text-slate-200',
  submitted: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  locked: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
};

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function fmtDate(value) {
  try {
    return format(parseISO(value), 'dd MMM yyyy');
  } catch {
    return value;
  }
}

function createEntry(entryDate, existing = {}) {
  return {
    entry_id: existing.entry_id || `${entryDate}-${Math.random().toString(36).slice(2, 8)}`,
    entry_date: entryDate,
    planned_qty: safeNumber(existing.planned_qty),
    estimated_qty: safeNumber(existing.estimated_qty),
    actual_qty: safeNumber(existing.actual_qty),
    good_qty: safeNumber(existing.good_qty),
    scrap_qty: safeNumber(existing.scrap_qty),
    rework_qty: safeNumber(existing.rework_qty),
    variance_qty: safeNumber(existing.actual_qty) - safeNumber(existing.planned_qty),
    variance_reason: existing.variance_reason || '',
    shift: existing.shift || '',
    machine_or_line: existing.machine_or_line || '',
    supervisor_name: existing.supervisor_name || '',
    remarks: existing.remarks || '',
  };
}

function dateList(startDate, endDate) {
  if (!startDate || !endDate) return [];
  try {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    if (isAfter(start, end)) return [];
    return eachDayOfInterval({ start, end }).map(date => format(date, 'yyyy-MM-dd'));
  } catch {
    return [];
  }
}

function syncLineEntries(line, startDate, endDate) {
  const dates = dateList(startDate, endDate);
  const byDate = new Map((line.entries || []).map(entry => [entry.entry_date, entry]));
  return {
    ...line,
    entries: dates.map(entryDate => createEntry(entryDate, byDate.get(entryDate))).sort((a, b) => a.entry_date.localeCompare(b.entry_date)),
  };
}

function buildBuckets(startDate, endDate, basis) {
  const dates = dateList(startDate, endDate);
  const bucketMap = new Map();

  dates.forEach(dateString => {
    const date = parseISO(dateString);
    let key = dateString;
    let label = fmtDate(dateString);

    if (basis === 'week') {
      const weekStart = startOfWeek(date, { weekStartsOn: 1 });
      key = format(weekStart, 'yyyy-MM-dd');
      label = `Week of ${format(weekStart, 'dd MMM')}`;
    }

    if (basis === 'month') {
      const monthStart = startOfMonth(date);
      key = format(monthStart, 'yyyy-MM');
      label = format(monthStart, 'MMM yyyy');
    }

    if (!bucketMap.has(key)) bucketMap.set(key, { key, label, dates: [] });
    bucketMap.get(key).dates.push(dateString);
  });

  return Array.from(bucketMap.values());
}

function splitTotal(total, parts) {
  if (parts <= 0) return [];
  const rounded = Math.round(safeNumber(total) * 100);
  const base = Math.floor(rounded / parts);
  let remainder = rounded - (base * parts);
  return Array.from({ length: parts }, () => {
    const value = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return value / 100;
  });
}

function distributeLine(line, startDate, endDate, basis) {
  const buckets = buildBuckets(startDate, endDate, basis);
  const syncedLine = syncLineEntries(line, startDate, endDate);
  const entryByDate = new Map(syncedLine.entries.map(entry => [entry.entry_date, entry]));
  const bucketPlanned = splitTotal(line.target_planned_qty, buckets.length);
  const bucketEstimated = splitTotal(line.target_estimated_qty, buckets.length);

  buckets.forEach((bucket, idx) => {
    const plannedByDay = splitTotal(bucketPlanned[idx] || 0, bucket.dates.length);
    const estimatedByDay = splitTotal(bucketEstimated[idx] || 0, bucket.dates.length);

    bucket.dates.forEach((dateString, dateIndex) => {
      const entry = entryByDate.get(dateString);
      if (!entry) return;
      entry.planned_qty = plannedByDay[dateIndex] || 0;
      entry.estimated_qty = estimatedByDay[dateIndex] || 0;
      entry.variance_qty = safeNumber(entry.actual_qty) - safeNumber(entry.planned_qty);
    });
  });

  return {
    ...syncedLine,
    entries: Array.from(entryByDate.values()).sort((a, b) => a.entry_date.localeCompare(b.entry_date)),
  };
}

function summarizeLine(line) {
  const entries = line.entries || [];
  const totalPlannedQty = entries.reduce((sum, entry) => sum + safeNumber(entry.planned_qty), 0);
  const totalEstimatedQty = entries.reduce((sum, entry) => sum + safeNumber(entry.estimated_qty), 0);
  const totalActualQty = entries.reduce((sum, entry) => sum + safeNumber(entry.actual_qty), 0);
  const totalGoodQty = entries.reduce((sum, entry) => sum + safeNumber(entry.good_qty), 0);
  const totalScrapQty = entries.reduce((sum, entry) => sum + safeNumber(entry.scrap_qty), 0);
  const totalReworkQty = entries.reduce((sum, entry) => sum + safeNumber(entry.rework_qty), 0);

  return {
    ...line,
    total_planned_qty: totalPlannedQty,
    total_estimated_qty: totalEstimatedQty,
    total_actual_qty: totalActualQty,
    total_good_qty: totalGoodQty,
    total_scrap_qty: totalScrapQty,
    total_rework_qty: totalReworkQty,
    variance_qty: totalActualQty - totalPlannedQty,
    remaining_qty: Math.max(safeNumber(line.po_qty) - totalGoodQty, 0),
  };
}

function summarizePlan(plan) {
  const lines = (plan.lines || []).map(summarizeLine);
  return {
    ...plan,
    lines,
    summary: {
      total_po_qty: lines.reduce((sum, line) => sum + safeNumber(line.po_qty), 0),
      total_planned_qty: lines.reduce((sum, line) => sum + safeNumber(line.total_planned_qty), 0),
      total_estimated_qty: lines.reduce((sum, line) => sum + safeNumber(line.total_estimated_qty), 0),
      total_actual_qty: lines.reduce((sum, line) => sum + safeNumber(line.total_actual_qty), 0),
      total_good_qty: lines.reduce((sum, line) => sum + safeNumber(line.total_good_qty), 0),
      total_scrap_qty: lines.reduce((sum, line) => sum + safeNumber(line.total_scrap_qty), 0),
      total_rework_qty: lines.reduce((sum, line) => sum + safeNumber(line.total_rework_qty), 0),
      remaining_qty: lines.reduce((sum, line) => sum + safeNumber(line.remaining_qty), 0),
      variance_qty: lines.reduce((sum, line) => sum + safeNumber(line.variance_qty), 0),
    },
  };
}

export default function ProductionPlanPanel({
  po,
  plan,
  loading,
  canEdit,
  canApprove,
  saving,
  onSave,
  onSubmit,
  onApprove,
}) {
  const [localPlan, setLocalPlan] = useState(plan);

  useEffect(() => {
    setLocalPlan(plan);
  }, [plan]);

  if (loading || !localPlan) {
    return (
      <div className="card p-6">
        <div className="flex items-center justify-center py-10">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      </div>
    );
  }

  const derivedPlan = summarizePlan(localPlan);
  const locked = derivedPlan.status === 'approved' || !canEdit;

  const patchPlan = updater => {
    setLocalPlan(prev => summarizePlan(typeof updater === 'function' ? updater(prev) : updater));
  };

  const updateMeta = (field, value) => {
    patchPlan(prev => ({ ...prev, [field]: value }));
  };

  const syncDateGrid = () => {
    patchPlan(prev => ({
      ...prev,
      lines: (prev.lines || []).map(line => syncLineEntries(line, prev.start_date, prev.end_date)),
    }));
  };

  const distributeByBasis = lineIndex => {
    patchPlan(prev => ({
      ...prev,
      lines: prev.lines.map((line, idx) => (
        idx === lineIndex
          ? distributeLine(line, prev.start_date, prev.end_date, prev.planning_basis)
          : line
      )),
    }));
  };

  const updateLineField = (lineIndex, field, value) => {
    patchPlan(prev => ({
      ...prev,
      lines: prev.lines.map((line, idx) => (
        idx === lineIndex ? { ...line, [field]: value } : line
      )),
    }));
  };

  const updateEntryField = (lineIndex, entryIndex, field, value) => {
    patchPlan(prev => ({
      ...prev,
      lines: prev.lines.map((line, idx) => {
        if (idx !== lineIndex) return line;
        return {
          ...line,
          entries: line.entries.map((entry, eIdx) => {
            if (eIdx !== entryIndex) return entry;
            const nextEntry = { ...entry, [field]: value };
            nextEntry.variance_qty = safeNumber(nextEntry.actual_qty) - safeNumber(nextEntry.planned_qty);
            return nextEntry;
          }),
        };
      }),
    }));
  };

  const handleSave = () => onSave(derivedPlan);
  const handleSubmit = () => onSubmit(derivedPlan);
  const handleApprove = () => onApprove(derivedPlan);

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Factory className="h-5 w-5 text-brand-600 dark:text-brand-400" />
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Production Planning & Actuals</h2>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${STATUS_CLASSES[derivedPlan.status] || STATUS_CLASSES.draft}`}>
                {derivedPlan.status}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
              Build a 30+ day production schedule against this PO. Planning basis controls how auto-distribution works; actual output is still captured date by date.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={syncDateGrid} disabled={locked || saving} className="btn-outline">
              <CalendarRange className="h-4 w-4" />
              Sync Date Grid
            </button>
            <button onClick={handleSave} disabled={locked || saving} className="btn-outline">
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
            <button onClick={handleSubmit} disabled={locked || saving} className="btn-primary">
              <Send className="h-4 w-4" />
              Submit Plan
            </button>
            {canApprove && (
              <button onClick={handleApprove} disabled={derivedPlan.status === 'approved' || saving} className="btn-success">
                <CheckCircle2 className="h-4 w-4" />
                Approve
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
          <div className="rounded-2xl border border-gray-200/80 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-800/40">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Plan Controls</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label">Planning Basis</label>
                <select
                  className="input"
                  value={derivedPlan.planning_basis}
                  onChange={e => updateMeta('planning_basis', e.target.value)}
                  disabled={locked}
                >
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
              </div>
              <div>
                <label className="label">Start Date</label>
                <input
                  type="date"
                  className="input"
                  value={derivedPlan.start_date || ''}
                  onChange={e => updateMeta('start_date', e.target.value)}
                  disabled={locked}
                />
              </div>
              <div>
                <label className="label">End Date</label>
                <input
                  type="date"
                  className="input"
                  value={derivedPlan.end_date || ''}
                  onChange={e => updateMeta('end_date', e.target.value)}
                  disabled={locked}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{BASIS_HELP[derivedPlan.planning_basis] || BASIS_HELP.day}</p>
            <div className="mt-3">
              <label className="label">Remarks</label>
              <textarea
                className="input min-h-[88px] resize-y"
                value={derivedPlan.remarks || ''}
                onChange={e => updateMeta('remarks', e.target.value)}
                disabled={locked}
                placeholder="Share assumptions, machine capacity constraints, or risks for this schedule."
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <Target className="h-4 w-4 text-brand-500" />
                <span className="text-xs font-semibold uppercase tracking-[0.14em]">Plan Summary</span>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between"><span>Total PO Qty</span><strong>{derivedPlan.summary.total_po_qty.toLocaleString('en-IN')}</strong></div>
                <div className="flex items-center justify-between"><span>Planned Qty</span><strong>{derivedPlan.summary.total_planned_qty.toLocaleString('en-IN')}</strong></div>
                <div className="flex items-center justify-between"><span>Estimated Qty</span><strong>{derivedPlan.summary.total_estimated_qty.toLocaleString('en-IN')}</strong></div>
                <div className="flex items-center justify-between"><span>Remaining Qty</span><strong>{derivedPlan.summary.remaining_qty.toLocaleString('en-IN')}</strong></div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200/80 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <span className="text-xs font-semibold uppercase tracking-[0.14em]">Actual Output</span>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between"><span>Actual Qty</span><strong>{derivedPlan.summary.total_actual_qty.toLocaleString('en-IN')}</strong></div>
                <div className="flex items-center justify-between"><span>Good Qty</span><strong>{derivedPlan.summary.total_good_qty.toLocaleString('en-IN')}</strong></div>
                <div className="flex items-center justify-between"><span>Scrap Qty</span><strong>{derivedPlan.summary.total_scrap_qty.toLocaleString('en-IN')}</strong></div>
                <div className="flex items-center justify-between"><span>Rework Qty</span><strong>{derivedPlan.summary.total_rework_qty.toLocaleString('en-IN')}</strong></div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200/80 bg-gradient-to-br from-brand-50 via-white to-signal-50 p-4 dark:border-gray-700 dark:bg-[linear-gradient(135deg,rgba(30,41,59,0.85),rgba(15,23,42,0.95))]">
            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
              <Wrench className="h-4 w-4 text-signal-500" />
              <span className="text-xs font-semibold uppercase tracking-[0.14em]">Operational Notes</span>
            </div>
            <ul className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li>PO: <span className="font-semibold text-gray-900 dark:text-gray-100">{po.purchaseorder_number}</span></li>
              <li>UOM values come directly from each PO line item.</li>
              <li>Use “Distribute Plan” after changing target quantities or planning basis.</li>
              <li>Good quantity drives remaining balance against the PO.</li>
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          {derivedPlan.lines.map((line, lineIndex) => (
            <div key={line.line_id || line.item_index} className="rounded-2xl border border-gray-200 dark:border-gray-700">
              <div className="border-b border-gray-100 px-4 py-4 dark:border-gray-700">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{line.item_name}</h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{line.description || 'Production line item linked directly from the PO.'}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">PO Qty: {safeNumber(line.po_qty).toLocaleString('en-IN')} {line.uom || ''}</span>
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">Planned: {safeNumber(line.total_planned_qty).toLocaleString('en-IN')}</span>
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">Good: {safeNumber(line.total_good_qty).toLocaleString('en-IN')}</span>
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">Remaining: {safeNumber(line.remaining_qty).toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3 xl:w-[520px]">
                    <div>
                      <label className="label">Target Planned Qty</label>
                      <input
                        type="number"
                        className="input"
                        value={line.target_planned_qty ?? ''}
                        onChange={e => updateLineField(lineIndex, 'target_planned_qty', e.target.value)}
                        disabled={locked}
                      />
                    </div>
                    <div>
                      <label className="label">Target Estimated Qty</label>
                      <input
                        type="number"
                        className="input"
                        value={line.target_estimated_qty ?? ''}
                        onChange={e => updateLineField(lineIndex, 'target_estimated_qty', e.target.value)}
                        disabled={locked}
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={() => distributeByBasis(lineIndex)}
                        disabled={locked}
                        className="btn-outline w-full"
                      >
                        Distribute Plan
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1320px] w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th className="table-th">Date</th>
                      <th className="table-th text-right">Planned</th>
                      <th className="table-th text-right">Estimated</th>
                      <th className="table-th text-right">Actual</th>
                      <th className="table-th text-right">Good</th>
                      <th className="table-th text-right">Scrap</th>
                      <th className="table-th text-right">Rework</th>
                      <th className="table-th text-right">Variance</th>
                      <th className="table-th">Reason</th>
                      <th className="table-th">Shift</th>
                      <th className="table-th">Line/Machine</th>
                      <th className="table-th">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {line.entries.map((entry, entryIndex) => (
                      <tr key={entry.entry_id}>
                        <td className="table-td whitespace-nowrap font-medium">{fmtDate(entry.entry_date)}</td>
                        <td className="table-td text-right">
                          <input type="number" className="input py-1 text-right text-xs" value={entry.planned_qty} onChange={e => updateEntryField(lineIndex, entryIndex, 'planned_qty', e.target.value)} disabled={locked} />
                        </td>
                        <td className="table-td text-right">
                          <input type="number" className="input py-1 text-right text-xs" value={entry.estimated_qty} onChange={e => updateEntryField(lineIndex, entryIndex, 'estimated_qty', e.target.value)} disabled={locked} />
                        </td>
                        <td className="table-td text-right">
                          <input type="number" className="input py-1 text-right text-xs" value={entry.actual_qty} onChange={e => updateEntryField(lineIndex, entryIndex, 'actual_qty', e.target.value)} disabled={locked} />
                        </td>
                        <td className="table-td text-right">
                          <input type="number" className="input py-1 text-right text-xs" value={entry.good_qty} onChange={e => updateEntryField(lineIndex, entryIndex, 'good_qty', e.target.value)} disabled={locked} />
                        </td>
                        <td className="table-td text-right">
                          <input type="number" className="input py-1 text-right text-xs" value={entry.scrap_qty} onChange={e => updateEntryField(lineIndex, entryIndex, 'scrap_qty', e.target.value)} disabled={locked} />
                        </td>
                        <td className="table-td text-right">
                          <input type="number" className="input py-1 text-right text-xs" value={entry.rework_qty} onChange={e => updateEntryField(lineIndex, entryIndex, 'rework_qty', e.target.value)} disabled={locked} />
                        </td>
                        <td className={`table-td text-right font-semibold ${safeNumber(entry.variance_qty) < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {safeNumber(entry.variance_qty).toLocaleString('en-IN')}
                        </td>
                        <td className="table-td">
                          <input type="text" className="input py-1 text-xs" value={entry.variance_reason || ''} onChange={e => updateEntryField(lineIndex, entryIndex, 'variance_reason', e.target.value)} disabled={locked} />
                        </td>
                        <td className="table-td">
                          <input type="text" className="input py-1 text-xs" value={entry.shift || ''} onChange={e => updateEntryField(lineIndex, entryIndex, 'shift', e.target.value)} disabled={locked} />
                        </td>
                        <td className="table-td">
                          <input type="text" className="input py-1 text-xs" value={entry.machine_or_line || ''} onChange={e => updateEntryField(lineIndex, entryIndex, 'machine_or_line', e.target.value)} disabled={locked} />
                        </td>
                        <td className="table-td">
                          <input type="text" className="input py-1 text-xs" value={entry.remarks || ''} onChange={e => updateEntryField(lineIndex, entryIndex, 'remarks', e.target.value)} disabled={locked} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
