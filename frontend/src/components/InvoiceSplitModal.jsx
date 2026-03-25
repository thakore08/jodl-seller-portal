import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Send, AlertTriangle, CheckCircle, XCircle, ChevronLeft, Loader2 } from 'lucide-react';
import api from '../services/api';
import PDFViewerPane from './invoice/PDFViewerPane';
import InvoiceFormPane from './invoice/InvoiceFormPane';

// ── Default empty header ──────────────────────────────────────────────────────
const EMPTY_HEADER = {
  invoice_number:  '',
  invoice_date:    '',
  due_date:        '',
  seller_name:     '',
  seller_gstin:    '',
  buyer_name:      '',
  buyer_gstin:     '',
  place_of_supply: '',
  payment_terms:   '',
  taxable_value:   '',
  igst_amount:     '',
  igst_rate:       '',
  cgst_amount:     '',
  cgst_rate:       '',
  sgst_amount:     '',
  sgst_rate:       '',
  total_amount:    '',
};

function makeEmptyLineItem() {
  return {
    raw_description: '',
    hsn_code:        '',
    quantity:        '',
    unit:            '',
    unit_rate:       '',
    gst_rate:        '',
    parsed:          null,
    _invIdx:         null,
  };
}

function sanitizeHeaderDraft(draftHeader = {}) {
  const rawInvoiceNumber = String(draftHeader.invoice_number || '').trim();
  const isLegacyAutoInvoiceNumber = /^INV-\d{10,}$/.test(rawInvoiceNumber);
  return {
    ...EMPTY_HEADER,
    ...draftHeader,
    invoice_number: isLegacyAutoInvoiceNumber ? '' : rawInvoiceNumber,
    invoice_date: draftHeader.invoice_date || '',
  };
}

// ── Overall confidence summary badge ─────────────────────────────────────────
function ConfidenceSummaryBadge({ log }) {
  if (!log) return null;
  const { high = 0, medium = 0, low = 0 } = log.header_confidence_summary || {};
  const total = high + medium + low;
  if (total === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
      {high}/{total} fields auto-filled
      {medium > 0 && <span className="text-amber-500"> · {medium} to verify</span>}
      {low > 0    && <span className="text-red-500">   · {low} missing</span>}
    </span>
  );
}

/**
 * InvoiceSplitModal
 *
 * Full-screen (95vw × 95vh) split-screen modal for invoice upload.
 * Left pane: PDF viewer — Right pane: extracted data form.
 *
 * Props:
 *   open      boolean          — controls visibility
 *   po        object           — full PO object
 *   onClose   () => void       — close handler
 *   onSuccess () => void       — called after successful invoice submission
 */
export default function InvoiceSplitModal({ open, po, onClose, onSuccess, title = 'Invoice Upload' }) {
  // ── Phase ────────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState('UPLOAD');
  // UPLOAD | EXTRACTING | FORM | CONFIRMING | SUBMITTING

  // ── Upload / extract ─────────────────────────────────────────────────────────
  const [uploadFile,    setUploadFile]    = useState(null);
  const [extractResult, setExtractResult] = useState(null); // raw API response
  const [extractError,  setExtractError]  = useState('');

  // ── Header form state (plain strings) ────────────────────────────────────────
  const [header,         setHeader]         = useState({ ...EMPTY_HEADER });
  const [headerOverrides, setHeaderOverrides] = useState(new Set()); // manually edited fields

  // ── Line items ────────────────────────────────────────────────────────────────
  const [lineItems,    setLineItems]    = useState([makeEmptyLineItem()]);
  const [matchResults, setMatchResults] = useState([]);

  // ── Tax ───────────────────────────────────────────────────────────────────────
  const [tds,               setTds]               = useState('');
  const [reconciliationAck, setReconciliationAck] = useState(false);

  // ── PDF sync ─────────────────────────────────────────────────────────────────
  const [activeSearchTerm, setActiveSearchTerm] = useState('');

  // ── Dirty + draft ────────────────────────────────────────────────────────────
  const [isDirty,            setIsDirty]            = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [draftRestorePrompt, setDraftRestorePrompt] = useState(false);

  // ── Section collapse ─────────────────────────────────────────────────────────
  const [collapsedSections, setCollapsedSections] = useState({
    header: false, lineItems: false, tax: false, bank: true,
  });

  // ── Mobile tab ───────────────────────────────────────────────────────────────
  const [mobileTab, setMobileTab] = useState('form');

  // ── Submit error ─────────────────────────────────────────────────────────────
  const [submitError, setSubmitError] = useState('');

  // Auto-save timer ref
  const autoSaveTimer = useRef(null);

  // ── On open: reset state, check for saved draft ──────────────────────────────
  useEffect(() => {
    if (!open) return;
    // Reset all state when modal opens
    setPhase('UPLOAD');
    setUploadFile(null);
    setExtractResult(null);
    setExtractError('');
    setHeader({ ...EMPTY_HEADER });
    setHeaderOverrides(new Set());
    setLineItems([makeEmptyLineItem()]);
    setMatchResults([]);
    setTds('');
    setReconciliationAck(false);
    setActiveSearchTerm('');
    setIsDirty(false);
    setShowUnsavedWarning(false);
    setSubmitError('');
    setMobileTab('form');
    setCollapsedSections({ header: false, lineItems: false, tax: false, bank: true });

    // Check for a saved draft
    if (po?.purchaseorder_id) {
      try {
        const saved = localStorage.getItem(`invoice_draft_${po.purchaseorder_id}`);
        if (saved) setDraftRestorePrompt(true);
      } catch { /* ignore */ }
    }
  }, [open, po?.purchaseorder_id]);

  // ── Auto-save (debounced 30s) ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isDirty || !po?.purchaseorder_id) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(
          `invoice_draft_${po.purchaseorder_id}`,
          JSON.stringify({ header, lineItems, matchResults, tds })
        );
      } catch { /* ignore */ }
    }, 30000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [header, lineItems, matchResults, tds, isDirty, po?.purchaseorder_id]);

  // ── Escape key ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, isDirty]);

  // ── initFromExtractResult ────────────────────────────────────────────────────
  const initFromExtractResult = useCallback((data) => {
    const h = data.header || {};
    setHeader({
      invoice_number:  h.invoice_number?.value  ?? '',
      invoice_date:    h.invoice_date?.value     ?? '',
      due_date:        h.due_date?.value         ?? '',
      seller_name:     h.seller_name?.value      ?? '',
      seller_gstin:    h.seller_gstin?.value     ?? '',
      buyer_name:      h.buyer_name?.value       ?? '',
      buyer_gstin:     h.buyer_gstin?.value      ?? '',
      place_of_supply: h.place_of_supply?.value  ?? '',
      payment_terms:   h.payment_terms?.value    ?? '',
      taxable_value:   h.taxable_value?.value    != null ? String(h.taxable_value.value)   : '',
      igst_amount:     h.igst_amount?.value      != null ? String(h.igst_amount.value)     : '',
      igst_rate:       h.igst_rate?.value        != null ? String(h.igst_rate.value)       : '',
      cgst_amount:     h.cgst_amount?.value      != null ? String(h.cgst_amount.value)     : '',
      cgst_rate:       h.cgst_rate?.value        != null ? String(h.cgst_rate.value)       : '',
      sgst_amount:     h.sgst_amount?.value      != null ? String(h.sgst_amount.value)     : '',
      sgst_rate:       h.sgst_rate?.value        != null ? String(h.sgst_rate.value)       : '',
      total_amount:    h.total_amount?.value     != null ? String(h.total_amount.value)    : '',
    });
    setHeaderOverrides(new Set());

    setLineItems((data.line_items || []).map((item, idx) => ({
      raw_description: item.raw_description || '',
      hsn_code:        item.hsn_code?.value  ?? '',
      quantity:        item.quantity?.value  != null ? String(item.quantity.value) : '',
      unit:            item.unit?.value      ?? '',
      unit_rate:       item.unit_rate?.value != null ? String(item.unit_rate.value) : '',
      gst_rate:        item.gst_percent?.value != null ? String(item.gst_percent.value) : '',
      parsed:          item.parsed || null,
      _invIdx:         idx,
    })));

    setMatchResults(data.match_results || []);
  }, []);

  // ── Extract handler ───────────────────────────────────────────────────────────
  const handleExtract = useCallback(async (skipExtract = false) => {
    if (skipExtract) {
      // "Enter manually" path
      setExtractResult(null);
      setExtractError('');
      setLineItems((po?.line_items || []).map(i => ({
        raw_description: i.name || i.description || '',
        hsn_code:        '',
        quantity:        String(i.quantity || ''),
        unit:            i.unit || '',
        unit_rate:       String(i.rate || ''),
        gst_rate:        '',
        parsed:          null,
        _invIdx:         null,
      })));
      setMatchResults([]);
      setHeader(prev => ({
        ...EMPTY_HEADER,
      }));
      setPhase('FORM');
      return;
    }

    if (!uploadFile) return;
    setExtractError('');
    setPhase('EXTRACTING');

    const fd = new FormData();
    fd.append('file', uploadFile);
    fd.append('purchaseorder_id', po.purchaseorder_id);

    try {
      const { data } = await api.post('/invoices/extract', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Debug: log raw extracted text + header results to console (dev only)
      if (data.raw_text) console.log('[Invoice OCR] raw_text:\n', data.raw_text);
      console.log('[Invoice OCR] header:', data.header, '| log:', data.extraction_log);

      setExtractResult(data);

      if (data.is_scanned) {
        setExtractError('Scanned PDF detected — some fields may not have been auto-filled. Please verify and complete the form manually.');
      }

      initFromExtractResult(data);
      setPhase('FORM');
    } catch (err) {
      setExtractResult(null);
      setExtractError('Could not extract invoice data — please fill the form manually.');
      // Still transition to FORM with blank state so user can enter manually
      setLineItems((po?.line_items || []).map(i => ({
        raw_description: i.name || i.description || '',
        hsn_code:        '',
        quantity:        String(i.quantity || ''),
        unit:            i.unit || '',
        unit_rate:       String(i.rate || ''),
        gst_rate:        '',
        parsed:          null,
        _invIdx:         null,
      })));
      setMatchResults([]);
      setPhase('FORM');
    }
  }, [uploadFile, po, initFromExtractResult]);

  // ── Header change (marks dirty + tracks overrides) ───────────────────────────
  const handleHeaderChange = useCallback((patch) => {
    setHeader(prev => ({ ...prev, ...patch }));
    setHeaderOverrides(prev => {
      const next = new Set(prev);
      Object.keys(patch).forEach(k => next.add(k));
      return next;
    });
    setIsDirty(true);
  }, []);

  // ── Line item handlers ────────────────────────────────────────────────────────
  const handleLineItemChange = useCallback((idx, patch) => {
    setLineItems(prev => {
      const items = [...prev];
      items[idx] = { ...items[idx], ...patch };
      return items;
    });
    setIsDirty(true);
  }, []);

  const handleLineItemAdd = useCallback(() => {
    setLineItems(prev => [...prev, makeEmptyLineItem()]);
    setIsDirty(true);
  }, []);

  const handleLineItemDelete = useCallback((idx) => {
    setLineItems(prev => prev.filter((_, i) => i !== idx));
    setMatchResults(prev => prev.filter((_, i) => i !== idx));
    setIsDirty(true);
  }, []);

  const handleLineItemMove = useCallback((idx, direction) => {
    setLineItems(prev => {
      const items = [...prev];
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= items.length) return prev;
      [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
      return items;
    });
    setMatchResults(prev => {
      const results = [...prev];
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= results.length) return prev;
      [results[idx], results[newIdx]] = [results[newIdx], results[idx]];
      return results;
    });
  }, []);

  const handleMatchUpdate = useCallback((invIdx, patch) => {
    setMatchResults(prev => prev.map((r, i) => i === invIdx ? { ...r, ...patch } : r));
    setIsDirty(true);
  }, []);

  // ── Section toggle ────────────────────────────────────────────────────────────
  const handleToggleSection = useCallback((key) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // ── Close handler ─────────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowUnsavedWarning(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const confirmClose = useCallback(() => {
    if (po?.purchaseorder_id) {
      try { localStorage.removeItem(`invoice_draft_${po.purchaseorder_id}`); } catch { /* ignore */ }
    }
    setShowUnsavedWarning(false);
    setIsDirty(false);
    onClose();
  }, [po, onClose]);

  // ── Draft restore ─────────────────────────────────────────────────────────────
  const restoreDraft = useCallback(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`invoice_draft_${po.purchaseorder_id}`));
      if (saved) {
        if (saved.header)      setHeader(sanitizeHeaderDraft(saved.header));
        if (saved.lineItems)   setLineItems(saved.lineItems);
        if (saved.matchResults) setMatchResults(saved.matchResults);
        if (saved.tds)         setTds(saved.tds);
        setPhase('FORM');
      }
    } catch { /* ignore */ }
    setDraftRestorePrompt(false);
  }, [po]);

  // ── Validation ────────────────────────────────────────────────────────────────
  const validateForm = useCallback(() => {
    const errors = [];
    if (!header.invoice_number?.trim()) errors.push('Invoice Number is required');
    if (!header.invoice_date?.trim())   errors.push('Invoice Date is required');

    matchResults.forEach((r, i) => {
      if (r.match_type === 'no_match' && r.manual_mapping_po_index == null) {
        errors.push(`Line item ${i + 1}: select a PO item to map`);
      }
      if (r.match_type === 'partial_match' && !r.confirmed) {
        errors.push(`Line item ${i + 1}: confirm the partial match`);
      }
      if (r.warnings?.length > 0 && !r.acknowledged) {
        errors.push(`Line item ${i + 1}: acknowledge the rate/qty warning`);
      }
    });

    // Reconciliation check
    const pdfTotal = extractResult?.header?.total_amount?.value;
    if (pdfTotal != null) {
      const igst = parseFloat(header.igst_amount) || 0;
      const cgst = parseFloat(header.cgst_amount) || 0;
      const sgst = parseFloat(header.sgst_amount) || 0;
      const taxable = lineItems.reduce((s, i) =>
        s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_rate) || 0), 0);
      const computed = taxable + igst + cgst + sgst;
      const delta = Math.abs(pdfTotal - computed);
      if (delta > 10 && !reconciliationAck) {
        errors.push('Reconciliation mismatch > ₹10 — please verify tax amounts');
      }
      if (delta > 0.5 && delta <= 10 && !reconciliationAck) {
        errors.push('Acknowledge the rounding difference before submitting');
      }
    }

    return errors;
  }, [header, matchResults, lineItems, extractResult, reconciliationAck]);

  // ── Build tax lines for submit ────────────────────────────────────────────────
  const buildTaxLines = useCallback(() => {
    const lines = [];
    if (parseFloat(header.igst_amount) > 0) {
      lines.push({ tax_name: 'IGST', tax_percentage: parseFloat(header.igst_rate) || 0, tax_amount: parseFloat(header.igst_amount) });
    }
    if (parseFloat(header.cgst_amount) > 0) {
      lines.push({ tax_name: 'CGST', tax_percentage: parseFloat(header.cgst_rate) || 0, tax_amount: parseFloat(header.cgst_amount) });
    }
    if (parseFloat(header.sgst_amount) > 0) {
      lines.push({ tax_name: 'SGST', tax_percentage: parseFloat(header.sgst_rate) || 0, tax_amount: parseFloat(header.sgst_amount) });
    }
    return lines;
  }, [header]);

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setSubmitError('');
    setPhase('SUBMITTING');

    // Build final line items: use matched PO items if available
    const finalLineItems = lineItems.map((item, idx) => {
      const matchResult = matchResults[idx];
      const poIdx = matchResult?.manual_mapping_po_index ?? matchResult?.po_item_index ?? null;
      const poItem = poIdx != null ? (po?.line_items || [])[poIdx] : null;
      return {
        item_id:     poItem?.item_id     || '',
        name:        poItem?.name        || item.raw_description || '',
        description: poItem?.description || item.raw_description || '',
        rate:        parseFloat(item.unit_rate) || poItem?.rate || 0,
        quantity:    parseFloat(item.quantity)  || poItem?.quantity || 0,
        account_id:  poItem?.account_id  || '',
      };
    });

    const formData = new FormData();
    formData.append('purchaseorder_id', po.purchaseorder_id);
    formData.append('bill_number',      header.invoice_number || '');
    formData.append('date',             header.invoice_date || '');
    formData.append('due_date',         header.due_date || '');
    formData.append('notes',            '');
    formData.append('line_items',       JSON.stringify(finalLineItems));
    formData.append('tax_lines',        JSON.stringify(buildTaxLines()));
    if (uploadFile) formData.append('file', uploadFile);

    try {
      await api.post('/invoices', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // Clear draft
      if (po?.purchaseorder_id) {
        try { localStorage.removeItem(`invoice_draft_${po.purchaseorder_id}`); } catch { /* ignore */ }
      }
      onSuccess();
    } catch (err) {
      setSubmitError(err.response?.data?.message || 'Failed to post invoice. Please try again.');
      setPhase('CONFIRMING');
    }
  }, [lineItems, matchResults, po, header, uploadFile, buildTaxLines, onSuccess]);

  // ── canSubmit ─────────────────────────────────────────────────────────────────
  const validationErrors = phase === 'FORM' ? validateForm() : [];
  const canProceed = validationErrors.length === 0 && phase === 'FORM';

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal panel */}
      <div
        className="relative flex flex-col rounded-xl bg-white dark:bg-gray-800 shadow-2xl overflow-hidden"
        style={{ width: '95vw', height: '95vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Fixed Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 shrink-0">{title}</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">— {po?.purchaseorder_number}</span>
            {extractResult?.extraction_log && (
              <ConfidenceSummaryBadge log={extractResult.extraction_log} />
            )}
            {po?.status === 'billed' && (
              <span className="flex items-center gap-1 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Invoice already exists — submitting will create a duplicate
              </span>
            )}
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300 transition-colors shrink-0 ml-2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Mobile tab switcher (hidden on lg+) ──────────────────────────────── */}
        <div className="flex lg:hidden border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
          {['pdf', 'form'].map(tab => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors capitalize ${
                mobileTab === tab
                  ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {tab === 'pdf' ? 'PDF' : 'Form'}
            </button>
          ))}
        </div>

        {/* ── Body: split panes ─────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left pane — PDF viewer */}
          <div className={`
            flex-col overflow-hidden border-r border-gray-200 dark:border-gray-700
            ${mobileTab === 'pdf' ? 'flex w-full' : 'hidden'}
            lg:flex lg:w-[45%]
          `}>
            <PDFViewerPane
              file={uploadFile}
              activeSearchTerm={activeSearchTerm}
              isScanned={extractResult?.is_scanned}
            />
          </div>

          {/* Right pane — form */}
          <div className={`
            flex-col overflow-y-auto
            ${mobileTab === 'form' ? 'flex w-full' : 'hidden'}
            lg:flex lg:w-[55%]
          `}>
            <InvoiceFormPane
              phase={phase}
              uploadFile={uploadFile}
              onFileChange={setUploadFile}
              onExtract={handleExtract}
              extractError={extractError}
              po={po}
              extractResult={extractResult}
              header={header}
              onHeaderChange={handleHeaderChange}
              headerOverrides={headerOverrides}
              lineItems={lineItems}
              onLineItemChange={handleLineItemChange}
              onLineItemAdd={handleLineItemAdd}
              onLineItemDelete={handleLineItemDelete}
              onLineItemMove={handleLineItemMove}
              matchResults={matchResults}
              onMatchUpdate={handleMatchUpdate}
              tds={tds}
              onTdsChange={setTds}
              reconciliationAck={reconciliationAck}
              onReconciliationAck={setReconciliationAck}
              onFieldFocus={val => { if (val) setActiveSearchTerm(String(val)); }}
              collapsedSections={collapsedSections}
              onToggleSection={handleToggleSection}
            />
          </div>
        </div>

        {/* ── Validation errors bar (above footer when in FORM phase) ─────────── */}
        {phase === 'FORM' && validationErrors.length > 0 && (
          <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800 shrink-0">
            <p className="text-xs text-red-700 dark:text-red-400 font-medium">
              {validationErrors.length} issue{validationErrors.length > 1 ? 's' : ''} to fix:
              {' '}{validationErrors[0]}{validationErrors.length > 1 ? ` + ${validationErrors.length - 1} more` : ''}
            </p>
          </div>
        )}

        {/* ── Submit error bar ─────────────────────────────────────────────────── */}
        {submitError && (
          <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800 shrink-0 text-xs text-red-700 dark:text-red-400">
            {submitError}
          </div>
        )}

        {/* ── Fixed Footer ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0 gap-3">
          <button type="button" onClick={handleClose} className="btn-outline">
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {/* Save Draft — disabled (no draft API) */}
            <button
              type="button"
              disabled
              title="Draft saving not yet available"
              className="btn-outline opacity-40 cursor-not-allowed hidden sm:inline-flex"
            >
              Save Draft
            </button>

            {/* Submit Invoice */}
            {phase === 'FORM' && (
              <button
                type="button"
                onClick={() => setPhase('CONFIRMING')}
                disabled={!canProceed}
                className="btn-primary"
              >
                <Send className="h-4 w-4" /> Review & Submit
              </button>
            )}
            {phase === 'UPLOAD' && (
              <span className="text-xs text-gray-400 dark:text-gray-500">Upload a PDF to continue</span>
            )}
            {phase === 'EXTRACTING' && (
              <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting…
              </span>
            )}
          </div>
        </div>

        {/* ── Confirmation overlay ─────────────────────────────────────────────── */}
        {phase === 'CONFIRMING' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 dark:bg-black/40">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-md mx-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Confirm Invoice Submission
              </h3>

              <div className="space-y-3 mb-5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Invoice Number</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{header.invoice_number || '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Invoice Date</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{header.invoice_date || '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">PO Reference</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{po?.purchaseorder_number}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Line Items</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{lineItems.length}</span>
                </div>
                <div className="flex justify-between text-sm border-t dark:border-gray-700 pt-2">
                  <span className="text-gray-500 dark:text-gray-400">IGST</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    ₹ {Number(parseFloat(header.igst_amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">CGST + SGST</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    ₹ {Number((parseFloat(header.cgst_amount) || 0) + (parseFloat(header.sgst_amount) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between text-sm border-t dark:border-gray-700 pt-2">
                  <span className="font-semibold text-gray-700 dark:text-gray-200">Grand Total</span>
                  <span className="font-bold text-brand-700 dark:text-brand-400 text-base">
                    ₹ {Number(
                      lineItems.reduce((s, i) => s + (parseFloat(i.quantity)||0)*(parseFloat(i.unit_rate)||0), 0) +
                      (parseFloat(header.igst_amount)||0) + (parseFloat(header.cgst_amount)||0) + (parseFloat(header.sgst_amount)||0)
                    ).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {submitError && (
                <p className="mb-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                  {submitError}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPhase('FORM')}
                  className="btn-outline flex-1"
                  disabled={phase === 'SUBMITTING'}
                >
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={phase === 'SUBMITTING'}
                  className="btn-primary flex-1"
                >
                  {phase === 'SUBMITTING' ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
                  ) : (
                    <><CheckCircle className="h-4 w-4" /> Confirm & Submit</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Unsaved changes warning ──────────────────────────────────────────── */}
        {showUnsavedWarning && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-sm mx-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Unsaved Changes
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                You have unsaved changes. Closing will discard any data you've entered.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowUnsavedWarning(false)}
                  className="btn-outline flex-1"
                >
                  Keep Editing
                </button>
                <button
                  type="button"
                  onClick={confirmClose}
                  className="btn-danger flex-1"
                >
                  Discard & Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Draft restore prompt ─────────────────────────────────────────────── */}
        {draftRestorePrompt && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-sm mx-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Resume Saved Draft?
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                A saved draft was found for PO {po?.purchaseorder_number}. Would you like to restore it?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDraftRestorePrompt(false)}
                  className="btn-outline flex-1"
                >
                  Start Fresh
                </button>
                <button
                  type="button"
                  onClick={restoreDraft}
                  className="btn-primary flex-1"
                >
                  Restore Draft
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
