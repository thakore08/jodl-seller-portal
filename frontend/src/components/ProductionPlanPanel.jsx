import React, { useEffect, useState } from 'react';
import {
  CalendarRange, Check, CheckCircle2, Factory, Save, Send, Target,
  TrendingUp,
} from 'lucide-react';
import {
  eachDayOfInterval, endOfWeek, format, isAfter, parseISO, startOfMonth, startOfWeek,
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

function buildEntryBuckets(entries, basis) {
  const bucketMap = new Map();

  (entries || []).forEach(entry => {
    const date = parseISO(entry.entry_date);
    let key = entry.entry_date;
    let label = fmtDate(entry.entry_date);
    let sortKey = entry.entry_date;

    if (basis === 'week') {
      const weekStart = startOfWeek(date, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(date, { weekStartsOn: 1 });
      key = format(weekStart, 'yyyy-MM-dd');
      sortKey = key;
      label = `${format(weekStart, 'dd MMM')} - ${format(weekEnd, 'dd MMM yyyy')}`;
    }

    if (basis === 'month') {
      const monthStart = startOfMonth(date);
      key = format(monthStart, 'yyyy-MM');
      sortKey = format(monthStart, 'yyyy-MM-01');
      label = format(monthStart, 'MMMM yyyy');
    }

    if (!bucketMap.has(key)) bucketMap.set(key, { key, label, sortKey, entries: [] });
    bucketMap.get(key).entries.push(entry);
  });

  return Array.from(bucketMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function getRTDLineStatus(line, po) {
  const poLine = po?.line_items?.[line.item_index];
  const billedQty = safeNumber(poLine?.billed_quantity);
  const orderedQty = safeNumber(poLine?.quantity ?? line.po_qty);

  if (billedQty > 0) {
    if (orderedQty > 0 && billedQty >= orderedQty) return 'rtd_dispatched';
    return 'rtd_partially_dispatched';
  }

  const rtdEntry = po?.rtd_data?.[line.item_index];
  if (!rtdEntry) return 'rtd_pending';
  if (rtdEntry.rtd_marked_ready_at) return 'rtd_ready';

  const today = new Date().toISOString().split('T')[0];
  const eta = rtdEntry.rtd_eta_revised || rtdEntry.rtd_eta_original;
  if (eta && eta < today) return 'rtd_overdue';
  return 'rtd_pending';
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

function summarizeEntryBucket(bucket) {
  const entries = bucket.entries || [];
  const firstRemarks = entries[0]?.remarks || '';
  return {
    key: bucket.key,
    label: bucket.label,
    entryIds: entries.map(entry => entry.entry_id),
    planned_qty: entries.reduce((sum, entry) => sum + safeNumber(entry.planned_qty), 0),
    estimated_qty: entries.reduce((sum, entry) => sum + safeNumber(entry.estimated_qty), 0),
    actual_qty: entries.reduce((sum, entry) => sum + safeNumber(entry.actual_qty), 0),
    good_qty: entries.reduce((sum, entry) => sum + safeNumber(entry.good_qty), 0),
    remarks: entries.every(entry => (entry.remarks || '') === firstRemarks) ? firstRemarks : '',
  };
}

const LINE_FLOW = [
  { key: 'accepted', label: 'Accepted' },
  { key: 'planned', label: 'Planned' },
  { key: 'in_production', label: 'In Production' },
  { key: 'ready', label: 'Ready to Dispatch' },
  { key: 'dispatched', label: 'Dispatched' },
];

function getLineFlowStatus(line, po, planStatus) {
  const rtdStatus = getRTDLineStatus(line, po);

  if (rtdStatus === 'rtd_dispatched' || rtdStatus === 'rtd_partially_dispatched') return 'dispatched';
  if (rtdStatus === 'rtd_ready') return 'ready';
  if (safeNumber(line.total_actual_qty) > 0 || safeNumber(line.total_good_qty) > 0) return 'in_production';
  if (planStatus === 'submitted' || planStatus === 'approved') return 'planned';
  return 'accepted';
}

function LineFlowStepper({ status }) {
  const activeIndex = Math.max(LINE_FLOW.findIndex(step => step.key === status), 0);
  const activeStep = LINE_FLOW[activeIndex] || LINE_FLOW[0];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Line Item Stage</span>
        <span className="rounded-full bg-brand-600/10 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
          {activeStep.label}
        </span>
      </div>

      <div className="flex items-center gap-0.5 w-full overflow-x-auto pb-1">
        {LINE_FLOW.map((step, index) => {
          const completed = index < activeIndex;
          const active = index === activeIndex;

          return (
            <React.Fragment key={step.key}>
              <div className="flex flex-col items-center min-w-[98px]">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-semibold ${
                    completed
                      ? 'border-brand-600 bg-brand-600 text-white dark:border-brand-500 dark:bg-brand-500'
                      : active
                        ? 'border-brand-600 bg-brand-600 text-white shadow-[0_0_0_4px_rgba(79,70,229,0.12)] dark:border-brand-400 dark:bg-brand-500'
                        : 'border-gray-200 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500'
                  }`}
                >
                  {completed ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </div>
                <span
                  className={`mt-1.5 text-[10px] font-semibold whitespace-nowrap text-center ${
                    active
                      ? 'text-brand-700 dark:text-brand-300'
                      : completed
                        ? 'text-brand-600 dark:text-brand-500'
                        : 'text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < LINE_FLOW.length - 1 && (
                <div className={`h-0.5 min-w-[32px] flex-1 mx-1 ${index < activeIndex ? 'bg-brand-500 dark:bg-brand-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
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
  onSaveActualRow,
}) {
  const [localPlan, setLocalPlan] = useState(plan);
  const [savingRowKey, setSavingRowKey] = useState(null);

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
  const metaLocked = derivedPlan.status !== 'draft' || !canEdit;
  const canEditDraftPlan = canEdit && derivedPlan.status === 'draft';
  const canSubmitPlan = canEdit && derivedPlan.status === 'draft';
  const canApprovePlan = canApprove && derivedPlan.status === 'submitted';
  const canEditActuals = canEdit && derivedPlan.status === 'approved';

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
            if (field === 'actual_qty') nextEntry.good_qty = safeNumber(value);
            nextEntry.variance_qty = safeNumber(nextEntry.actual_qty) - safeNumber(nextEntry.planned_qty);
            return nextEntry;
          }),
        };
      }),
    }));
  };

  const updateBucketField = (lineIndex, bucket, field, value) => {
    const nextValue = field === 'remarks' ? value : safeNumber(value);
    patchPlan(prev => ({
      ...prev,
      lines: prev.lines.map((line, idx) => {
        if (idx !== lineIndex) return line;
        const bucketEntryIds = new Set(bucket.entryIds);
        const affectedEntries = line.entries.filter(entry => bucketEntryIds.has(entry.entry_id));
        const distributedValues = field === 'remarks'
          ? Array.from({ length: affectedEntries.length || 1 }, () => nextValue)
          : splitTotal(nextValue, affectedEntries.length || 1);
        let distributedIndex = 0;

        return {
          ...line,
          entries: line.entries.map(entry => {
            if (!bucketEntryIds.has(entry.entry_id)) return entry;
            const patchValue = distributedValues[distributedIndex] ?? (field === 'remarks' ? '' : 0);
            const nextEntry = { ...entry, [field]: patchValue };
            if (field === 'actual_qty') nextEntry.good_qty = safeNumber(patchValue);
            nextEntry.variance_qty = safeNumber(nextEntry.actual_qty) - safeNumber(nextEntry.planned_qty);
            distributedIndex += 1;
            return nextEntry;
          }),
        };
      }),
    }));
  };

  const handleSaveActualRow = async (line, bucket) => {
    if (!onSaveActualRow) return;
    const rowKey = `${line.line_id}-${bucket.key}`;
    setSavingRowKey(rowKey);
    try {
      const nextPlan = await onSaveActualRow({
        line_id: line.line_id,
        entry_ids: bucket.entryIds,
        actual_qty: bucket.actual_qty,
        remarks: bucket.remarks || '',
      });
      if (nextPlan) setLocalPlan(nextPlan);
    } finally {
      setSavingRowKey(null);
    }
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
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Production Planning & Actuals</h2>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${STATUS_CLASSES[derivedPlan.status] || STATUS_CLASSES.draft}`}>
                {derivedPlan.status}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
              Build and approve the plan first. Once approved, row-wise actual and remark updates are saved directly from the table.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            {canEditDraftPlan && (
              <button onClick={syncDateGrid} disabled={saving} className="btn-outline">
                <CalendarRange className="h-4 w-4" />
                Sync Date Grid
              </button>
            )}
            {canEditDraftPlan && (
              <button onClick={handleSave} disabled={saving} className="btn-outline">
                <Save className="h-4 w-4" />
                {saving ? 'Saving…' : 'Save Draft'}
              </button>
            )}
            {canSubmitPlan && (
              <button onClick={handleSubmit} disabled={saving} className="btn-primary">
                <Send className="h-4 w-4" />
                Submit Plan
              </button>
            )}
            {canApprovePlan && (
              <button onClick={handleApprove} disabled={saving} className="btn-success">
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
                  disabled={metaLocked}
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
                  disabled={metaLocked}
                />
              </div>
              <div>
                <label className="label">End Date</label>
                <input
                  type="date"
                  className="input"
                  value={derivedPlan.end_date || ''}
                  onChange={e => updateMeta('end_date', e.target.value)}
                  disabled={metaLocked}
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
                disabled={metaLocked}
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
                <div className="flex items-center justify-between"><span>Target Planned Qty</span><strong>{derivedPlan.summary.total_planned_qty.toLocaleString('en-IN')}</strong></div>
                <div className="flex items-center justify-between"><span>Target Estimated Qty</span><strong>{derivedPlan.summary.total_estimated_qty.toLocaleString('en-IN')}</strong></div>
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
                <div className="flex items-center justify-between"><span>Completion</span><strong>{derivedPlan.summary.total_po_qty > 0 ? `${Math.round((derivedPlan.summary.total_good_qty / derivedPlan.summary.total_po_qty) * 100)}%` : '0%'}</strong></div>
                <div className="flex items-center justify-between"><span>Balance Qty</span><strong>{derivedPlan.summary.remaining_qty.toLocaleString('en-IN')}</strong></div>
              </div>
            </div>
          </div>

            <div className="rounded-2xl border border-gray-200/80 bg-gradient-to-br from-brand-50 via-white to-signal-50 p-4 dark:border-gray-700 dark:bg-[linear-gradient(135deg,rgba(30,41,59,0.85),rgba(15,23,42,0.95))]">
            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
              <CalendarRange className="h-4 w-4 text-signal-500" />
              <span className="text-xs font-semibold uppercase tracking-[0.14em]">Display Rules</span>
            </div>
            <ul className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li>Day basis shows one row per date.</li>
              <li>Week basis groups the table into weekly ranges.</li>
              <li>Month basis groups the table into monthly buckets.</li>
              <li>Line item status follows Accepted to Planned to Production to RTD to Dispatch.</li>
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          {derivedPlan.lines.map((line, lineIndex) => (
            <div key={line.line_id || line.item_index} className="rounded-2xl border border-gray-200 dark:border-gray-700">
              <div className="border-b border-gray-100 px-4 py-4 dark:border-gray-700">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-gray-200/80 bg-gray-50/90 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/40">
                    <LineFlowStepper status={getLineFlowStatus(line, po, derivedPlan.status)} />
                  </div>

                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{line.item_name}</h3>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{line.description || 'Production line item linked directly from the PO.'}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200/80 bg-gray-50/90 px-3 py-2 xl:justify-end xl:max-w-[620px] dark:border-gray-700 dark:bg-gray-800/40">
                      <div className="rounded-xl bg-white px-3 py-2 dark:bg-gray-900/60">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">PO Qty</p>
                        <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{safeNumber(line.po_qty).toLocaleString('en-IN')} {line.uom || ''}</p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2 dark:bg-gray-900/60">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Target Planned</p>
                        <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{safeNumber(line.total_planned_qty).toLocaleString('en-IN')}</p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2 dark:bg-gray-900/60">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Target Estimated</p>
                        <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{safeNumber(line.total_estimated_qty).toLocaleString('en-IN')}</p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2 dark:bg-gray-900/60">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Actual</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">{safeNumber(line.total_actual_qty).toLocaleString('en-IN')}</p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2 dark:bg-gray-900/60">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Remaining</p>
                        <p className="mt-1 text-sm font-semibold text-amber-700 dark:text-amber-400">{safeNumber(line.remaining_qty).toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[920px] w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th className="table-th">{derivedPlan.planning_basis === 'day' ? 'Date' : derivedPlan.planning_basis === 'week' ? 'Week Range' : 'Month'}</th>
                      <th className="table-th text-right">Planned</th>
                      <th className="table-th text-right">Estimated</th>
                      <th className="table-th text-right">Actual</th>
                      <th className="table-th">Remarks</th>
                      {canEditActuals && <th className="table-th text-center">Save</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {buildEntryBuckets(line.entries, derivedPlan.planning_basis).map(bucket => {
                      const bucketSummary = summarizeEntryBucket(bucket);
                      const isDayView = derivedPlan.planning_basis === 'day';
                      const bucketRowKey = `${line.line_id}-${bucket.key}`;
                      const editableEntryIndex = line.entries.findIndex(entry => entry.entry_id === bucketSummary.entryIds[0]);
                      return (
                        <tr key={bucket.key}>
                          <td className="table-td whitespace-nowrap font-medium">{bucketSummary.label}</td>
                          <td className="table-td text-right">
                            <input
                              type="number"
                              className="input py-1 text-right text-xs"
                              value={bucketSummary.planned_qty}
                              onChange={e => (
                                isDayView
                                  ? updateEntryField(lineIndex, editableEntryIndex, 'planned_qty', e.target.value)
                                  : updateBucketField(lineIndex, bucketSummary, 'planned_qty', e.target.value)
                              )}
                              disabled={!canEditDraftPlan}
                            />
                          </td>
                          <td className="table-td text-right">
                            <input
                              type="number"
                              className="input py-1 text-right text-xs"
                              value={bucketSummary.estimated_qty}
                              onChange={e => (
                                isDayView
                                  ? updateEntryField(lineIndex, editableEntryIndex, 'estimated_qty', e.target.value)
                                  : updateBucketField(lineIndex, bucketSummary, 'estimated_qty', e.target.value)
                              )}
                              disabled={!canEditDraftPlan}
                            />
                          </td>
                          <td className="table-td text-right">
                            <input
                              type="number"
                              className="input py-1 text-right text-xs"
                              value={bucketSummary.actual_qty}
                              onChange={e => (
                                isDayView
                                  ? updateEntryField(lineIndex, editableEntryIndex, 'actual_qty', e.target.value)
                                  : updateBucketField(lineIndex, bucketSummary, 'actual_qty', e.target.value)
                              )}
                              disabled={!canEditActuals}
                            />
                          </td>
                          <td className="table-td">
                            <input
                              type="text"
                              className="input py-1 text-xs"
                              value={bucketSummary.remarks || ''}
                              onChange={e => (
                                isDayView
                                  ? updateEntryField(lineIndex, editableEntryIndex, 'remarks', e.target.value)
                                  : updateBucketField(lineIndex, bucketSummary, 'remarks', e.target.value)
                              )}
                              disabled={!canEditActuals}
                            />
                          </td>
                          {canEditActuals && (
                            <td className="table-td text-center">
                              <button
                                onClick={() => handleSaveActualRow(line, bucketSummary)}
                                disabled={saving || savingRowKey === bucketRowKey}
                                className="btn-outline inline-flex px-2.5"
                                title="Save row"
                              >
                                <Save className="h-4 w-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
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
