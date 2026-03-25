import React, { useRef } from 'react';
import { ChevronDown, Upload, Loader2, Link as LinkIcon } from 'lucide-react';
import ConfidenceField from './ConfidenceField';
import LineItemsSection from './LineItemsSection';
import TaxSummarySection, { INDIAN_STATES } from './TaxSummarySection';

/**
 * InvoiceFormPane
 *
 * Right pane of the split-screen invoice modal.
 * Renders:
 *   - Confidence legend (sticky top)
 *   - Upload zone (phase=UPLOAD|EXTRACTING)
 *   - 4 collapsible sections (phase=FORM):
 *       1. Invoice Header
 *       2. Line Items (via LineItemsSection)
 *       3. Tax Summary (via TaxSummarySection)
 *       4. Bank Details (read-only placeholder)
 */
export default function InvoiceFormPane({
  // Phase control
  phase,
  uploadFile,
  onFileChange,
  onExtract,
  extractError,

  // PO data
  po,

  // Extraction result (raw)
  extractResult,

  // Header form state
  header,
  onHeaderChange,
  headerOverrides,

  // Line items state
  lineItems,
  onLineItemChange,
  onLineItemAdd,
  onLineItemDelete,
  onLineItemMove,

  // Match results
  matchResults,
  onMatchUpdate,

  // Tax
  tds,
  onTdsChange,
  reconciliationAck,
  onReconciliationAck,

  // PDF sync
  onFieldFocus,

  // Section collapse
  collapsedSections,
  onToggleSection,
}) {
  const paneRef = useRef(null);

  // ── Jump to issues ──────────────────────────────────────────────────────────
  const jumpToIssues = () => {
    const el = paneRef.current?.querySelector('[data-confidence-issue="true"]');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.querySelector('input,select')?.focus();
    }
  };

  // ── Confidence helpers ──────────────────────────────────────────────────────
  const conf = field => extractResult?.header?.[field]?.confidence ?? null;
  const isOverridden = field => headerOverrides?.has(field);

  const fieldCls = 'input border-0 focus:ring-0 bg-transparent';

  return (
    <div ref={paneRef} className="flex flex-col min-h-full">

      {/* ── Confidence Legend (sticky top) ────────────────────────────────────── */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 text-xs text-gray-500 dark:text-gray-400 shrink-0">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" /> Auto-filled
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" /> Verify
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" /> Manual entry
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-gray-400 shrink-0" /> Edited
        </span>
        <button
          type="button"
          onClick={jumpToIssues}
          className="ml-auto text-xs text-brand-600 dark:text-brand-400 hover:underline whitespace-nowrap"
        >
          Jump to issues →
        </button>
      </div>

      {/* ── UPLOAD / EXTRACTING phase ─────────────────────────────────────────── */}
      {(phase === 'UPLOAD' || phase === 'EXTRACTING') && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          {extractError && (
            <div className="w-full max-w-sm rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-700 dark:text-amber-400 text-center">
              {extractError}
            </div>
          )}

          {phase === 'EXTRACTING' ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-brand-600 dark:text-brand-400" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Reading invoice PDF…</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Extracting fields and matching line items</p>
            </div>
          ) : (
            <>
              <label className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-600 p-8 cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 dark:hover:border-brand-500 dark:hover:bg-brand-900/10 transition-colors w-full max-w-sm">
                <Upload className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {uploadFile ? uploadFile.name : 'Choose invoice PDF'}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">PDF only · max 10 MB</p>
                </div>
                <input
                  type="file"
                  accept=".pdf"
                  className="sr-only"
                  onChange={e => onFileChange(e.target.files[0] || null)}
                />
              </label>

              <button
                type="button"
                onClick={onExtract}
                disabled={!uploadFile}
                className="btn-primary w-full max-w-sm"
              >
                <Upload className="h-4 w-4" /> Extract Invoice Data
              </button>

              <button
                type="button"
                onClick={() => onExtract(true)} // true = skip extract, go to manual form
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400"
              >
                Skip — enter manually instead
              </button>
            </>
          )}
        </div>
      )}

      {/* ── FORM / CONFIRMING / SUBMITTING phase: 4 sections ─────────────────── */}
      {(phase === 'FORM' || phase === 'CONFIRMING' || phase === 'SUBMITTING') && (
        <>
          {/* Section 1 — Invoice Header */}
          <div className="border-b border-gray-100 dark:border-gray-700">
            <button
              type="button"
              onClick={() => onToggleSection('header')}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
            >
              <span>1 — Invoice Header</span>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${collapsedSections.header ? '-rotate-90' : ''}`} />
            </button>

            {!collapsedSections.header && (
              <div className="px-4 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* Invoice Number */}
                <ConfidenceField
                  label="Invoice Number"
                  required
                  confidence={conf('invoice_number')}
                  manuallyEdited={isOverridden('invoice_number')}
                  onFocus={() => onFieldFocus && onFieldFocus(extractResult?.header?.invoice_number?.value)}
                >
                  <input
                    className={fieldCls}
                    placeholder="INV-2024-001"
                    value={header.invoice_number}
                    onChange={e => onHeaderChange({ invoice_number: e.target.value })}
                  />
                </ConfidenceField>

                {/* Invoice Date */}
                <ConfidenceField
                  label="Invoice Date"
                  required
                  confidence={conf('invoice_date')}
                  manuallyEdited={isOverridden('invoice_date')}
                  onFocus={() => onFieldFocus && onFieldFocus(extractResult?.header?.invoice_date?.value)}
                >
                  <input
                    type="date"
                    className={fieldCls}
                    value={header.invoice_date}
                    onChange={e => onHeaderChange({ invoice_date: e.target.value })}
                  />
                </ConfidenceField>

                {/* Due Date */}
                <ConfidenceField
                  label="Due Date"
                  confidence={conf('due_date')}
                  manuallyEdited={isOverridden('due_date')}
                  onFocus={() => onFieldFocus && onFieldFocus(extractResult?.header?.due_date?.value)}
                >
                  <input
                    type="date"
                    className={fieldCls}
                    value={header.due_date}
                    onChange={e => onHeaderChange({ due_date: e.target.value })}
                  />
                </ConfidenceField>

                {/* PO Reference — read-only */}
                <div>
                  <label className="label">PO Reference</label>
                  <input
                    className="input bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                    value={po?.purchaseorder_number || ''}
                    readOnly
                  />
                </div>

                {/* Seller Name */}
                <ConfidenceField
                  label="Seller Name"
                  confidence={conf('seller_name')}
                  manuallyEdited={isOverridden('seller_name')}
                  onFocus={() => onFieldFocus && onFieldFocus(extractResult?.header?.seller_name?.value)}
                >
                  <input
                    className={fieldCls}
                    placeholder="Your company name"
                    value={header.seller_name}
                    onChange={e => onHeaderChange({ seller_name: e.target.value })}
                  />
                </ConfidenceField>

                {/* Seller GSTIN */}
                <ConfidenceField
                  label="Seller GST Number"
                  confidence={conf('seller_gstin')}
                  manuallyEdited={isOverridden('seller_gstin')}
                  onFocus={() => onFieldFocus && onFieldFocus(extractResult?.header?.seller_gstin?.value)}
                >
                  <input
                    className={fieldCls}
                    placeholder="27AAAAA0000A1Z5"
                    value={header.seller_gstin}
                    onChange={e => onHeaderChange({ seller_gstin: e.target.value })}
                  />
                </ConfidenceField>

                {/* Buyer Name */}
                <ConfidenceField
                  label="Buyer / Bill-To Name"
                  confidence={conf('buyer_name')}
                  manuallyEdited={isOverridden('buyer_name')}
                  onFocus={() => onFieldFocus && onFieldFocus(extractResult?.header?.buyer_name?.value)}
                >
                  <input
                    className={fieldCls}
                    placeholder="Buyer company name"
                    value={header.buyer_name}
                    onChange={e => onHeaderChange({ buyer_name: e.target.value })}
                  />
                </ConfidenceField>

                {/* Buyer GSTIN */}
                <ConfidenceField
                  label="Buyer GST Number"
                  confidence={conf('buyer_gstin')}
                  manuallyEdited={isOverridden('buyer_gstin')}
                  onFocus={() => onFieldFocus && onFieldFocus(extractResult?.header?.buyer_gstin?.value)}
                >
                  <input
                    className={fieldCls}
                    placeholder="29BBBBB1111B1Z1"
                    value={header.buyer_gstin}
                    onChange={e => onHeaderChange({ buyer_gstin: e.target.value })}
                  />
                </ConfidenceField>

                {/* Place of Supply */}
                <ConfidenceField
                  label="Place of Supply"
                  confidence={conf('place_of_supply')}
                  manuallyEdited={isOverridden('place_of_supply')}
                  onFocus={() => onFieldFocus && onFieldFocus(extractResult?.header?.place_of_supply?.value)}
                >
                  <select
                    className={fieldCls}
                    value={header.place_of_supply}
                    onChange={e => onHeaderChange({ place_of_supply: e.target.value })}
                  >
                    <option value="">— Select state —</option>
                    {INDIAN_STATES.map(s => (
                      <option key={s.code} value={s.name}>{s.code} — {s.name}</option>
                    ))}
                  </select>
                </ConfidenceField>

                {/* Payment Terms */}
                <ConfidenceField
                  label="Payment Terms"
                  confidence={conf('payment_terms')}
                  manuallyEdited={isOverridden('payment_terms')}
                  onFocus={() => onFieldFocus && onFieldFocus(extractResult?.header?.payment_terms?.value)}
                >
                  <input
                    className={fieldCls}
                    placeholder="Net 30 days"
                    value={header.payment_terms}
                    onChange={e => onHeaderChange({ payment_terms: e.target.value })}
                  />
                </ConfidenceField>
              </div>
            )}
          </div>

          {/* Section 2 — Line Items */}
          <LineItemsSection
            lineItems={lineItems}
            matchResults={matchResults}
            poLineItems={po?.line_items || []}
            currencyCode={po?.currency_code || 'INR'}
            onLineItemChange={onLineItemChange}
            onLineItemAdd={onLineItemAdd}
            onLineItemDelete={onLineItemDelete}
            onLineItemMove={onLineItemMove}
            onMatchUpdate={onMatchUpdate}
            onFieldFocus={onFieldFocus}
            isCollapsed={collapsedSections.lineItems}
            onToggle={() => onToggleSection('lineItems')}
          />

          {/* Section 3 — Tax Summary */}
          <TaxSummarySection
            lineItems={lineItems}
            extractResult={extractResult}
            header={header}
            onHeaderChange={onHeaderChange}
            headerOverrides={headerOverrides}
            tds={tds}
            onTdsChange={onTdsChange}
            reconciliationAck={reconciliationAck}
            onReconciliationAck={onReconciliationAck}
            isCollapsed={collapsedSections.tax}
            onToggle={() => onToggleSection('tax')}
          />

          {/* Section 4 — Bank Details */}
          <div className="border-b border-gray-100 dark:border-gray-700">
            <button
              type="button"
              onClick={() => onToggleSection('bank')}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
            >
              <span>4 — Bank & Payment Details</span>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${collapsedSections.bank ? '-rotate-90' : ''}`} />
            </button>

            {!collapsedSections.bank && (
              <div className="px-4 pb-5">
                <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 p-4 text-sm text-gray-500 dark:text-gray-400">
                  <p className="flex items-center gap-2">
                    <LinkIcon className="h-4 w-4 shrink-0 text-gray-400" />
                    Bank details not configured. Contact your administrator to set up bank information.
                  </p>
                  <a
                    href="/profile"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    Update bank details in Profile →
                  </a>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
