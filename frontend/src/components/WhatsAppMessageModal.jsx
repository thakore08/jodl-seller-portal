import React, { useState, useEffect } from 'react';
import { X, MessageCircle, Plus, Trash2 } from 'lucide-react';
import api from '../services/api';

// ─── WhatsApp SVG icon ────────────────────────────────────────────────────────
function WhatsAppIcon({ size = 20, color = '#25D366' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ─── Template definitions ─────────────────────────────────────────────────────
const TEMPLATES = [
  { key: 'po_issued',          label: 'T1: PO Issued' },
  { key: 'material_readiness', label: 'T2: Material Readiness Status' },
  { key: 'shipment_planned',   label: 'T3: Shipment Planned Details' },
  { key: 'update_invoice',     label: 'T4: Update Invoice' },
  { key: 'bill_payout',        label: 'T5: Bill Payout Details' },
  { key: 'adhoc',              label: 'T6: Adhoc Message' },
];

const emptyRow = () => ({ itemName: '', qty: '', vehicleNo: '' });

// ─── Build template text (client-side, for preview + send) ───────────────────
function buildTemplateText({ templateKey, po, vehicleNumber, arrivalDatetime, loadingPlan, adhocMessage }) {
  const poNum   = po.purchaseorder_number || po.purchaseorder_id;
  const poUrl   = `${window.location.origin}/purchase-orders/${po.purchaseorder_id}`;
  const amount  = po.total ? `INR ${Number(po.total).toLocaleString('en-IN')}` : 'TBD';

  switch (templateKey) {
    case 'po_issued':
      return (
        `📦 New Purchase Order — JODL\n\n` +
        `PO Number: *${poNum}*\n` +
        `Total Amount: *${amount}*\n\n` +
        `Please review and confirm acceptance.\n\n` +
        `View PO: ${poUrl}`
      );

    case 'material_readiness':
      return (
        `PO ${poNum} has been accepted.\n\n` +
        `Kindly update the material readiness status:\n` +
        `• Reply with ETA date to update schedule\n` +
        `• Reply READY to mark all items ready\n\n` +
        `View PO: ${poUrl}`
      );

    case 'shipment_planned': {
      const planLines = loadingPlan
        .filter(r => r.itemName)
        .map(r => `• ${r.itemName} x${r.qty || '-'} | Vehicle: ${r.vehicleNo || '-'}`)
        .join('\n');
      return (
        `Shipment planned for PO ${poNum}\n\n` +
        `Vehicle: ${vehicleNumber || 'TBD'}\n` +
        `Arrival: ${arrivalDatetime || 'TBD'}` +
        (planLines ? `\n\nLoading Plan:\n${planLines}` : '') +
        `\n\nView PO: ${poUrl}`
      );
    }

    case 'update_invoice':
      return (
        `PO ${poNum} has been accepted.\n\n` +
        `Please submit your invoice at the earliest:\n` +
        `• Send the invoice PDF/image directly on WhatsApp\n` +
        `• Or reply with your invoice number\n\n` +
        `View PO: ${poUrl}`
      );

    case 'bill_payout':
      return (
        `Payment update for PO ${poNum}.\n\n` +
        `Kindly contact your JODL account manager for payment details.\n\n` +
        `View PO: ${poUrl}`
      );

    case 'adhoc':
      return adhocMessage || '';

    default:
      return '';
  }
}

// ─── Modal component ──────────────────────────────────────────────────────────
export default function WhatsAppMessageModal({ po, sellerInfo, onClose, onSent }) {
  const [selectedKey,     setSelectedKey]     = useState('');
  const [customText,      setCustomText]      = useState('');
  const [adhocMessage,    setAdhocMessage]    = useState('');
  const [vehicleNumber,   setVehicleNumber]   = useState('');
  const [arrivalDatetime, setArrivalDatetime] = useState('');
  const [loadingPlan,     setLoadingPlan]     = useState([emptyRow()]);
  const [preview,         setPreview]         = useState('');
  const [sending,         setSending]         = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [error,           setError]           = useState('');
  const [successMsg,      setSuccessMsg]      = useState('');

  // Rebuild preview whenever any field changes
  useEffect(() => {
    if (!selectedKey) { setPreview(''); return; }
    const templateBody = buildTemplateText({
      templateKey: selectedKey, po, vehicleNumber, arrivalDatetime, loadingPlan, adhocMessage,
    });
    const parts = [customText.trim(), templateBody].filter(Boolean);
    setPreview(parts.join('\n\n'));
  }, [selectedKey, customText, adhocMessage, vehicleNumber, arrivalDatetime, loadingPlan, po]);

  // Reset extra fields on template change
  const handleTemplateChange = (key) => {
    setSelectedKey(key);
    setAdhocMessage('');
    setVehicleNumber('');
    setArrivalDatetime('');
    setLoadingPlan([emptyRow()]);
    setError('');
    setSuccessMsg('');
  };

  // Loading plan helpers
  const updateRow = (i, field, val) =>
    setLoadingPlan(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const addRow    = () => setLoadingPlan(prev => [...prev, emptyRow()]);
  const removeRow = i  => setLoadingPlan(prev => prev.filter((_, idx) => idx !== i));

  const handleSendClick = () => {
    setError('');
    if (!sellerInfo?.whatsapp_number) return setError('Seller WhatsApp number not registered.');
    if (!selectedKey)                 return setError('Please select a template.');
    if (selectedKey === 'adhoc' && !adhocMessage.trim()) return setError('Message is required for Adhoc template.');
    if (selectedKey === 'shipment_planned') {
      if (!vehicleNumber)   return setError('Vehicle number is required for T3.');
      if (!arrivalDatetime) return setError('Arrival date/time is required for T3.');
    }
    if (!preview.trim()) return setError('Message preview is empty.');
    setShowConfirm(true);
  };

  const confirmSend = async () => {
    setSending(true);
    setError('');
    try {
      await api.post('/whatsapp/send', {
        to:        sellerInfo.whatsapp_number,
        message:   preview,
        template_id: selectedKey,
        po_id:     po.purchaseorder_id,
        po_number: po.purchaseorder_number,
        vendor_id: po.vendor_id,
      });
      setShowConfirm(false);
      setSuccessMsg(`Message sent to ${sellerInfo.name || sellerInfo.company} successfully.`);
      setTimeout(() => { onSent?.(); onClose(); }, 1800);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send message. Please try again.');
      setShowConfirm(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#25D366' }}>
                <WhatsAppIcon size={16} color="white" />
              </div>
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Send WhatsApp Message</h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

            {/* To */}
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">To</label>
              <p className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-200">
                {sellerInfo
                  ? `${sellerInfo.name || sellerInfo.company}${sellerInfo.whatsapp_number ? ` (${sellerInfo.whatsapp_number})` : ' — no number'}`
                  : po.vendor_name || 'Unknown vendor'}
              </p>
              {!sellerInfo?.whatsapp_number && (
                <p className="mt-0.5 text-xs text-red-500">Seller WhatsApp number not registered.</p>
              )}
            </div>

            {/* PO reference */}
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Purchase Order</label>
              <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{po.purchaseorder_number}</p>
            </div>

            {/* Template select */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Select Template <span className="text-red-500">*</span>
              </label>
              <select
                className="input w-full"
                value={selectedKey}
                onChange={e => handleTemplateChange(e.target.value)}
              >
                <option value="">— Choose a template —</option>
                {TEMPLATES.map(t => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Custom message (prepended to template) */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Custom Message <span className="font-normal normal-case text-gray-400">— optional, prepended</span>
              </label>
              <textarea
                className="input w-full resize-none"
                rows={3}
                maxLength={500}
                placeholder="Type a custom message to prepend..."
                value={customText}
                onChange={e => setCustomText(e.target.value)}
              />
              <p className="text-xs text-gray-400 text-right mt-0.5">{customText.length}/500</p>
            </div>

            {/* ─── T3: Shipment Planned extra fields ─────────────────────────── */}
            {selectedKey === 'shipment_planned' && (
              <div className="space-y-3 rounded-lg bg-gray-50 dark:bg-gray-700/40 p-4 border border-gray-100 dark:border-gray-700">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Shipment Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Vehicle Number</label>
                    <input
                      type="text"
                      className="input w-full"
                      placeholder="e.g., MH01AB1234"
                      value={vehicleNumber}
                      onChange={e => setVehicleNumber(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Arrival Date & Time</label>
                    <input
                      type="datetime-local"
                      className="input w-full"
                      value={arrivalDatetime}
                      onChange={e => setArrivalDatetime(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Loading Plan (optional)</label>
                    <button onClick={addRow} className="flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline">
                      <Plus className="h-3 w-3" /> Add item
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {loadingPlan.map((row, i) => (
                      <div key={i} className="grid grid-cols-[1fr_80px_120px_28px] gap-1.5 items-center">
                        <input type="text" className="input text-xs" placeholder="Item name"
                          value={row.itemName} onChange={e => updateRow(i, 'itemName', e.target.value)} />
                        <input type="text" className="input text-xs" placeholder="Qty"
                          value={row.qty} onChange={e => updateRow(i, 'qty', e.target.value)} />
                        <input type="text" className="input text-xs" placeholder="Vehicle#"
                          value={row.vehicleNo} onChange={e => updateRow(i, 'vehicleNo', e.target.value)} />
                        <button onClick={() => removeRow(i)} disabled={loadingPlan.length === 1}
                          className="text-red-400 hover:text-red-600 disabled:opacity-30">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ─── T6: Adhoc message field ────────────────────────────────────── */}
            {selectedKey === 'adhoc' && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Message <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="input w-full resize-none"
                  rows={4}
                  maxLength={1000}
                  placeholder="Type your message here..."
                  value={adhocMessage}
                  onChange={e => setAdhocMessage(e.target.value)}
                />
                <p className="text-xs text-gray-400 text-right mt-0.5">{adhocMessage.length}/1000</p>
              </div>
            )}

            {/* Preview */}
            {preview && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Preview
                </label>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 p-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                  {preview}
                </div>
              </div>
            )}

            {error      && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {successMsg && <p className="text-sm text-green-600 dark:text-green-400 font-medium">{successMsg}</p>}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100 dark:border-gray-700 shrink-0">
            <button onClick={onClose} className="btn-outline" disabled={sending}>Cancel</button>
            <button
              onClick={handleSendClick}
              disabled={sending || !selectedKey || !sellerInfo?.whatsapp_number}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold transition-opacity disabled:opacity-50"
              style={{ background: '#25D366' }}
            >
              <MessageCircle className="h-4 w-4" />
              Send on WhatsApp
            </button>
          </div>
        </div>
      </div>

      {/* Confirm dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2">Confirm Send</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Send this message to <strong>{sellerInfo?.name || sellerInfo?.company || po.vendor_name}</strong> on WhatsApp?
            </p>
            <div className="flex items-center justify-end gap-3 mt-5">
              <button onClick={() => setShowConfirm(false)} className="btn-outline" disabled={sending}>Cancel</button>
              <button
                onClick={confirmSend}
                disabled={sending}
                className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 transition-opacity"
                style={{ background: '#25D366' }}
              >
                {sending ? 'Sending...' : 'Yes, Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
