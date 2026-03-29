import React, { useState, useEffect } from 'react';
import { X, MessageCircle } from 'lucide-react';
import api from '../services/api';

// ─── WhatsApp SVG icon ────────────────────────────────────────────────────────
function WhatsAppIcon({ size = 20, color = '#25D366' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ─── Message templates ────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    id: 'post_acceptance',
    label: 'Post Acceptance Message',
    body: ({ seller_name, po_number }) =>
      `Dear ${seller_name},\n\nYour Purchase Order #${po_number} has been accepted successfully.\n\nPlease proceed with the next steps as discussed.\n\nThank you,\nTeam JODL`,
  },
  {
    id: 'payment_reminder',
    label: 'Payment Reminder',
    body: ({ seller_name, po_number }) =>
      `Dear ${seller_name},\n\nThis is a reminder regarding the pending payment for Purchase Order #${po_number}.\n\nKindly process the payment at your earliest convenience.\n\nThank you,\nTeam JODL`,
  },
  {
    id: 'shipment_update',
    label: 'Shipment Update',
    body: ({ seller_name, po_number }) =>
      `Dear ${seller_name},\n\nWe wanted to update you on the shipment status for Purchase Order #${po_number}.\n\nPlease log in to the JODL Seller Portal for full details.\n\nThank you,\nTeam JODL`,
  },
  {
    id: 'order_confirmation',
    label: 'Order Confirmation',
    body: ({ seller_name, po_number }) =>
      `Dear ${seller_name},\n\nThis message confirms your Purchase Order #${po_number} with JODL.\n\nPlease review the order details and confirm your acceptance.\n\nThank you,\nTeam JODL`,
  },
  {
    id: 'document_request',
    label: 'Document Request',
    body: ({ seller_name, po_number }) =>
      `Dear ${seller_name},\n\nWe require certain documents for Purchase Order #${po_number}.\n\nPlease upload the necessary documents via the JODL Seller Portal.\n\nThank you,\nTeam JODL`,
  },
  {
    id: 'custom_only',
    label: 'Custom Only',
    body: () => '',
  },
];

// ─── Modal component ──────────────────────────────────────────────────────────
export default function WhatsAppMessageModal({ po, sellerInfo, onClose, onSent }) {
  const [customText,          setCustomText]          = useState('');
  const [selectedTemplateId,  setSelectedTemplateId]  = useState('');
  const [preview,             setPreview]             = useState('');
  const [sending,             setSending]             = useState(false);
  const [error,               setError]               = useState('');
  const [showConfirm,         setShowConfirm]         = useState(false);
  const [successMsg,          setSuccessMsg]          = useState('');

  const template = TEMPLATES.find(t => t.id === selectedTemplateId);

  // Rebuild preview whenever custom text or template changes
  useEffect(() => {
    const vars = {
      seller_name: sellerInfo?.name || sellerInfo?.company || po.vendor_name || 'Seller',
      po_number:   po.purchaseorder_number || po.purchaseorder_id,
    };
    const templateBody = template ? template.body(vars) : '';
    const parts = [customText.trim(), templateBody].filter(Boolean);
    setPreview(parts.join('\n\n'));
  }, [customText, template, sellerInfo, po]);

  const handleSendClick = () => {
    setError('');
    if (!sellerInfo?.whatsapp_number) {
      setError('Seller WhatsApp number not registered.');
      return;
    }
    if (!customText.trim() && !selectedTemplateId) {
      setError('Please enter a custom message or select a template.');
      return;
    }
    if (!preview.trim()) {
      setError('Message preview is empty.');
      return;
    }
    setShowConfirm(true);
  };

  const confirmSend = async () => {
    setSending(true);
    setError('');
    try {
      await api.post('/whatsapp/send', {
        to:          sellerInfo.whatsapp_number,
        message:     preview,
        template_id: selectedTemplateId || 'custom_only',
        po_id:       po.purchaseorder_id,
        po_number:   po.purchaseorder_number,
        vendor_id:   po.vendor_id,
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
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

            {/* Custom message */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Custom Message <span className="font-normal normal-case">— optional</span>
              </label>
              <textarea
                className="input w-full resize-none"
                rows={3}
                maxLength={500}
                placeholder="Type a custom message..."
                value={customText}
                onChange={e => setCustomText(e.target.value)}
              />
              <p className="text-xs text-gray-400 text-right mt-0.5">{customText.length}/500</p>
            </div>

            {/* Template select */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Select Template
              </label>
              <select
                className="input w-full"
                value={selectedTemplateId}
                onChange={e => setSelectedTemplateId(e.target.value)}
              >
                <option value="">— Choose a template —</option>
                {TEMPLATES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Preview */}
            {preview && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Preview
                </label>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 p-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">
                  {preview}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {successMsg && (
              <p className="text-sm text-green-600 dark:text-green-400 font-medium">{successMsg}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100 dark:border-gray-700 shrink-0">
            <button onClick={onClose} className="btn-outline" disabled={sending}>Cancel</button>
            <button
              onClick={handleSendClick}
              disabled={sending || (!customText.trim() && !selectedTemplateId) || !sellerInfo?.whatsapp_number}
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
