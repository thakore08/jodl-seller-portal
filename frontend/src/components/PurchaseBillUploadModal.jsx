import React, { useEffect, useState } from 'react';
import { FileText, Loader2, Plus, Trash2, Upload, X } from 'lucide-react';
import api from '../services/api';

const EMPTY_HEADER = {
  invoice_number: '',
  invoice_date: '',
  due_date: '',
  seller_name: '',
  seller_gstin: '',
  buyer_name: '',
  buyer_gstin: '',
  place_of_supply: '',
  payment_terms: '',
  taxable_value: '',
  igst_amount: '',
  igst_rate: '',
  cgst_amount: '',
  cgst_rate: '',
  sgst_amount: '',
  sgst_rate: '',
  total_amount: '',
};

function makeEmptyLineItem() {
  return {
    raw_description: '',
    hsn_code: '',
    quantity: '',
    unit: '',
    unit_rate: '',
    gst_rate: '',
    po_item_index: '',
  };
}

function toStr(value) {
  return value == null ? '' : String(value);
}

function mapHeaderFromExtract(header) {
  const h = header || {};
  return {
    invoice_number: toStr(h.invoice_number?.value),
    invoice_date: toStr(h.invoice_date?.value),
    due_date: toStr(h.due_date?.value),
    seller_name: toStr(h.seller_name?.value),
    seller_gstin: toStr(h.seller_gstin?.value),
    buyer_name: toStr(h.buyer_name?.value),
    buyer_gstin: toStr(h.buyer_gstin?.value),
    place_of_supply: toStr(h.place_of_supply?.value),
    payment_terms: toStr(h.payment_terms?.value),
    taxable_value: toStr(h.taxable_value?.value),
    igst_amount: toStr(h.igst_amount?.value),
    igst_rate: toStr(h.igst_rate?.value),
    cgst_amount: toStr(h.cgst_amount?.value),
    cgst_rate: toStr(h.cgst_rate?.value),
    sgst_amount: toStr(h.sgst_amount?.value),
    sgst_rate: toStr(h.sgst_rate?.value),
    total_amount: toStr(h.total_amount?.value),
  };
}

function mapLineItemsFromExtract(items, poLineItems = []) {
  if (!Array.isArray(items) || items.length === 0) return [makeEmptyLineItem()];
  return items.map((item, idx) => {
    const poItem = poLineItems[idx];
    const ocrUnit = toStr(item.unit?.value);
    return {
    raw_description: toStr(item.raw_description),
    hsn_code: toStr(item.hsn_code?.value),
    quantity: toStr(item.quantity?.value),
    unit: ocrUnit || toStr(poItem?.unit),
    unit_rate: toStr(item.unit_rate?.value),
    gst_rate: toStr(item.gst_percent?.value),
    po_item_index: String(idx),
    };
  });
}

export default function PurchaseBillUploadModal({ open, po, onClose, onSuccess }) {
  const [phase, setPhase] = useState('UPLOAD');
  const [uploadFile, setUploadFile] = useState(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [extractResult, setExtractResult] = useState(null);
  const [header, setHeader] = useState({ ...EMPTY_HEADER });
  const [lineItems, setLineItems] = useState([makeEmptyLineItem()]);
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitWarning, setSubmitWarning] = useState('');

  useEffect(() => {
    if (!open) return;
    setPhase('UPLOAD');
    setUploadFile(null);
    setPdfUrl('');
    setExtractResult(null);
    setHeader({ ...EMPTY_HEADER });
    setLineItems([makeEmptyLineItem()]);
    setError('');
    setSubmitError('');
    setSubmitWarning('');
  }, [open]);

  useEffect(() => {
    if (!uploadFile) {
      setPdfUrl('');
      return;
    }
    const url = URL.createObjectURL(uploadFile);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [uploadFile]);

  if (!open) return null;

  const onExtract = async () => {
    if (!uploadFile || !po?.purchaseorder_id) return;
    setError('');
    setSubmitError('');
    setPhase('EXTRACTING');

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('purchaseorder_id', po.purchaseorder_id);

    try {
      const { data } = await api.post('/invoices/extract', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setExtractResult(data);
      setHeader(mapHeaderFromExtract(data.header));
      setLineItems(mapLineItemsFromExtract(data.line_items, po?.line_items || []));
      setPhase('FORM');
    } catch (err) {
      setError(err.response?.data?.message || 'OCR extraction failed. Please fill details manually.');
      setPhase('FORM');
    }
  };

  const updateHeader = (key, value) => {
    setHeader(prev => ({ ...prev, [key]: value }));
  };

  const updateLineItem = (idx, key, value) => {
    setLineItems(prev => prev.map((item, i) => (i === idx ? { ...item, [key]: value } : item)));
  };

  const addLineItem = () => setLineItems(prev => [...prev, makeEmptyLineItem()]);
  const deleteLineItem = idx => setLineItems(prev => prev.filter((_, i) => i !== idx));

  const buildTaxLines = () => {
    const lines = [];
    const igstAmount = parseFloat(header.igst_amount) || 0;
    const cgstAmount = parseFloat(header.cgst_amount) || 0;
    const sgstAmount = parseFloat(header.sgst_amount) || 0;
    if (igstAmount > 0) {
      lines.push({
        tax_name: 'IGST',
        tax_percentage: parseFloat(header.igst_rate) || 0,
        tax_amount: igstAmount,
      });
    }
    if (cgstAmount > 0) {
      lines.push({
        tax_name: 'CGST',
        tax_percentage: parseFloat(header.cgst_rate) || 0,
        tax_amount: cgstAmount,
      });
    }
    if (sgstAmount > 0) {
      lines.push({
        tax_name: 'SGST',
        tax_percentage: parseFloat(header.sgst_rate) || 0,
        tax_amount: sgstAmount,
      });
    }
    return lines;
  };

  const onSubmit = async () => {
    setSubmitError('');
    if (!header.invoice_number.trim()) {
      setSubmitError('Bill Number is required.');
      return;
    }
    if (!header.invoice_date.trim()) {
      setSubmitError('Bill Date is required.');
      return;
    }

    const poItems = po?.line_items || [];
    const finalLineItems = lineItems.map((item, idx) => {
      const poIdx = item.po_item_index === '' ? idx : parseInt(item.po_item_index, 10);
      const poItem = Number.isNaN(poIdx) ? null : poItems[poIdx];
      return {
        item_id: poItem?.item_id || '',
        name: poItem?.name || item.raw_description || `Item ${idx + 1}`,
        description: poItem?.description || item.raw_description || '',
        rate: parseFloat(item.unit_rate) || poItem?.rate || 0,
        quantity: parseFloat(item.quantity) || poItem?.quantity || 0,
        account_id: poItem?.account_id || '',
      };
    });

    const formData = new FormData();
    formData.append('purchaseorder_id', po.purchaseorder_id);
    formData.append('bill_number', header.invoice_number);
    formData.append('date', header.invoice_date);
    formData.append('due_date', header.due_date || '');
    formData.append('notes', '');
    formData.append('line_items', JSON.stringify(finalLineItems));
    formData.append('tax_lines', JSON.stringify(buildTaxLines()));
    if (uploadFile) formData.append('file', uploadFile);

    try {
      setPhase('SUBMITTING');
      const { data } = await api.post('/invoices', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (data.warning) {
        // Bill was posted successfully but auto-invoice failed — show warning banner
        // and auto-close after 5s so the user has time to read it.
        setSubmitWarning(data.warning);
        setPhase('FORM');
        setTimeout(() => onSuccess(), 5000);
      } else {
        onSuccess();
      }
    } catch (err) {
      setSubmitError(err.response?.data?.message || 'Failed to submit purchase bill.');
      setPhase('FORM');
    }
  };

  const mappingPreview = {
    backend_header_values: {
      invoice_number: extractResult?.header?.invoice_number?.value ?? null,
      invoice_date: extractResult?.header?.invoice_date?.value ?? null,
      due_date: extractResult?.header?.due_date?.value ?? null,
      seller_name: extractResult?.header?.seller_name?.value ?? null,
      seller_gstin: extractResult?.header?.seller_gstin?.value ?? null,
      buyer_name: extractResult?.header?.buyer_name?.value ?? null,
      buyer_gstin: extractResult?.header?.buyer_gstin?.value ?? null,
      payment_terms: extractResult?.header?.payment_terms?.value ?? null,
      place_of_supply: extractResult?.header?.place_of_supply?.value ?? null,
    },
    ui_header_values: {
      invoice_number: header.invoice_number,
      invoice_date: header.invoice_date,
      due_date: header.due_date,
      seller_name: header.seller_name,
      seller_gstin: header.seller_gstin,
      buyer_name: header.buyer_name,
      buyer_gstin: header.buyer_gstin,
      payment_terms: header.payment_terms,
      place_of_supply: header.place_of_supply,
    },
    line_items_count: {
      backend: Array.isArray(extractResult?.line_items) ? extractResult.line_items.length : 0,
      ui: lineItems.length,
    },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm p-2 sm:p-4">
      <div className="relative h-[96dvh] max-h-[96dvh] w-[98vw] sm:w-[96vw] max-w-[1480px] overflow-hidden rounded-2xl border border-slate-200/70 bg-white/95 shadow-2xl dark:bg-slate-900/90 dark:border-slate-700/70 animate-[pageFadeUp_260ms_ease-out]">
        <div className="flex items-center justify-between border-b border-gray-200/80 px-4 py-3 dark:border-gray-700">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 text-brand-600" />
            <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">Purchase Bill Upload</h2>
            <span className="truncate text-xs text-gray-500">- {po?.purchaseorder_number}</span>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid h-[calc(96dvh-56px)] min-h-0 grid-cols-1 grid-rows-[minmax(240px,42vh)_1fr] lg:grid-cols-[42%_58%] lg:grid-rows-1">
          <div className="flex min-h-0 flex-col border-b border-gray-200/80 p-4 dark:border-gray-700 lg:border-b-0 lg:border-r">
            <label className="mb-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-700 hover:border-brand-500 hover:bg-brand-50/35 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-brand-900/10 transition-colors">
              <Upload className="h-4 w-4" />
              <span className="truncate">{uploadFile ? uploadFile.name : 'Choose PDF file'}</span>
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
              />
            </label>
            <button
              type="button"
              onClick={onExtract}
              disabled={!uploadFile || phase === 'EXTRACTING'}
              className="btn-primary shimmer-on-hover mb-3 inline-flex items-center justify-center gap-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              {phase === 'EXTRACTING' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Extract OCR
            </button>
            {error && (
              <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                {error}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200/80 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/50">
              {pdfUrl ? (
                <iframe title="Purchase bill preview" src={pdfUrl} className="h-full w-full" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                  PDF preview will appear here
                </div>
              )}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto p-4">
            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="label">Bill Number *</label>
                <input className="input" value={header.invoice_number} onChange={e => updateHeader('invoice_number', e.target.value)} />
              </div>
              <div>
                <label className="label">Bill Date *</label>
                <input type="date" className="input" value={header.invoice_date} onChange={e => updateHeader('invoice_date', e.target.value)} />
              </div>
              <div>
                <label className="label">Due Date</label>
                <input type="date" className="input" value={header.due_date} onChange={e => updateHeader('due_date', e.target.value)} />
              </div>
              <div>
                <label className="label">PO Reference</label>
                <input className="input bg-gray-50 dark:bg-gray-800" readOnly value={po?.purchaseorder_number || ''} />
              </div>
              <div>
                <label className="label">Seller Name</label>
                <input className="input" value={header.seller_name} onChange={e => updateHeader('seller_name', e.target.value)} />
              </div>
              <div>
                <label className="label">Seller GST Number</label>
                <input className="input" value={header.seller_gstin} onChange={e => updateHeader('seller_gstin', e.target.value)} />
              </div>
              <div>
                <label className="label">Buyer Name</label>
                <input className="input" value={header.buyer_name} onChange={e => updateHeader('buyer_name', e.target.value)} />
              </div>
              <div>
                <label className="label">Buyer GST Number</label>
                <input className="input" value={header.buyer_gstin} onChange={e => updateHeader('buyer_gstin', e.target.value)} />
              </div>
              <div>
                <label className="label">Place of Supply</label>
                <input className="input" value={header.place_of_supply} onChange={e => updateHeader('place_of_supply', e.target.value)} />
              </div>
              <div>
                <label className="label">Payment Terms</label>
                <input className="input" value={header.payment_terms} onChange={e => updateHeader('payment_terms', e.target.value)} />
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-gray-200/80 dark:border-gray-700">
              <div className="flex items-center justify-between border-b border-gray-200/80 px-3 py-2 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/40">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Line Items ({lineItems.length})</h3>
                <button type="button" onClick={addLineItem} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                  <Plus className="h-3.5 w-3.5" /> Add Line
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-2 py-2 text-left">#</th>
                      <th className="px-2 py-2 text-left">Description</th>
                      <th className="px-2 py-2 text-left">Mapped PO Item</th>
                      <th className="px-2 py-2 text-left">HSN</th>
                      <th className="px-2 py-2 text-left">Qty</th>
                      <th className="px-2 py-2 text-left">Unit</th>
                      <th className="px-2 py-2 text-left">Rate</th>
                      <th className="px-2 py-2 text-left">GST %</th>
                      <th className="px-2 py-2 text-left">Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, idx) => (
                      <tr key={idx} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-2 py-2">{idx + 1}</td>
                        <td className="px-2 py-2">
                          <input className="input py-1 text-xs" value={item.raw_description} onChange={e => updateLineItem(idx, 'raw_description', e.target.value)} />
                        </td>
                        <td className="px-2 py-2">
                          <select
                            className="input py-1 text-xs"
                            value={item.po_item_index}
                            onChange={e => {
                              const nextPoIdx = e.target.value;
                              const selectedPo = nextPoIdx === '' ? null : (po?.line_items || [])[parseInt(nextPoIdx, 10)];
                              setLineItems(prev => prev.map((row, rowIdx) => {
                                if (rowIdx !== idx) return row;
                                return {
                                  ...row,
                                  po_item_index: nextPoIdx,
                                  unit: row.unit || toStr(selectedPo?.unit),
                                };
                              }));
                            }}
                          >
                            <option value="">Auto by index</option>
                            {(po?.line_items || []).map((poItem, poIdx) => (
                              <option key={poIdx} value={String(poIdx)}>
                                {poItem.name || poItem.description || `Item ${poIdx + 1}`}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input className="input py-1 text-xs" value={item.hsn_code} onChange={e => updateLineItem(idx, 'hsn_code', e.target.value)} />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" className="input py-1 text-xs" value={item.quantity} onChange={e => updateLineItem(idx, 'quantity', e.target.value)} />
                        </td>
                        <td className="px-2 py-2">
                          <input className="input py-1 text-xs" value={item.unit} onChange={e => updateLineItem(idx, 'unit', e.target.value)} />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" className="input py-1 text-xs" value={item.unit_rate} onChange={e => updateLineItem(idx, 'unit_rate', e.target.value)} />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" className="input py-1 text-xs" value={item.gst_rate} onChange={e => updateLineItem(idx, 'gst_rate', e.target.value)} />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => deleteLineItem(idx)}
                            className="inline-flex items-center rounded border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <details className="mb-4 rounded-xl border border-gray-200/80 px-3 py-2 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/30">
              <summary className="cursor-pointer text-xs font-semibold text-gray-700 dark:text-gray-200">
                Backend to UI Mapping Preview
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-all rounded bg-gray-50 p-2 text-[11px] text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                {JSON.stringify(mappingPreview, null, 2)}
              </pre>
            </details>

            {submitWarning && (
              <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                <p className="font-semibold mb-0.5">✓ Purchase bill submitted successfully</p>
                <p>{submitWarning}</p>
                <p className="mt-1 text-amber-600 dark:text-amber-400">Closing automatically…</p>
              </div>
            )}
            {submitError && (
              <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                {submitError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button onClick={onClose} className="btn-outline">Cancel</button>
              <button
                onClick={onSubmit}
                disabled={phase === 'SUBMITTING'}
                className="btn-primary shimmer-on-hover inline-flex items-center gap-2"
              >
                {phase === 'SUBMITTING' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Submit Purchase Bill
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
