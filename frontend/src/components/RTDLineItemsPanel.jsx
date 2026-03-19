import React, { useState } from 'react';
import { Pencil, CheckCircle, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

// ─── RTD Status computation ───────────────────────────────────────────────────
function getRTDStatus(itemIndex, rtdData, effectiveStatus) {
  if (effectiveStatus === 'dispatched' || effectiveStatus === 'invoiced') {
    const rtd = rtdData?.[itemIndex];
    if (rtd?.rtd_marked_ready_at) return 'rtd_dispatched';
  }
  const rtd = rtdData?.[itemIndex];
  if (!rtd) return 'rtd_pending';
  if (rtd.rtd_marked_ready_at) return 'rtd_ready';
  const today = new Date().toISOString().split('T')[0];
  const eta = rtd.rtd_eta_revised || rtd.rtd_eta_original;
  if (eta && eta < today) return 'rtd_overdue';
  return 'rtd_pending';
}

const RTD_STATUS_LABELS = {
  rtd_pending:    'Pending',
  rtd_overdue:    'ETA Overdue',
  rtd_ready:      'Ready to Dispatch',
  rtd_dispatched: 'Dispatched',
};

const RTD_STATUS_CLASSES = {
  rtd_pending:    'bg-gray-100    text-gray-600    dark:bg-gray-700       dark:text-gray-300',
  rtd_overdue:    'bg-red-100     text-red-700     dark:bg-red-900/30     dark:text-red-400',
  rtd_ready:      'bg-green-100   text-green-700   dark:bg-green-900/30   dark:text-green-400',
  rtd_dispatched: 'bg-teal-100    text-teal-700    dark:bg-teal-900/30    dark:text-teal-400',
};

function RTDStatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${RTD_STATUS_CLASSES[status] || RTD_STATUS_CLASSES.rtd_pending}`}>
      {RTD_STATUS_LABELS[status] || 'Pending'}
    </span>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    const [y, m, day] = d.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${parseInt(day, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
  } catch {
    return d;
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RTDLineItemsPanel({ po, rtdData = {}, onMarkReady, onUndoReady, onReviseEta, readOnly }) {
  const lineItems = po?.line_items || [];
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })();

  // Inline confirm state for "Mark Ready"
  const [confirmingIndex, setConfirmingIndex] = useState(null);

  // Inline ETA edit state
  const [editingEtaIndex, setEditingEtaIndex] = useState(null);
  const [etaValue, setEtaValue] = useState('');

  // Revision log popover
  const [showRevisionLog, setShowRevisionLog] = useState(null); // itemIndex

  const effectiveStatus = po?.local_status === 'dispatched' ? 'dispatched'
    : po?.status === 'billed' ? 'invoiced'
    : null;

  const readyCount = lineItems.filter((_, idx) => {
    const rtd = rtdData[idx];
    return rtd?.rtd_marked_ready_at;
  }).length;
  const allReady = lineItems.length > 0 && readyCount === lineItems.length;

  const handleMarkReadyConfirm = async (itemIndex) => {
    setConfirmingIndex(null);
    if (onMarkReady) await onMarkReady(itemIndex);
  };

  const handleReviseEtaCommit = async (itemIndex) => {
    if (!etaValue || etaValue < today) return;
    setEditingEtaIndex(null);
    if (onReviseEta) await onReviseEta(itemIndex, etaValue);
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Line Items — Ready to Dispatch Tracking
        </h2>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium
          ${allReady
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
          }`}>
          {allReady
            ? <CheckCircle className="h-3.5 w-3.5" />
            : null}
          {readyCount} of {lineItems.length} ready
        </span>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="table-th w-8">#</th>
              <th className="table-th">Description</th>
              <th className="table-th text-right">Qty</th>
              <th className="table-th text-right">Unit</th>
              <th className="table-th text-right">Amount</th>
              <th className="table-th text-center">Original ETA</th>
              <th className="table-th text-center">Revised ETA</th>
              <th className="table-th text-center">RTD Status</th>
              {!readOnly && <th className="table-th text-center">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
            {lineItems.map((item, idx) => {
              const rtd = rtdData[idx];
              const status = getRTDStatus(idx, rtdData, effectiveStatus);
              const isConfirming = confirmingIndex === idx;
              const isEditingEta = editingEtaIndex === idx;
              const revisionCount = rtd?.revision_log?.length || 0;
              const canAct = !readOnly && (status === 'rtd_pending' || status === 'rtd_overdue');
              const isReady = status === 'rtd_ready';

              return (
                <React.Fragment key={idx}>
                  <tr className={isConfirming ? 'bg-green-50 dark:bg-green-900/10' : ''}>
                    <td className="table-td text-gray-400 text-xs">{idx + 1}</td>
                    <td className="table-td font-medium">
                      <p className="text-gray-900 dark:text-gray-100 leading-snug">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate max-w-xs">{item.description}</p>
                      )}
                    </td>
                    <td className="table-td text-right">{item.quantity}</td>
                    <td className="table-td text-right text-gray-500 dark:text-gray-400">{item.unit || '—'}</td>
                    <td className="table-td text-right whitespace-nowrap font-medium">
                      {po.currency_code} {Number(item.item_total || (item.rate * item.quantity) || 0).toLocaleString('en-IN')}
                    </td>
                    {/* Original ETA */}
                    <td className="table-td text-center text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {rtd?.rtd_eta_original ? fmtDate(rtd.rtd_eta_original) : '—'}
                    </td>
                    {/* Revised ETA */}
                    <td className="table-td text-center text-xs whitespace-nowrap">
                      {isEditingEta ? (
                        <input
                          type="date"
                          autoFocus
                          className="input py-0.5 text-xs w-32"
                          value={etaValue}
                          min={today}
                          onChange={e => setEtaValue(e.target.value)}
                          onBlur={() => handleReviseEtaCommit(idx)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleReviseEtaCommit(idx);
                            if (e.key === 'Escape') setEditingEtaIndex(null);
                          }}
                        />
                      ) : rtd?.rtd_eta_revised ? (
                        <span className="flex items-center justify-center gap-1">
                          <span className="text-amber-600 dark:text-amber-400">{fmtDate(rtd.rtd_eta_revised)}</span>
                          {revisionCount > 0 && (
                            <button
                              onClick={() => setShowRevisionLog(showRevisionLog === idx ? null : idx)}
                              className="inline-flex items-center gap-0.5 text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded px-1 py-0.5 hover:bg-amber-200"
                            >
                              ×{revisionCount} {showRevisionLog === idx ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
                            </button>
                          )}
                          {!readOnly && canAct && (
                            <button
                              onClick={() => { setEditingEtaIndex(idx); setEtaValue(rtd.rtd_eta_revised); }}
                              className="ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                              title="Revise ETA"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-1 text-gray-400">
                          —
                          {!readOnly && canAct && rtd?.rtd_eta_original && (
                            <button
                              onClick={() => { setEditingEtaIndex(idx); setEtaValue(rtd.rtd_eta_original || tomorrow); }}
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                              title="Add revised ETA"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                    {/* RTD Status */}
                    <td className="table-td text-center">
                      {isReady && rtd?.rtd_marked_ready_at ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <RTDStatusBadge status={status} />
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            {fmtDate(rtd.rtd_marked_ready_at.split('T')[0])}
                          </span>
                        </div>
                      ) : (
                        <RTDStatusBadge status={status} />
                      )}
                    </td>
                    {/* Action */}
                    {!readOnly && (
                      <td className="table-td text-center">
                        {canAct && (
                          <button
                            onClick={() => setConfirmingIndex(idx)}
                            className="btn-outline text-xs py-1 px-2 text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-900/20"
                          >
                            Mark Ready
                          </button>
                        )}
                        {isReady && (
                          <button
                            onClick={() => onUndoReady && onUndoReady(idx)}
                            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline-offset-2 hover:underline flex items-center gap-1 mx-auto"
                          >
                            <RotateCcw className="h-3 w-3" /> Undo
                          </button>
                        )}
                      </td>
                    )}
                  </tr>

                  {/* Inline confirm row */}
                  {isConfirming && (
                    <tr className="bg-green-50 dark:bg-green-900/10">
                      <td colSpan={readOnly ? 8 : 9} className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <span className="text-gray-700 dark:text-gray-200">
                            Confirm: Mark <strong>{item.name}</strong> as Ready to Dispatch?
                            &nbsp;Qty: <strong>{item.quantity}</strong>
                            &nbsp;ETA: <strong>{fmtDate(rtd?.rtd_eta_revised || rtd?.rtd_eta_original)}</strong>
                          </span>
                          <div className="flex gap-2 ml-auto">
                            <button
                              onClick={() => setConfirmingIndex(null)}
                              className="btn-outline text-xs py-1 px-3"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleMarkReadyConfirm(idx)}
                              className="btn-success text-xs py-1 px-3"
                            >
                              <CheckCircle className="h-3.5 w-3.5" /> Confirm
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Revision log expand row */}
                  {showRevisionLog === idx && rtd?.revision_log?.length > 0 && (
                    <tr>
                      <td colSpan={readOnly ? 8 : 9} className="px-4 py-2 bg-amber-50 dark:bg-amber-900/10">
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">ETA Revision History</p>
                        <ul className="space-y-0.5">
                          {rtd.revision_log.map((rev, ri) => (
                            <li key={ri} className="text-[11px] text-gray-600 dark:text-gray-400">
                              #{rev.revision_count}: {fmtDate(rev.previous_eta)} → {fmtDate(rev.new_eta)}
                              <span className="text-gray-400 dark:text-gray-500 ml-2">{rev.revised_at ? new Date(rev.revised_at).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}) : ''}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="sm:hidden divide-y divide-gray-100 dark:divide-gray-700">
        {lineItems.map((item, idx) => {
          const rtd = rtdData[idx];
          const status = getRTDStatus(idx, rtdData, effectiveStatus);
          const isConfirming = confirmingIndex === idx;
          const isEditingEta = editingEtaIndex === idx;
          const canAct = !readOnly && (status === 'rtd_pending' || status === 'rtd_overdue');
          const isReady = status === 'rtd_ready';

          return (
            <li key={idx} className={`px-4 py-3 space-y-2 ${isConfirming ? 'bg-green-50 dark:bg-green-900/10' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug">{item.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Qty: {item.quantity}{item.unit ? ` ${item.unit}` : ''} · {po.currency_code} {Number(item.item_total || (item.rate * item.quantity) || 0).toLocaleString('en-IN')}
                  </p>
                </div>
                <RTDStatusBadge status={status} />
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                {rtd?.rtd_eta_original && (
                  <span>Original ETA: <span className="font-medium text-gray-700 dark:text-gray-300">{fmtDate(rtd.rtd_eta_original)}</span></span>
                )}
                {rtd?.rtd_eta_revised && (
                  <span>Revised ETA: <span className="font-medium text-amber-600 dark:text-amber-400">{fmtDate(rtd.rtd_eta_revised)}</span></span>
                )}
              </div>

              {isReady && rtd?.rtd_marked_ready_at && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Marked ready on {fmtDate(rtd.rtd_marked_ready_at.split('T')[0])}
                </p>
              )}

              {/* Mobile: ETA edit */}
              {!readOnly && canAct && isEditingEta && (
                <input
                  type="date"
                  autoFocus
                  className="input py-1 text-sm w-full"
                  value={etaValue}
                  min={today}
                  onChange={e => setEtaValue(e.target.value)}
                  onBlur={() => handleReviseEtaCommit(idx)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleReviseEtaCommit(idx);
                    if (e.key === 'Escape') setEditingEtaIndex(null);
                  }}
                />
              )}

              {/* Mobile: Inline confirm */}
              {isConfirming ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    Confirm mark <strong>{item.name}</strong> as Ready? ETA: {fmtDate(rtd?.rtd_eta_revised || rtd?.rtd_eta_original)}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmingIndex(null)} className="btn-outline text-xs py-1 flex-1">Cancel</button>
                    <button onClick={() => handleMarkReadyConfirm(idx)} className="btn-success text-xs py-1 flex-1">
                      <CheckCircle className="h-3.5 w-3.5" /> Confirm
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 items-center">
                  {canAct && (
                    <button
                      onClick={() => setConfirmingIndex(idx)}
                      className="text-xs font-medium text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700 rounded px-2 py-1 hover:bg-green-50 dark:hover:bg-green-900/20"
                    >
                      Mark Ready
                    </button>
                  )}
                  {canAct && (
                    <button
                      onClick={() => { setEditingEtaIndex(idx); setEtaValue(rtd?.rtd_eta_revised || rtd?.rtd_eta_original || tomorrow); }}
                      className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                    >
                      <Pencil className="h-3 w-3" /> Revise ETA
                    </button>
                  )}
                  {isReady && !readOnly && (
                    <button
                      onClick={() => onUndoReady && onUndoReady(idx)}
                      className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                    >
                      <RotateCcw className="h-3 w-3" /> Undo
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
