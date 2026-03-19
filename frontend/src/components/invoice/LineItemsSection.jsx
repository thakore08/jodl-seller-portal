import React from 'react';
import {
  ChevronDown, ChevronUp, Plus, Trash2,
  CheckCircle, AlertCircle, XCircle, AlertTriangle,
} from 'lucide-react';

const GST_RATES = [0, 5, 12, 18, 28];

const fmt = v => (v != null && !isNaN(v) ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');

// ── Match status badge (mirrors MatchBadge in LineItemMatchRow.jsx) ───────────
function MatchBadge({ matchType }) {
  if (matchType === 'full_match') return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
      <CheckCircle className="h-3 w-3" /> Full Match
    </span>
  );
  if (matchType === 'partial_match') return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
      <AlertCircle className="h-3 w-3" /> Partial
    </span>
  );
  if (matchType === 'no_match') return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
      <XCircle className="h-3 w-3" /> No Match
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
      ✏️ Manual
    </span>
  );
}

// ── Parsed attribute chips ────────────────────────────────────────────────────
function ParsedChips({ parsed }) {
  if (!parsed) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {parsed.brand     && <span className="badge bg-blue-50   text-blue-700   dark:bg-blue-900/20   dark:text-blue-300">{parsed.brand}</span>}
      {parsed.grade     && <span className="badge bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300">{parsed.grade}</span>}
      {parsed.thickness_mm != null && <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{parsed.thickness_mm}mm thk</span>}
      {parsed.width_mm     != null && <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{parsed.width_mm}mm wide</span>}
      {parsed.diameter_mm  != null && <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">Ø{parsed.diameter_mm}mm</span>}
    </div>
  );
}

/**
 * LineItemsSection — Section 2 of the invoice form.
 *
 * Renders extracted (or manual) line items in a full-featured table with:
 *   - Parsed attribute chips
 *   - Matched PO item dropdown
 *   - Computed Taxable Amount and GST Amount
 *   - Match status badge
 *   - Warning sub-row with Acknowledge checkbox
 *   - ↑↓ reorder + add + delete row controls
 *   - Running totals in tfoot
 */
export default function LineItemsSection({
  lineItems,
  matchResults,
  poLineItems,
  currencyCode,
  onLineItemChange,
  onLineItemAdd,
  onLineItemDelete,
  onLineItemMove,
  onMatchUpdate,
  onFieldFocus,
  isCollapsed,
  onToggle,
}) {
  const inputCls = 'block w-full rounded border border-gray-200 dark:border-gray-600 px-1.5 py-1 text-xs bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';

  // ── Running totals ──────────────────────────────────────────────────────────
  const totals = lineItems.reduce((acc, item) => {
    const qty  = parseFloat(item.quantity)  || 0;
    const rate = parseFloat(item.unit_rate) || 0;
    const gst  = parseFloat(item.gst_rate)  || 0;
    const taxable = qty * rate;
    const gstAmt  = taxable * gst / 100;
    acc.qty     += qty;
    acc.taxable += taxable;
    acc.gst     += gstAmt;
    return acc;
  }, { qty: 0, taxable: 0, gst: 0 });

  return (
    <div className="border-b border-gray-100 dark:border-gray-700">
      {/* Section header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
      >
        <span>2 — Line Items ({lineItems.length})</span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
      </button>

      {!isCollapsed && (
        <div className="px-2 pb-4">
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-xs min-w-[900px]">
              <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0">
                <tr>
                  <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400 w-6">#</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400 min-w-[180px]">Description</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400 min-w-[130px]">Matched PO Item</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400 w-20">HSN</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400 w-16">Qty</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400 w-14">Unit</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400 w-24">Unit Rate</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400 w-24">Taxable Amt</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400 w-16">GST %</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400 w-24">GST Amt</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-400 w-24">Match</th>
                  <th className="px-2 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, idx) => {
                  const matchResult  = matchResults?.[idx];
                  const matchType    = matchResult?.match_type;
                  const warnings     = matchResult?.warnings || [];
                  const acknowledged = matchResult?.acknowledged || false;
                  const confirmed    = matchResult?.confirmed || false;

                  const manualPoIdx  = matchResult?.manual_mapping_po_index;
                  const autoPoIdx    = matchResult?.po_item_index;
                  const selectedPoIdx = manualPoIdx ?? autoPoIdx ?? '';

                  const qty       = parseFloat(item.quantity)  || 0;
                  const rate      = parseFloat(item.unit_rate) || 0;
                  const gstRate   = parseFloat(item.gst_rate)  || 0;
                  const taxableAmt = qty * rate;
                  const gstAmt    = taxableAmt * gstRate / 100;

                  return (
                    <React.Fragment key={idx}>
                      <tr className="border-t border-gray-100 dark:border-gray-700 align-top hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                        {/* # */}
                        <td className="px-2 py-2 text-gray-400 dark:text-gray-500">{idx + 1}</td>

                        {/* Description + parsed chips */}
                        <td className="px-2 py-2">
                          <input
                            className={inputCls}
                            value={item.raw_description || ''}
                            onChange={e => onLineItemChange(idx, { raw_description: e.target.value })}
                            onFocus={() => onFieldFocus && onFieldFocus(item.raw_description)}
                            placeholder="Description"
                          />
                          <ParsedChips parsed={item.parsed} />
                        </td>

                        {/* Matched PO item dropdown */}
                        <td className="px-2 py-2">
                          <select
                            className={inputCls}
                            value={selectedPoIdx === '' ? '' : String(selectedPoIdx)}
                            onChange={e => {
                              const val = e.target.value;
                              onMatchUpdate && onMatchUpdate(idx, {
                                manual_mapping_po_index: val === '' ? null : parseInt(val, 10),
                              });
                            }}
                          >
                            <option value="">— select —</option>
                            {(poLineItems || []).map((p, i) => (
                              <option key={i} value={i}>
                                {p.name || p.description || `Item ${i + 1}`}
                              </option>
                            ))}
                          </select>
                          {/* Partial match confirm button */}
                          {matchType === 'partial_match' && !confirmed && (
                            <button
                              type="button"
                              onClick={() => onMatchUpdate && onMatchUpdate(idx, { confirmed: true })}
                              className="mt-1 text-xs text-amber-700 dark:text-amber-400 underline"
                            >
                              Confirm match
                            </button>
                          )}
                          {matchType === 'partial_match' && confirmed && (
                            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-0.5 mt-1">
                              <CheckCircle className="h-3 w-3" /> Confirmed
                            </span>
                          )}
                        </td>

                        {/* HSN */}
                        <td className="px-2 py-2">
                          <input
                            className={inputCls}
                            value={item.hsn_code || ''}
                            onChange={e => onLineItemChange(idx, { hsn_code: e.target.value })}
                            placeholder="HSN"
                          />
                        </td>

                        {/* Qty */}
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            className={inputCls}
                            value={item.quantity || ''}
                            onChange={e => onLineItemChange(idx, { quantity: e.target.value })}
                            placeholder="0"
                          />
                        </td>

                        {/* Unit */}
                        <td className="px-2 py-2">
                          <input
                            className={inputCls}
                            value={item.unit || ''}
                            onChange={e => onLineItemChange(idx, { unit: e.target.value })}
                            placeholder="MT"
                          />
                        </td>

                        {/* Unit Rate */}
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            className={inputCls}
                            value={item.unit_rate || ''}
                            onChange={e => onLineItemChange(idx, { unit_rate: e.target.value })}
                            placeholder="0.00"
                          />
                        </td>

                        {/* Taxable Amount (computed, read-only) */}
                        <td className="px-2 py-2 text-right font-medium text-gray-700 dark:text-gray-300">
                          {fmt(taxableAmt)}
                        </td>

                        {/* GST Rate dropdown */}
                        <td className="px-2 py-2">
                          <select
                            className={inputCls}
                            value={item.gst_rate || ''}
                            onChange={e => onLineItemChange(idx, { gst_rate: e.target.value })}
                          >
                            <option value="">—</option>
                            {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                          </select>
                        </td>

                        {/* GST Amount (computed, read-only) */}
                        <td className="px-2 py-2 text-right font-medium text-gray-700 dark:text-gray-300">
                          {gstRate > 0 ? fmt(gstAmt) : '—'}
                        </td>

                        {/* Match badge */}
                        <td className="px-2 py-2">
                          <MatchBadge matchType={matchType} />
                        </td>

                        {/* Row actions */}
                        <td className="px-2 py-2">
                          <div className="flex flex-col gap-0.5 items-center">
                            <button
                              type="button"
                              title="Move up"
                              disabled={idx === 0}
                              onClick={() => onLineItemMove(idx, 'up')}
                              className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30"
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Move down"
                              disabled={idx === lineItems.length - 1}
                              onClick={() => onLineItemMove(idx, 'down')}
                              className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Delete row"
                              onClick={() => onLineItemDelete(idx)}
                              className="p-0.5 rounded text-red-400 hover:text-red-600 dark:hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Warnings sub-row */}
                      {warnings.length > 0 && (
                        <tr className="border-t border-yellow-100 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/10">
                          <td colSpan={12} className="px-3 py-2">
                            <div className="flex flex-wrap items-start gap-3">
                              <div className="flex-1 space-y-0.5">
                                {warnings.map((w, i) => (
                                  <p key={i} className="text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-1">
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {w.message}
                                  </p>
                                ))}
                              </div>
                              {!acknowledged ? (
                                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-yellow-800 dark:text-yellow-300 font-medium whitespace-nowrap">
                                  <input
                                    type="checkbox"
                                    className="rounded border-yellow-400 text-yellow-600"
                                    checked={acknowledged}
                                    onChange={e => onMatchUpdate && onMatchUpdate(idx, { acknowledged: e.target.checked })}
                                  />
                                  Acknowledge
                                </label>
                              ) : (
                                <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1 whitespace-nowrap">
                                  <CheckCircle className="h-3.5 w-3.5" /> Acknowledged
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>

              {/* Running totals footer */}
              <tfoot>
                <tr className="border-t-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 font-semibold text-xs">
                  <td className="px-2 py-2 text-gray-400 dark:text-gray-500" colSpan={4}>Totals</td>
                  <td className="px-2 py-2 text-right text-gray-700 dark:text-gray-300">{totals.qty > 0 ? totals.qty.toLocaleString('en-IN') : '—'}</td>
                  <td colSpan={2}></td>
                  <td className="px-2 py-2 text-right text-gray-900 dark:text-gray-100">₹ {fmt(totals.taxable)}</td>
                  <td></td>
                  <td className="px-2 py-2 text-right text-gray-900 dark:text-gray-100">₹ {fmt(totals.gst)}</td>
                  <td className="px-2 py-2 text-right text-brand-700 dark:text-brand-400">
                    ₹ {fmt(totals.taxable + totals.gst)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Add row button */}
          <button
            type="button"
            onClick={onLineItemAdd}
            className="mt-2 flex items-center gap-1.5 text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
          >
            <Plus className="h-3.5 w-3.5" /> Add line item
          </button>
        </div>
      )}
    </div>
  );
}
