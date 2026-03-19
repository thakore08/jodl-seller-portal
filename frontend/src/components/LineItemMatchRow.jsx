import React from 'react';
import { AlertTriangle, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import ConfidenceBadge from './ConfidenceBadge';

// ─── Match type badge ─────────────────────────────────────────────────────────
function MatchBadge({ matchType }) {
  if (matchType === 'full_match') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
        <CheckCircle className="h-3 w-3" /> Full Match
      </span>
    );
  }
  if (matchType === 'partial_match') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
        <AlertCircle className="h-3 w-3" /> Partial
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
      <XCircle className="h-3 w-3" /> No Match
    </span>
  );
}

// ─── Attribute chip ───────────────────────────────────────────────────────────
function AttrChip({ label, matched }) {
  if (matched) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
        ✓ {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400">
      ✗ {label}
    </span>
  );
}

/**
 * LineItemMatchRow
 *
 * Renders a single <tr> inside the match review table.
 *
 * Props:
 *   invItem        — extracted invoice line item (from pdfExtractorService)
 *   matchResult    — MatchResult from invoiceMatchingService
 *   poLineItems    — full array of PO line items (for dropdown + display)
 *   onUpdateMatch  — (invoiceItemIndex, patch) => void
 *   currencyCode   — e.g. 'INR'
 */
export default function LineItemMatchRow({
  invItem,
  matchResult,
  poLineItems,
  onUpdateMatch,
  currencyCode = 'INR',
}) {
  const {
    invoice_item_index: invIdx,
    po_item_index:      poIdx,
    match_type:         matchType,
    matched_attributes: matchedAttrs = [],
    missing_attributes: missingAttrs = [],
    rate_delta_pct:     rateDelta,
    qty_delta_pct:      qtyDelta,
    warnings     = [],
    confirmed    = false,
    acknowledged = false,
    manual_mapping_po_index: manualPoIdx,
  } = matchResult;

  const matchedPo = poIdx != null ? poLineItems[poIdx] : null;
  const manualPo  = manualPoIdx != null ? poLineItems[manualPoIdx] : null;
  const displayPo = manualPo || matchedPo;

  // All unique attributes relevant for this product type
  const allAttrs = [...new Set([...matchedAttrs, ...missingAttrs])];

  const fmt = v => (v != null ? Number(v).toLocaleString('en-IN') : '—');

  return (
    <>
      <tr className="border-b border-gray-100 dark:border-gray-700 text-sm align-top">
        {/* ── Cell 1: Invoice item ── */}
        <td className="px-3 py-3 min-w-[200px]">
          <p className="font-medium text-gray-900 dark:text-gray-100 leading-snug">
            {invItem.raw_description || '—'}
          </p>
          <div className="mt-1 flex flex-wrap gap-1 text-xs text-gray-500 dark:text-gray-400">
            {invItem.quantity?.value != null && (
              <span>Qty: {invItem.quantity.value} {invItem.unit?.value || ''}</span>
            )}
            {invItem.unit_rate?.value != null && (
              <span>· Rate: {currencyCode} {fmt(invItem.unit_rate.value)}</span>
            )}
          </div>
          {invItem.parsed && (
            <div className="mt-1 flex flex-wrap gap-1">
              {invItem.parsed.brand     && <span className="badge bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">{invItem.parsed.brand}</span>}
              {invItem.parsed.grade     && <span className="badge bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300">{invItem.parsed.grade}</span>}
              {invItem.parsed.thickness_mm != null && <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{invItem.parsed.thickness_mm}mm thk</span>}
              {invItem.parsed.width_mm     != null && <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{invItem.parsed.width_mm}mm wide</span>}
              {invItem.parsed.diameter_mm  != null && <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">Ø{invItem.parsed.diameter_mm}mm</span>}
            </div>
          )}
          <div className="mt-1">
            <ConfidenceBadge confidence={invItem.unit_rate?.confidence || 'low'} />
          </div>
        </td>

        {/* ── Cell 2: Matched PO item ── */}
        <td className="px-3 py-3 min-w-[180px]">
          {displayPo ? (
            <>
              <p className="font-medium text-gray-800 dark:text-gray-200 leading-snug">
                {displayPo.name || displayPo.description || '—'}
              </p>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                <p>Qty: {displayPo.quantity} {displayPo.unit || ''}</p>
                <p>Rate: {currencyCode} {fmt(displayPo.rate)}</p>
              </div>
            </>
          ) : (
            <span className="text-xs text-red-500 dark:text-red-400 font-medium">No match found</span>
          )}
        </td>

        {/* ── Cell 3: Match status ── */}
        <td className="px-3 py-3">
          <MatchBadge matchType={matchType} />
          {rateDelta != null && Math.abs(rateDelta) > 0.5 && (
            <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-400">
              Rate {rateDelta > 0 ? '+' : ''}{rateDelta}%
            </p>
          )}
          {qtyDelta != null && Math.abs(qtyDelta) > 0.5 && (
            <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-400">
              Qty {qtyDelta > 0 ? '+' : ''}{qtyDelta}%
            </p>
          )}
        </td>

        {/* ── Cell 4: Attribute chips ── */}
        <td className="px-3 py-3">
          {allAttrs.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {allAttrs.map(attr => (
                <AttrChip key={attr} label={attr} matched={matchedAttrs.includes(attr)} />
              ))}
            </div>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
          )}
        </td>

        {/* ── Cell 5: Action ── */}
        <td className="px-3 py-3 min-w-[160px]">
          {matchType === 'partial_match' && !confirmed && (
            <button
              onClick={() => onUpdateMatch(invIdx, { confirmed: true })}
              className="btn-outline py-1 text-xs"
            >
              Confirm Match
            </button>
          )}
          {matchType === 'partial_match' && confirmed && (
            <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5" /> Confirmed
            </span>
          )}
          {matchType === 'no_match' && (
            <div className="space-y-1">
              <label className="text-xs text-gray-500 dark:text-gray-400 block">Map to PO item:</label>
              <select
                className="input py-1 text-xs"
                value={manualPoIdx ?? ''}
                onChange={e => {
                  const val = e.target.value;
                  onUpdateMatch(invIdx, {
                    manual_mapping_po_index: val === '' ? null : parseInt(val, 10),
                  });
                }}
              >
                <option value="">— select —</option>
                {poLineItems.map((p, idx) => (
                  <option key={idx} value={idx}>
                    {p.name || p.description || `Item ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}
          {matchType === 'full_match' && (
            <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5" /> Auto-matched
            </span>
          )}
        </td>
      </tr>

      {/* ── Warning banner row (rate/qty mismatch) ── */}
      {warnings.length > 0 && (
        <tr className="border-b border-gray-100 dark:border-gray-700 bg-yellow-50 dark:bg-yellow-900/10">
          <td colSpan={5} className="px-3 py-2">
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
                    onChange={e => onUpdateMatch(invIdx, { acknowledged: e.target.checked })}
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
    </>
  );
}
