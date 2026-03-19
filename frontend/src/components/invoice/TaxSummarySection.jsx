import React from 'react';
import { ChevronDown, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import ConfidenceField from './ConfidenceField';

// ── Indian states/UTs with GST 2-digit codes ─────────────────────────────────
export const INDIAN_STATES = [
  { code: '01', name: 'Jammu & Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra & Nagar Haveli and Daman & Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '28', name: 'Andhra Pradesh' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman & Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh (new)' },
  { code: '38', name: 'Ladakh' },
];

// Derive state code from a place_of_supply string (name or 2-digit code)
function getStateCode(placeOfSupply) {
  if (!placeOfSupply) return null;
  const trimmed = placeOfSupply.trim();
  if (/^\d{2}$/.test(trimmed)) return trimmed;
  const found = INDIAN_STATES.find(s =>
    s.name.toLowerCase() === trimmed.toLowerCase() ||
    s.code === trimmed
  );
  return found?.code ?? null;
}

const fmt = v => (v != null && !isNaN(v) ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');

/**
 * TaxSummarySection — Section 3 of the invoice form.
 *
 * Renders tax fields (IGST/CGST/SGST), computed totals, TDS, and a
 * PDF-vs-computed reconciliation banner.
 */
export default function TaxSummarySection({
  lineItems,
  extractResult,
  header,
  onHeaderChange,
  headerOverrides,
  tds,
  onTdsChange,
  reconciliationAck,
  onReconciliationAck,
  isCollapsed,
  onToggle,
}) {
  // ── Computed values ─────────────────────────────────────────────────────────
  const computedTaxableValue = lineItems.reduce((sum, item) => {
    return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_rate) || 0);
  }, 0);

  const igstAmt  = parseFloat(header.igst_amount)  || 0;
  const cgstAmt  = parseFloat(header.cgst_amount)  || 0;
  const sgstAmt  = parseFloat(header.sgst_amount)  || 0;
  const computedTotalTax    = igstAmt + cgstAmt + sgstAmt;
  const grossInvoiceValue   = computedTaxableValue + computedTotalTax;
  const netPayable          = grossInvoiceValue - (parseFloat(tds) || 0);

  const pdfTotal = extractResult?.header?.total_amount?.value ?? null;
  const delta    = pdfTotal != null ? Math.abs(pdfTotal - grossInvoiceValue) : null;

  let reconciliationStatus = null;
  if (delta != null) {
    reconciliationStatus = delta < 0.5 ? 'green' : delta <= 10 ? 'amber' : 'red';
  }

  // ── Tax regime (intra vs inter state) ───────────────────────────────────────
  const sellerCode = header.seller_gstin?.trim().slice(0, 2) || null;
  const supplyCode = getStateCode(header.place_of_supply);
  const isIntrastate = sellerCode && supplyCode && sellerCode === supplyCode;

  // Confidence helpers
  const conf = field => extractResult?.header?.[field]?.confidence ?? null;
  const isOverridden = field => headerOverrides?.has(field);

  const taxFieldClass = 'input border-0 focus:ring-0 bg-transparent text-sm';

  return (
    <div className="border-b border-gray-100 dark:border-gray-700">
      {/* Section header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
      >
        <span>3 — Tax Summary</span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
      </button>

      {!isCollapsed && (
        <div className="px-4 pb-5 space-y-3">
          {/* Taxable Value (computed, read-only) */}
          <div className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm text-gray-500 dark:text-gray-400">Taxable Value</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              ₹ {fmt(computedTaxableValue)}
            </span>
          </div>

          {/* IGST (always shown for interstate; optionally shown for intrastate if amount set) */}
          {(!isIntrastate || igstAmt > 0) && (
            <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
              <ConfidenceField
                label="IGST Amount"
                confidence={conf('igst_amount')}
                manuallyEdited={isOverridden('igst_amount')}
              >
                <input
                  type="number"
                  className={taxFieldClass}
                  placeholder="0.00"
                  value={header.igst_amount}
                  onChange={e => onHeaderChange({ igst_amount: e.target.value })}
                />
              </ConfidenceField>
              <ConfidenceField
                label="@ Rate %"
                confidence={conf('igst_rate')}
                manuallyEdited={isOverridden('igst_rate')}
              >
                <input
                  type="number"
                  className={taxFieldClass + ' w-20'}
                  placeholder="18"
                  value={header.igst_rate}
                  onChange={e => onHeaderChange({ igst_rate: e.target.value })}
                />
              </ConfidenceField>
            </div>
          )}

          {/* CGST (intrastate only) */}
          {(isIntrastate || cgstAmt > 0) && (
            <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
              <ConfidenceField
                label="CGST Amount"
                confidence={conf('cgst_amount')}
                manuallyEdited={isOverridden('cgst_amount')}
              >
                <input
                  type="number"
                  className={taxFieldClass}
                  placeholder="0.00"
                  value={header.cgst_amount}
                  onChange={e => onHeaderChange({ cgst_amount: e.target.value })}
                />
              </ConfidenceField>
              <ConfidenceField
                label="@ Rate %"
                confidence={conf('cgst_rate')}
                manuallyEdited={isOverridden('cgst_rate')}
              >
                <input
                  type="number"
                  className={taxFieldClass + ' w-20'}
                  placeholder="9"
                  value={header.cgst_rate}
                  onChange={e => onHeaderChange({ cgst_rate: e.target.value })}
                />
              </ConfidenceField>
            </div>
          )}

          {/* SGST (intrastate only) */}
          {(isIntrastate || sgstAmt > 0) && (
            <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
              <ConfidenceField
                label="SGST Amount"
                confidence={conf('sgst_amount')}
                manuallyEdited={isOverridden('sgst_amount')}
              >
                <input
                  type="number"
                  className={taxFieldClass}
                  placeholder="0.00"
                  value={header.sgst_amount}
                  onChange={e => onHeaderChange({ sgst_amount: e.target.value })}
                />
              </ConfidenceField>
              <ConfidenceField
                label="@ Rate %"
                confidence={conf('sgst_rate')}
                manuallyEdited={isOverridden('sgst_rate')}
              >
                <input
                  type="number"
                  className={taxFieldClass + ' w-20'}
                  placeholder="9"
                  value={header.sgst_rate}
                  onChange={e => onHeaderChange({ sgst_rate: e.target.value })}
                />
              </ConfidenceField>
            </div>
          )}

          {/* Total Tax */}
          <div className="flex items-center justify-between py-1.5 border-t border-gray-100 dark:border-gray-700">
            <span className="text-sm text-gray-500 dark:text-gray-400">Total Tax</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">₹ {fmt(computedTotalTax)}</span>
          </div>

          {/* Gross Invoice Value */}
          <div className="flex items-center justify-between py-1.5 border-t-2 border-gray-200 dark:border-gray-600">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Gross Invoice Value</span>
            <span className="text-base font-bold text-gray-900 dark:text-gray-100">₹ {fmt(grossInvoiceValue)}</span>
          </div>

          {/* TDS */}
          <div>
            <label className="label">TDS (if applicable)</label>
            <input
              type="number"
              className="input"
              placeholder="0.00"
              value={tds}
              onChange={e => onTdsChange(e.target.value)}
            />
          </div>

          {/* Net Payable */}
          <div className="flex items-center justify-between py-1.5 border-t border-gray-100 dark:border-gray-700">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Net Payable</span>
            <span className="text-base font-bold text-brand-700 dark:text-brand-400">₹ {fmt(netPayable)}</span>
          </div>

          {/* Reconciliation banner */}
          {reconciliationStatus && (
            <div className={`rounded-lg border p-3 text-xs ${
              reconciliationStatus === 'green'
                ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400'
                : reconciliationStatus === 'amber'
                ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400'
                : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  {reconciliationStatus === 'green' && <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                  {reconciliationStatus === 'amber' && <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                  {reconciliationStatus === 'red'   && <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                  <div>
                    {reconciliationStatus === 'green' && (
                      <p>PDF Total (₹ {fmt(pdfTotal)}) matches computed total ✓</p>
                    )}
                    {reconciliationStatus === 'amber' && (
                      <p>Rounding difference ±₹{delta?.toFixed(2)} — computed ₹{fmt(grossInvoiceValue)} vs PDF ₹{fmt(pdfTotal)}</p>
                    )}
                    {reconciliationStatus === 'red' && (
                      <p>Mismatch: PDF ₹{fmt(pdfTotal)} vs Computed ₹{fmt(grossInvoiceValue)} — please verify line items and tax amounts</p>
                    )}
                  </div>
                </div>
                {reconciliationStatus === 'amber' && !reconciliationAck && (
                  <label className="flex items-center gap-1.5 cursor-pointer whitespace-nowrap font-medium">
                    <input
                      type="checkbox"
                      className="rounded border-amber-400 text-amber-600"
                      checked={reconciliationAck}
                      onChange={e => onReconciliationAck(e.target.checked)}
                    />
                    Acknowledge
                  </label>
                )}
                {reconciliationStatus === 'amber' && reconciliationAck && (
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium whitespace-nowrap">
                    <CheckCircle className="h-3.5 w-3.5" /> Acknowledged
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
