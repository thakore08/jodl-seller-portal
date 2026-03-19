import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle, XCircle, FileText, Send,
  Calendar, Package, AlertTriangle, Truck, Factory,
  MapPin, User as UserIcon, Upload, Loader2, ChevronLeft,
} from 'lucide-react';
import { format } from 'date-fns';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import POStatusStepper from '../components/POStatusStepper';
import ConfidenceBadge from '../components/ConfidenceBadge';
import LineItemMatchRow from '../components/LineItemMatchRow';
import { useAuth } from '../context/AuthContext';

// ─── Helper: format Zoho address object (or plain string) ────────────────────
function formatAddress(addr) {
  if (!addr) return null;
  if (typeof addr === 'string') return addr.trim() || null;
  // Zoho Books address object: { address, street2, city, state, zip, country, attention, phone }
  const lines = [
    addr.attention,
    addr.address,
    addr.street2,
    [addr.city, addr.state, addr.zip].filter(Boolean).join(', '),
    addr.country,
  ].filter(Boolean);
  return lines.length ? lines.join('\n') : null;
}

// ─── Helper: derive stepper status from PO ───────────────────────────────────
function getEffectiveStatus(po) {
  if (!po) return 'issued';
  if (po.status === 'cancelled') return 'cancelled';
  if (po.status === 'billed')    return 'closed';
  if (po.local_status === 'dispatched')   return 'dispatched';
  if (po.local_status === 'in_production') return 'in_production';
  if (po.status === 'open')      return 'accepted';
  return 'issued'; // draft or anything else
}

// ─── Invoice Creation Form — multi-step state machine ────────────────────────
// Steps: UPLOAD → EXTRACTING → REVIEW → CONFIRMING → SUBMITTING → SUCCESS
//        UPLOAD → (skip) → MANUAL_ENTRY → CONFIRMING → SUBMITTING
function InvoiceForm({ po, onClose, onSuccess }) {

  // ── Step state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState('UPLOAD'); // UPLOAD | EXTRACTING | REVIEW | MANUAL_ENTRY | CONFIRMING | SUBMITTING

  // ── UPLOAD / EXTRACT state ──────────────────────────────────────────────────
  const [uploadFile,    setUploadFile]    = useState(null);
  const [extractResult, setExtractResult] = useState(null);
  const [matchResults,  setMatchResults]  = useState([]);
  const [extractError,  setExtractError]  = useState('');

  // ── Manual / Review form state ──────────────────────────────────────────────
  const initManualForm = () => ({
    bill_number: `INV-${Date.now()}`,
    date:        new Date().toISOString().split('T')[0],
    due_date:    '',
    notes:       '',
    line_items:  (po.line_items || []).map(i => ({
      item_id:     i.item_id,
      name:        i.name,
      description: i.description || '',
      rate:        i.rate,
      quantity:    i.quantity,
      account_id:  i.account_id || '',
    })),
  });

  const [form, setForm] = useState(initManualForm);
  const [taxes, setTaxes] = useState({
    igst_pct: '', igst_amt: '',
    cgst_pct: '', cgst_amt: '',
    sgst_pct: '', sgst_amt: '',
  });
  const [attachFile, setAttachFile] = useState(null);
  const [submitError, setSubmitError] = useState('');

  // ── Review header form (editable extracted fields) ──────────────────────────
  const [reviewHeader, setReviewHeader] = useState(null);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const updateLineItem = (idx, field, value) => {
    setForm(prev => {
      const items = [...prev.line_items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...prev, line_items: items };
    });
  };

  const updateTax = (field, value) => setTaxes(t => ({ ...t, [field]: value }));

  const lineTotal = form.line_items.reduce(
    (sum, i) => sum + (parseFloat(i.rate) || 0) * (parseFloat(i.quantity) || 0), 0
  );
  const totalTax =
    (parseFloat(taxes.igst_amt) || 0) +
    (parseFloat(taxes.cgst_amt) || 0) +
    (parseFloat(taxes.sgst_amt) || 0);

  const buildTaxLines = () => {
    const lines = [];
    if (parseFloat(taxes.igst_amt) > 0)
      lines.push({ tax_name: 'IGST', tax_percentage: parseFloat(taxes.igst_pct) || 0, tax_amount: parseFloat(taxes.igst_amt) });
    if (parseFloat(taxes.cgst_amt) > 0)
      lines.push({ tax_name: 'CGST', tax_percentage: parseFloat(taxes.cgst_pct) || 0, tax_amount: parseFloat(taxes.cgst_amt) });
    if (parseFloat(taxes.sgst_amt) > 0)
      lines.push({ tax_name: 'SGST', tax_percentage: parseFloat(taxes.sgst_pct) || 0, tax_amount: parseFloat(taxes.sgst_amt) });
    return lines;
  };

  // ── Update a match result by index ─────────────────────────────────────────
  const handleUpdateMatch = (invIdx, patch) => {
    setMatchResults(prev => prev.map((r, i) => i === invIdx ? { ...r, ...patch } : r));
  };

  // ── Validation (REVIEW step) ────────────────────────────────────────────────
  const validateReview = () => {
    const errors = [];
    matchResults.forEach((r, i) => {
      if (r.match_type === 'no_match' && r.manual_mapping_po_index == null) {
        errors.push(`Item ${i + 1}: select a PO item to map`);
      }
      if (r.match_type === 'partial_match' && !r.confirmed) {
        errors.push(`Item ${i + 1}: confirm the partial match`);
      }
      if (r.warnings?.length > 0 && !r.acknowledged) {
        errors.push(`Item ${i + 1}: acknowledge the rate/qty warning`);
      }
    });
    return errors;
  };

  // ── EXTRACTING step ─────────────────────────────────────────────────────────
  const handleExtract = async () => {
    if (!uploadFile) return;
    setExtractError('');
    setStep('EXTRACTING');
    const fd = new FormData();
    fd.append('file', uploadFile);
    fd.append('purchaseorder_id', po.purchaseorder_id);
    try {
      const { data } = await api.post('/invoices/extract', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (data.is_scanned) {
        // Fall back to manual entry pre-filled with PO data
        setForm(initManualForm());
        setStep('MANUAL_ENTRY');
        setExtractError('Scanned PDF detected — fields not auto-filled. Please enter manually.');
        return;
      }
      setExtractResult(data);
      setMatchResults(data.match_results || []);
      // Pre-populate reviewHeader from extracted header
      const h = data.header || {};
      setReviewHeader({
        bill_number: h.invoice_number?.value  || `INV-${Date.now()}`,
        date:        h.invoice_date?.value     || new Date().toISOString().split('T')[0],
        due_date:    h.due_date?.value         || '',
        igst_pct:    h.igst_rate?.value        != null ? String(h.igst_rate.value)    : '',
        igst_amt:    h.igst_amount?.value      != null ? String(h.igst_amount.value)  : '',
        cgst_pct:    h.cgst_rate?.value        != null ? String(h.cgst_rate.value)    : '',
        cgst_amt:    h.cgst_amount?.value      != null ? String(h.cgst_amount.value)  : '',
        sgst_pct:    h.sgst_rate?.value        != null ? String(h.sgst_rate.value)    : '',
        sgst_amt:    h.sgst_amount?.value      != null ? String(h.sgst_amount.value)  : '',
        taxable_value: h.taxable_value?.value  != null ? String(h.taxable_value.value) : '',
        total_amount:  h.total_amount?.value   != null ? String(h.total_amount.value)  : '',
        notes: '',
      });
      setStep('REVIEW');
    } catch {
      // Any error → fall back to manual
      setForm(initManualForm());
      setStep('MANUAL_ENTRY');
      setExtractError('Could not extract invoice data — please enter manually.');
    }
  };

  // ── CONFIRMING step ─────────────────────────────────────────────────────────
  const handleProceedToConfirm = () => {
    if (step === 'REVIEW') {
      const errors = validateReview();
      if (errors.length > 0) return; // button should be disabled
      // Merge reviewHeader back into form state for submit
      setForm(prev => ({
        ...prev,
        bill_number: reviewHeader.bill_number,
        date:        reviewHeader.date,
        due_date:    reviewHeader.due_date,
        notes:       reviewHeader.notes || '',
      }));
      setTaxes({
        igst_pct: reviewHeader.igst_pct, igst_amt: reviewHeader.igst_amt,
        cgst_pct: reviewHeader.cgst_pct, cgst_amt: reviewHeader.cgst_amt,
        sgst_pct: reviewHeader.sgst_pct, sgst_amt: reviewHeader.sgst_amt,
      });
    }
    setStep('CONFIRMING');
  };

  // ── Final SUBMIT ─────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitError('');
    setStep('SUBMITTING');

    // Build line items from REVIEW (use extracted items mapped to PO) or manual form
    let finalLineItems;
    if (step !== 'SUBMITTING' && extractResult && matchResults.length > 0) {
      // Build from matched items
      finalLineItems = matchResults.map(r => {
        const invItem = extractResult.line_items[r.invoice_item_index];
        const poIdx = r.manual_mapping_po_index ?? r.po_item_index;
        const poItem = poIdx != null ? po.line_items[poIdx] : null;
        return {
          item_id:     poItem?.item_id     || '',
          name:        poItem?.name        || invItem?.raw_description || '',
          description: poItem?.description || invItem?.raw_description || '',
          rate:        invItem?.unit_rate?.value ?? poItem?.rate ?? 0,
          quantity:    invItem?.quantity?.value  ?? poItem?.quantity  ?? 0,
          account_id:  poItem?.account_id  || '',
        };
      });
    } else {
      finalLineItems = form.line_items;
    }

    const formData = new FormData();
    formData.append('purchaseorder_id', po.purchaseorder_id);
    formData.append('bill_number',      form.bill_number);
    formData.append('date',             form.date);
    formData.append('due_date',         form.due_date);
    formData.append('notes',            form.notes);
    formData.append('line_items',       JSON.stringify(finalLineItems));
    formData.append('tax_lines',        JSON.stringify(buildTaxLines()));
    if (attachFile) formData.append('file', attachFile);
    // Use the original PDF as attachment if we came from REVIEW
    if (!attachFile && uploadFile) formData.append('file', uploadFile);

    try {
      await api.post('/invoices', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onSuccess();
    } catch (err) {
      setSubmitError(err.response?.data?.message || 'Failed to post invoice');
      setStep('CONFIRMING');
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  // UPLOAD step
  if (step === 'UPLOAD') {
    return (
      <div className="space-y-5">
        <p className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
          PO Reference <span className="font-semibold text-gray-600 dark:text-gray-300">{po.purchaseorder_number}</span>
        </p>

        {/* Drop zone */}
        <label className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-600 p-8 cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 dark:hover:border-brand-500 dark:hover:bg-brand-900/10 transition-colors">
          <Upload className="h-8 w-8 text-gray-400 dark:text-gray-500" />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {uploadFile ? uploadFile.name : 'Choose invoice PDF'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">PDF only · max 10 MB</p>
          </div>
          <input
            type="file" accept=".pdf" className="sr-only"
            onChange={e => setUploadFile(e.target.files[0] || null)}
          />
        </label>

        <div className="flex flex-col gap-2">
          <button
            onClick={handleExtract}
            disabled={!uploadFile}
            className="btn-primary w-full"
          >
            <Upload className="h-4 w-4" /> Extract Invoice Data
          </button>
          <button
            type="button"
            onClick={() => { setForm(initManualForm()); setStep('MANUAL_ENTRY'); }}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 text-center py-1"
          >
            Skip — enter manually instead
          </button>
        </div>
      </div>
    );
  }

  // EXTRACTING step
  if (step === 'EXTRACTING') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <Loader2 className="h-10 w-10 animate-spin text-brand-600 dark:text-brand-400" />
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Reading invoice PDF…</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">Extracting fields and matching line items</p>
      </div>
    );
  }

  // REVIEW step
  if (step === 'REVIEW' && extractResult && reviewHeader) {
    const h   = extractResult.header || {};
    const validationErrors = validateReview();
    const currCode = po.currency_code || 'INR';

    // Find unmatched PO items
    const matchedPoIndices = new Set(
      matchResults.map(r => r.manual_mapping_po_index ?? r.po_item_index).filter(i => i != null)
    );
    const unbilledPoItems = (po.line_items || []).filter((_, i) => !matchedPoIndices.has(i));

    return (
      <div className="space-y-5">
        {extractError && (
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-700 flex gap-2 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {extractError}
          </div>
        )}

        {/* Extracted header fields */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Extracted Invoice Fields</h3>
          <div className="grid grid-cols-2 gap-3">
            {/* Invoice number */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="label mb-0">Invoice Number *</label>
                <ConfidenceBadge confidence={h.invoice_number?.confidence || 'low'} />
              </div>
              <input className="input" value={reviewHeader.bill_number}
                onChange={e => setReviewHeader(p => ({ ...p, bill_number: e.target.value }))} required />
            </div>
            {/* Invoice date */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="label mb-0">Invoice Date *</label>
                <ConfidenceBadge confidence={h.invoice_date?.confidence || 'low'} />
              </div>
              <input type="date" className="input" value={reviewHeader.date}
                onChange={e => setReviewHeader(p => ({ ...p, date: e.target.value }))} required />
            </div>
            {/* Due date */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="label mb-0">Due Date</label>
                <ConfidenceBadge confidence={h.due_date?.confidence || 'low'} />
              </div>
              <input type="date" className="input" value={reviewHeader.due_date}
                onChange={e => setReviewHeader(p => ({ ...p, due_date: e.target.value }))} />
            </div>
            {/* Taxable value */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="label mb-0">Taxable Value</label>
                <ConfidenceBadge confidence={h.taxable_value?.confidence || 'low'} />
              </div>
              <input type="number" className="input" value={reviewHeader.taxable_value}
                onChange={e => setReviewHeader(p => ({ ...p, taxable_value: e.target.value }))} />
            </div>
            {/* IGST */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="label mb-0">IGST Amount</label>
                <ConfidenceBadge confidence={h.igst_amount?.confidence || 'low'} />
              </div>
              <div className="flex gap-1">
                <input type="number" className="input w-16 text-xs" placeholder="%" value={reviewHeader.igst_pct}
                  onChange={e => setReviewHeader(p => ({ ...p, igst_pct: e.target.value }))} />
                <input type="number" className="input flex-1 text-xs" placeholder="Amount" value={reviewHeader.igst_amt}
                  onChange={e => setReviewHeader(p => ({ ...p, igst_amt: e.target.value }))} />
              </div>
            </div>
            {/* CGST */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="label mb-0">CGST Amount</label>
                <ConfidenceBadge confidence={h.cgst_amount?.confidence || 'low'} />
              </div>
              <div className="flex gap-1">
                <input type="number" className="input w-16 text-xs" placeholder="%" value={reviewHeader.cgst_pct}
                  onChange={e => setReviewHeader(p => ({ ...p, cgst_pct: e.target.value }))} />
                <input type="number" className="input flex-1 text-xs" placeholder="Amount" value={reviewHeader.cgst_amt}
                  onChange={e => setReviewHeader(p => ({ ...p, cgst_amt: e.target.value }))} />
              </div>
            </div>
            {/* SGST */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="label mb-0">SGST Amount</label>
                <ConfidenceBadge confidence={h.sgst_amount?.confidence || 'low'} />
              </div>
              <div className="flex gap-1">
                <input type="number" className="input w-16 text-xs" placeholder="%" value={reviewHeader.sgst_pct}
                  onChange={e => setReviewHeader(p => ({ ...p, sgst_pct: e.target.value }))} />
                <input type="number" className="input flex-1 text-xs" placeholder="Amount" value={reviewHeader.sgst_amt}
                  onChange={e => setReviewHeader(p => ({ ...p, sgst_amt: e.target.value }))} />
              </div>
            </div>
            {/* Total */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="label mb-0">Grand Total</label>
                <ConfidenceBadge confidence={h.total_amount?.confidence || 'low'} />
              </div>
              <input type="number" className="input" value={reviewHeader.total_amount}
                onChange={e => setReviewHeader(p => ({ ...p, total_amount: e.target.value }))} />
            </div>
          </div>
        </div>

        {/* Line item match table */}
        {extractResult.line_items?.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Line Item Matching ({extractResult.line_items.length} item{extractResult.line_items.length !== 1 ? 's' : ''})
            </h3>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto overflow-y-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400">Invoice Item</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400">PO Item</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400">Status</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400">Attributes</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchResults.map((mr, i) => (
                      <LineItemMatchRow
                        key={i}
                        invItem={extractResult.line_items[mr.invoice_item_index]}
                        matchResult={mr}
                        poLineItems={po.line_items || []}
                        onUpdateMatch={handleUpdateMatch}
                        currencyCode={currCode}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Unbilled PO items */}
        {unbilledPoItems.length > 0 && (
          <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 p-3">
            <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-300 mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> {unbilledPoItems.length} PO item{unbilledPoItems.length > 1 ? 's' : ''} not found in invoice:
            </p>
            <ul className="text-xs text-yellow-700 dark:text-yellow-400 space-y-0.5 list-disc list-inside">
              {unbilledPoItems.map((item, i) => (
                <li key={i}>{item.name || item.description || `Item ${i + 1}`} — Qty {item.quantity}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Validation bar */}
        {validationErrors.length > 0 ? (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 space-y-1">
            {validationErrors.map((e, i) => (
              <p key={i} className="text-xs text-red-700 dark:text-red-400 flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5 shrink-0" /> {e}
              </p>
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3">
            <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5" /> All items reviewed — ready to proceed
            </p>
          </div>
        )}

        {/* Footer buttons */}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-outline flex-1">Cancel</button>
          <button
            type="button"
            onClick={handleProceedToConfirm}
            disabled={validationErrors.length > 0}
            className="btn-primary flex-1"
          >
            Proceed to Confirm
          </button>
        </div>
      </div>
    );
  }

  // MANUAL_ENTRY step (identical to original InvoiceForm)
  if (step === 'MANUAL_ENTRY') {
    return (
      <form onSubmit={e => { e.preventDefault(); handleProceedToConfirm(); }} className="space-y-5">
        {extractError && (
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-700 flex gap-2 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {extractError}
          </div>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
          PO Reference <span className="font-semibold text-gray-600 dark:text-gray-300">{po.purchaseorder_number}</span> will be stored in Zoho Books on the bill.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Invoice Number *</label>
            <input className="input" value={form.bill_number}
              onChange={e => setForm(p => ({ ...p, bill_number: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Invoice Date *</label>
            <input type="date" className="input" value={form.date}
              onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Due Date</label>
            <input type="date" className="input" value={form.due_date}
              onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input" placeholder="Optional" value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>

        {/* Line items */}
        <div>
          <label className="label">Line Items</label>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Item</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Qty</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Rate</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {form.line_items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2">
                      <input className="input py-1 text-xs" value={item.name}
                        onChange={e => updateLineItem(idx, 'name', e.target.value)} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" className="input py-1 text-xs text-right w-20"
                        value={item.quantity}
                        onChange={e => updateLineItem(idx, 'quantity', e.target.value)} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" className="input py-1 text-xs text-right w-24"
                        value={item.rate}
                        onChange={e => updateLineItem(idx, 'rate', e.target.value)} />
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300">
                      {((parseFloat(item.rate) || 0) * (parseFloat(item.quantity) || 0)).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">Subtotal</td>
                  <td className="px-3 py-2 text-right text-sm font-bold text-gray-900 dark:text-gray-100">
                    {po.currency_code} {lineTotal.toLocaleString('en-IN')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Tax Breakup */}
        <div>
          <label className="label">Tax Breakup (optional)</label>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Tax Type</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Rate (%)</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Amount ({po.currency_code})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {[
                  { label: 'IGST', pctKey: 'igst_pct', amtKey: 'igst_amt' },
                  { label: 'CGST', pctKey: 'cgst_pct', amtKey: 'cgst_amt' },
                  { label: 'SGST', pctKey: 'sgst_pct', amtKey: 'sgst_amt' },
                ].map(({ label, pctKey, amtKey }) => (
                  <tr key={label}>
                    <td className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300">{label}</td>
                    <td className="px-3 py-2">
                      <input type="number" min="0" max="100" step="0.01"
                        className="input py-1 text-xs text-right w-20 ml-auto"
                        placeholder="0" value={taxes[pctKey]}
                        onChange={e => updateTax(pctKey, e.target.value)} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min="0" step="0.01"
                        className="input py-1 text-xs text-right w-24 ml-auto"
                        placeholder="0.00" value={taxes[amtKey]}
                        onChange={e => updateTax(amtKey, e.target.value)} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
                <tr>
                  <td colSpan={2} className="px-3 py-2 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">Total Tax</td>
                  <td className="px-3 py-2 text-right text-sm font-bold text-gray-900 dark:text-gray-100">
                    {po.currency_code} {totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr className="border-t border-gray-200 dark:border-gray-600">
                  <td colSpan={2} className="px-3 py-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100">Grand Total</td>
                  <td className="px-3 py-2 text-right text-sm font-bold text-brand-600 dark:text-brand-400">
                    {po.currency_code} {(lineTotal + totalTax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* File upload */}
        <div>
          <label className="label">Attach Invoice PDF / Image (optional)</label>
          <input
            type="file" accept=".pdf,.jpg,.jpeg,.png"
            className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-xs file:font-medium file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/30 dark:file:text-brand-400"
            onChange={e => setAttachFile(e.target.files[0])}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => setStep('UPLOAD')} className="btn-outline flex items-center gap-1">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <button type="submit" className="btn-primary flex-1">
            Review & Confirm
          </button>
        </div>
      </form>
    );
  }

  // CONFIRMING step
  if (step === 'CONFIRMING') {
    const grandTotal = lineTotal + totalTax;
    return (
      <div className="space-y-5">
        {submitError && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex gap-2 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {submitError}
          </div>
        )}

        <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 text-sm">
          <div className="px-4 py-3 flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Invoice Number</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{form.bill_number}</span>
          </div>
          <div className="px-4 py-3 flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Invoice Date</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{form.date}</span>
          </div>
          {form.due_date && (
            <div className="px-4 py-3 flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Due Date</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{form.due_date}</span>
            </div>
          )}
          <div className="px-4 py-3 flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">PO Reference</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{po.purchaseorder_number}</span>
          </div>
          <div className="px-4 py-3 flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Line Items</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{form.line_items.length}</span>
          </div>
          {totalTax > 0 && (
            <div className="px-4 py-3 flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Total Tax</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {po.currency_code} {totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
          <div className="px-4 py-3 flex justify-between">
            <span className="text-gray-700 dark:text-gray-200 font-semibold">Grand Total</span>
            <span className="text-base font-bold text-brand-600 dark:text-brand-400">
              {po.currency_code} {grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => setStep(extractResult ? 'REVIEW' : 'MANUAL_ENTRY')}
            className="btn-outline flex items-center gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <button type="button" onClick={handleSubmit} className="btn-primary flex-1">
            <Send className="h-4 w-4" /> Confirm & Post to Zoho Books
          </button>
        </div>
      </div>
    );
  }

  // SUBMITTING step
  if (step === 'SUBMITTING') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <Loader2 className="h-10 w-10 animate-spin text-brand-600 dark:text-brand-400" />
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Posting invoice to Zoho Books…</p>
      </div>
    );
  }

  return null;
}

// ─── Reject Modal ────────────────────────────────────────────────────────────
function RejectModal({ onClose, onReject }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReject = async () => {
    setLoading(true);
    await onReject(reason);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">Please provide a reason for rejecting this purchase order.</p>
      <div>
        <label className="label">Reason (optional)</label>
        <textarea
          className="input h-24 resize-none"
          placeholder="e.g. Pricing discrepancy, cannot fulfill quantities…"
          value={reason}
          onChange={e => setReason(e.target.value)}
        />
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="btn-outline flex-1">Cancel</button>
        <button onClick={handleReject} disabled={loading} className="btn-danger flex-1">
          {loading ? 'Rejecting…' : 'Reject PO'}
        </button>
      </div>
    </div>
  );
}

// ─── Main PO Detail page ─────────────────────────────────────────────────────
export default function PODetail() {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const { hasRole }  = useAuth();
  const [po,          setPO]          = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [actionMsg,   setActionMsg]   = useState('');
  const [showInvoice, setShowInvoice] = useState(false);
  const [showReject,  setShowReject]  = useState(false);
  const [acting,      setActing]      = useState(false);

  const loadPO = async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get(`/purchase-orders/${id}`);
      setPO(data.purchaseorder);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load purchase order');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPO(); }, [id]);

  const doAction = async (fn, successMsg) => {
    setActing(true); setError(''); setActionMsg('');
    try {
      await fn();
      setActionMsg(successMsg);
      await loadPO();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed');
    } finally {
      setActing(false);
    }
  };

  const handleAccept         = () => doAction(() => api.post(`/purchase-orders/${id}/accept`),           'Purchase order accepted successfully.');
  const handleMarkInProd     = () => doAction(() => api.post(`/purchase-orders/${id}/mark-in-production`), 'Marked as In Production.');
  const handleMarkDispatched = () => doAction(() => api.post(`/purchase-orders/${id}/mark-dispatched`),    'Marked as Dispatched.');

  const handleReject = async reason => {
    setActing(true); setError(''); setActionMsg('');
    try {
      await api.post(`/purchase-orders/${id}/reject`, { reason });
      setShowReject(false);
      setActionMsg('Purchase order rejected.');
      await loadPO();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reject PO');
    } finally {
      setActing(false);
    }
  };

  const effectiveStatus = getEffectiveStatus(po);
  const isOpsRole       = hasRole('seller_admin', 'operations_user');
  const isFinanceRole   = hasRole('seller_admin', 'finance_user');

  // Action visibility
  const canAcceptReject  = isOpsRole && po && (po.status === 'open' || po.status === 'draft');
  const canMarkInProd    = isOpsRole && po && po.status === 'open' && !po.local_status;
  const canMarkDisp      = isOpsRole && po && po.status === 'open' && po.local_status === 'in_production';
  const canCreateInvoice = isFinanceRole && po && po.status === 'open';

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (error && !po) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">{error}</div>
      </div>
    );
  }

  if (!po) return null;

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto">
      {/* Back */}
      <Link to="/purchase-orders" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
        <ArrowLeft className="h-4 w-4" /> Back to Purchase Orders
      </Link>

      {/* Feedback */}
      {actionMsg && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700 flex items-center gap-2 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
          <CheckCircle className="h-4 w-4 shrink-0" /> {actionMsg}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">{error}</div>
      )}

      {/* Header card */}
      <div className="card p-5 space-y-4">
        {/* Title row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">{po.purchaseorder_number}</h1>
              <StatusBadge status={effectiveStatus} />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Issued by <span className="font-medium text-gray-700 dark:text-gray-300">{po.vendor_name || 'JODL'}</span>
            </p>
          </div>

          {/* Action buttons — role-gated */}
          <div className="flex flex-wrap gap-2">
            {canAcceptReject && (
              <>
                <button onClick={handleAccept} disabled={acting} className="btn-success">
                  <CheckCircle className="h-4 w-4" />
                  {acting ? 'Processing…' : 'Accept PO'}
                </button>
                <button onClick={() => setShowReject(true)} disabled={acting} className="btn-danger">
                  <XCircle className="h-4 w-4" /> Reject PO
                </button>
              </>
            )}
            {canMarkInProd && (
              <button onClick={handleMarkInProd} disabled={acting} className="btn-outline">
                <Factory className="h-4 w-4" /> Mark In Production
              </button>
            )}
            {canMarkDisp && (
              <button onClick={handleMarkDispatched} disabled={acting} className="btn-outline">
                <Truck className="h-4 w-4" /> Mark Dispatched
              </button>
            )}
            {canCreateInvoice && (
              <button onClick={() => setShowInvoice(true)} className="btn-primary">
                <FileText className="h-4 w-4" /> Create Invoice
              </button>
            )}
          </div>
        </div>

        {/* Status Stepper */}
        <div className="pt-2 pb-1">
          <POStatusStepper effectiveStatus={effectiveStatus} />
        </div>

        {/* Meta info */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 border-t border-gray-100 dark:border-gray-700 pt-4">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-gray-400 dark:text-gray-500" />
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">PO Date</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{po.date ? format(new Date(po.date), 'dd MMM yyyy') : '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-gray-400 dark:text-gray-500" />
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Expected Delivery</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {po.expected_delivery_date ? format(new Date(po.expected_delivery_date), 'dd MMM yyyy') : '—'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Package className="h-4 w-4 text-gray-400 dark:text-gray-500" />
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Total Amount</p>
              <p className="font-bold text-brand-600 dark:text-brand-400">
                {po.currency_code} {Number(po.total || 0).toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </div>

        {/* Buyer / Delivery info */}
        {(() => {
          const deliveryAddr = formatAddress(po.delivery_address);
          const buyerName = typeof po.customer_name === 'string' ? po.customer_name : null;
          if (!buyerName && !deliveryAddr) return null;
          return (
            <div className="border-t border-gray-100 dark:border-gray-700 pt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {buyerName && (
                <div className="flex items-start gap-2 text-sm">
                  <UserIcon className="h-4 w-4 text-gray-400 dark:text-gray-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Buyer</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{buyerName}</p>
                  </div>
                </div>
              )}
              {deliveryAddr && (
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-gray-400 dark:text-gray-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Delivery Address</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100 whitespace-pre-line">{deliveryAddr}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {po.notes && (
          <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Notes</p>
            <p className="text-sm text-gray-600 dark:text-gray-300">{po.notes}</p>
          </div>
        )}
      </div>

      {/* Line Items */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Line Items</h2>
        </div>

        {/* Mobile line-item cards */}
        <ul className="divide-y divide-gray-100 dark:divide-gray-700 sm:hidden">
          {(po.line_items || []).map((item, idx) => (
            <li key={idx} className="px-4 py-3 space-y-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.name}</p>
              {item.description && <p className="text-xs text-gray-500 dark:text-gray-400">{item.description}</p>}
              <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 pt-1">
                <span>Qty: {item.quantity} {item.unit ? `(${item.unit})` : ''}</span>
                <span>Rate: {po.currency_code} {Number(item.rate || 0).toLocaleString('en-IN')}</span>
                <span className="font-semibold text-gray-800 dark:text-gray-200">
                  {po.currency_code} {Number(item.item_total || item.rate * item.quantity || 0).toLocaleString('en-IN')}
                </span>
              </div>
            </li>
          ))}
          <li className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 flex justify-between items-center border-t border-gray-200 dark:border-gray-700">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Total</span>
            <span className="text-base font-bold text-brand-600 dark:text-brand-400">
              {po.currency_code} {Number(po.total || 0).toLocaleString('en-IN')}
            </span>
          </li>
        </ul>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="table-th">Item</th>
                <th className="table-th hidden md:table-cell">Description</th>
                <th className="table-th text-right">Qty</th>
                <th className="table-th text-right hidden md:table-cell">Unit</th>
                <th className="table-th text-right">Rate</th>
                <th className="table-th text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {(po.line_items || []).map((item, idx) => (
                <tr key={idx}>
                  <td className="table-td font-medium">{item.name}</td>
                  <td className="table-td text-gray-500 dark:text-gray-400 max-w-xs truncate hidden md:table-cell">{item.description || '—'}</td>
                  <td className="table-td text-right">{item.quantity}</td>
                  <td className="table-td text-right hidden md:table-cell">{item.unit || '—'}</td>
                  <td className="table-td text-right whitespace-nowrap">
                    {po.currency_code} {Number(item.rate || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="table-td text-right font-semibold whitespace-nowrap">
                    {po.currency_code} {Number(item.item_total || item.rate * item.quantity || 0).toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">Total</td>
                <td className="px-4 py-3 text-right text-base font-bold text-brand-600 dark:text-brand-400 whitespace-nowrap">
                  {po.currency_code} {Number(po.total || 0).toLocaleString('en-IN')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Invoice Modal */}
      <Modal
        open={showInvoice}
        onClose={() => setShowInvoice(false)}
        title={`Post Invoice — ${po.purchaseorder_number}`}
        maxWidth="max-w-4xl"
      >
        <div className="overflow-y-auto max-h-[70vh]">
          <InvoiceForm
            po={po}
            onClose={() => setShowInvoice(false)}
            onSuccess={() => {
              setShowInvoice(false);
              setActionMsg('Invoice posted to Zoho Books successfully!');
              loadPO();
            }}
          />
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal
        open={showReject}
        onClose={() => setShowReject(false)}
        title="Reject Purchase Order"
      >
        <RejectModal
          onClose={() => setShowReject(false)}
          onReject={handleReject}
        />
      </Modal>
    </div>
  );
}
