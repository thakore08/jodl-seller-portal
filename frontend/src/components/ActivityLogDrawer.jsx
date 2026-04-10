import React from 'react';
import { X } from 'lucide-react';

// ─── Event type → dot color + readable label ─────────────────────────────────
const EVENT_CONFIG = {
  po_issued:       { dot: 'bg-gray-400 dark:bg-gray-500',      label: 'PO Issued' },
  po_accepted:     { dot: 'bg-green-500 dark:bg-green-400',    label: 'PO Accepted' },
  po_rejected:     { dot: 'bg-red-500 dark:bg-red-400',        label: 'PO Rejected' },
  rtd_eta_set:     { dot: 'bg-blue-500 dark:bg-blue-400',      label: 'RTD ETAs Set' },
  item_ready:      { dot: 'bg-green-500 dark:bg-green-400',    label: 'Item Marked Ready' },
  undo_ready:      { dot: 'bg-amber-400 dark:bg-amber-300',    label: 'Ready Status Undone' },
  eta_revised:     { dot: 'bg-amber-500 dark:bg-amber-400',    label: 'ETA Revised' },
  mark_dispatched: { dot: 'bg-teal-500 dark:bg-teal-400',      label: 'Marked Dispatched' },
  invoice_created: { dot: 'bg-indigo-500 dark:bg-indigo-400',  label: 'Invoice Created' },
  production_plan_saved:     { dot: 'bg-sky-500 dark:bg-sky-400',       label: 'Production Plan Saved' },
  production_plan_submitted: { dot: 'bg-amber-500 dark:bg-amber-400',   label: 'Production Plan Submitted' },
  production_plan_approved:  { dot: 'bg-emerald-500 dark:bg-emerald-400', label: 'Production Plan Approved' },
  production_actual_updated: { dot: 'bg-violet-500 dark:bg-violet-400', label: 'Production Actual Updated' },
};

function fmtTimestamp(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function DetailsBlock({ details }) {
  if (!details || Object.keys(details).length === 0) return null;
  const entries = Object.entries(details).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return null;

  return (
    <div className="mt-1 rounded bg-gray-100 dark:bg-gray-700/60 px-2.5 py-1.5 text-[11px] text-gray-600 dark:text-gray-400 space-y-0.5">
      {entries.map(([key, value]) => {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const displayValue = Array.isArray(value)
          ? `${value.length} item${value.length !== 1 ? 's' : ''}`
          : typeof value === 'object'
            ? JSON.stringify(value)
            : String(value);
        return (
          <div key={key} className="flex gap-1.5">
            <span className="font-medium shrink-0">{label}:</span>
            <span className="break-all">{displayValue}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────
export default function ActivityLogDrawer({ open, onClose, po }) {
  const log = po?.activity_log || [];
  const poNumber = po?.purchaseorder_number || '';

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 dark:bg-black/50 transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl flex flex-col
          transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Activity Log"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-4 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Activity Log</h2>
            {poNumber && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">PO #{poNumber}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label="Close activity log"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {log.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 dark:text-gray-500 gap-2">
              <span className="text-3xl">📋</span>
              <p className="text-sm">No activity recorded yet.</p>
            </div>
          ) : (
            <ol className="relative space-y-0">
              {log.map((entry, i) => {
                const cfg = EVENT_CONFIG[entry.event] || { dot: 'bg-gray-300 dark:bg-gray-600', label: entry.event };
                const isLast = i === log.length - 1;

                return (
                  <li key={i} className="relative flex gap-4 pb-6">
                    {/* Vertical connector line */}
                    {!isLast && (
                      <div className="absolute left-[11px] top-6 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
                    )}

                    {/* Dot */}
                    <div className={`relative shrink-0 mt-1 h-5 w-5 rounded-full border-2 border-white dark:border-gray-800 ${cfg.dot} shadow-sm`} />

                    {/* Content */}
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-snug">{cfg.label}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {entry.actor && <span className="font-medium text-gray-500 dark:text-gray-400">{entry.actor}</span>}
                        {entry.actor && entry.timestamp && ' · '}
                        {fmtTimestamp(entry.timestamp)}
                      </p>
                      <DetailsBlock details={entry.details} />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </>
  );
}
