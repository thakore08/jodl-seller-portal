import React, { useEffect, useState, useCallback } from 'react';
import { Bell, Send, Plus, Trash2, Sparkles } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

// ─── Template config ──────────────────────────────────────────────────────────
const TEMPLATES = [
  { key: 'po_issued',          label: 'T1: PO Issued',                  hasExtraFields: false },
  { key: 'material_readiness', label: 'T2: Material Readiness Status',   hasExtraFields: false },
  { key: 'shipment_planned',   label: 'T3: Shipment Planned Details',    hasExtraFields: true  },
  { key: 'update_invoice',     label: 'T4: Update Invoice',              hasExtraFields: false },
  { key: 'bill_payout',        label: 'T5: Bill Payout Details',         hasExtraFields: false },
  { key: 'adhoc',              label: 'T6: Adhoc Message',               hasExtraFields: true  },
];

// ─── Empty loading plan row ───────────────────────────────────────────────────
const emptyRow = () => ({ itemName: '', qty: '', vehicleNo: '' });

export default function AdminNotifications() {
  const { seller: me } = useAuth();
  const isJodlAdmin = me?.email === 'seller@demo.com' || me?.role === 'admin';

  // ── Dropdowns ──────────────────────────────────────────────────────────────
  const [sellers,      setSellers]      = useState([]);
  const [allPOs,       setAllPOs]       = useState([]);
  const [selectedSeller, setSelectedSeller] = useState('');
  const [selectedPO,     setSelectedPO]     = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');

  // ── T3 fields ──────────────────────────────────────────────────────────────
  const [vehicleNumber,   setVehicleNumber]   = useState('');
  const [arrivalDatetime, setArrivalDatetime] = useState('');
  const [loadingPlan,     setLoadingPlan]     = useState([emptyRow()]);

  // ── T6 field ───────────────────────────────────────────────────────────────
  const [adhocMessage, setAdhocMessage] = useState('');

  // ── UI state ───────────────────────────────────────────────────────────────
  const [sending,    setSending]    = useState(false);
  const [error,      setError]      = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // ── Load sellers list ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isJodlAdmin) return;
    api.get('/whatsapp/sellers')
      .then(({ data }) => setSellers(data.sellers || []))
      .catch(() => {});
  }, [isJodlAdmin]);

  // ── Load PO list ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isJodlAdmin) return;
    api.get('/purchase-orders')
      .then(({ data }) => setAllPOs(data.purchaseorders || []))
      .catch(() => {});
  }, [isJodlAdmin]);

  // ── Reset fields when template changes ────────────────────────────────────
  useEffect(() => {
    setVehicleNumber('');
    setArrivalDatetime('');
    setLoadingPlan([emptyRow()]);
    setAdhocMessage('');
    setError('');
    setSuccessMsg('');
  }, [selectedTemplate]);

  // ── Reset PO when seller changes ──────────────────────────────────────────
  useEffect(() => {
    setSelectedPO('');
    setError('');
    setSuccessMsg('');
  }, [selectedSeller]);

  // ── Derived: POs for selected seller ─────────────────────────────────────
  const sellerVendorId = sellers.find(s => s.id === selectedSeller)?.vendor_id;
  const filteredPOs = sellerVendorId
    ? allPOs.filter(po => po.vendor_id === sellerVendorId)
    : allPOs;

  // ── Loading plan helpers ──────────────────────────────────────────────────
  const updateRow = (i, field, val) => {
    setLoadingPlan(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  };
  const addRow    = () => setLoadingPlan(prev => [...prev, emptyRow()]);
  const removeRow = i  => setLoadingPlan(prev => prev.filter((_, idx) => idx !== i));

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    setError('');
    setSuccessMsg('');
    if (!selectedTemplate) return setError('Please select a template.');
    if (!selectedPO)       return setError('Please select a PO.');

    const payload = {};
    if (selectedTemplate === 'shipment_planned') {
      if (!vehicleNumber)    return setError('Vehicle number is required for T3.');
      if (!arrivalDatetime)  return setError('Arrival date/time is required for T3.');
      payload.vehicleNumber   = vehicleNumber;
      payload.arrivalDatetime = arrivalDatetime;
      payload.loadingPlan     = loadingPlan.filter(r => r.itemName || r.qty || r.vehicleNo);
    }
    if (selectedTemplate === 'adhoc') {
      if (!adhocMessage.trim()) return setError('Message is required for Adhoc template.');
      payload.message = adhocMessage.trim();
    }

    setSending(true);
    try {
      const body = {
        templateKey: selectedTemplate,
        poId:        selectedPO,
        sellerId:    selectedSeller || undefined,
        payload,
      };
      const { data } = await api.post('/admin/notifications/send', body);
      setSuccessMsg(`Sent! WhatsApp message ID: ${data.messageId || 'N/A'} → ${data.sentTo || ''}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send notification.');
    } finally {
      setSending(false);
    }
  };

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!isJodlAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-sm text-gray-500 dark:text-gray-400">
        <Bell className="h-10 w-10 mb-4 opacity-30" />
        <p>This page is only accessible to JODL administrators.</p>
      </div>
    );
  }

  const templateDef = TEMPLATES.find(t => t.key === selectedTemplate);

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Hero */}
      <div className="page-hero">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="hero-title">Send Notification</h2>
            <p className="hero-subtitle">Manually trigger any of the 6 WhatsApp notification templates.</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="chip-soft">Admin Only</span>
              <span className="chip-soft">WhatsApp Cloud API</span>
            </div>
          </div>
          <span className="status-live text-white/90">
            <Sparkles className="h-3.5 w-3.5" />
            Active
          </span>
        </div>
      </div>

      {/* Form card */}
      <div className="card p-5 space-y-4">

        {/* Seller select */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Seller <span className="font-normal normal-case text-gray-400">(optional — narrows PO list)</span>
          </label>
          <select
            className="input w-full"
            value={selectedSeller}
            onChange={e => setSelectedSeller(e.target.value)}
          >
            <option value="">— All Sellers —</option>
            {sellers.map(s => (
              <option key={s.id} value={s.id}>
                {s.name || s.company} {s.whatsapp_number ? `(${s.whatsapp_number})` : '(no number)'}
              </option>
            ))}
          </select>
        </div>

        {/* PO select */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Purchase Order <span className="text-red-500">*</span>
          </label>
          <select
            className="input w-full"
            value={selectedPO}
            onChange={e => setSelectedPO(e.target.value)}
          >
            <option value="">— Select PO —</option>
            {filteredPOs.map(po => (
              <option key={po.purchaseorder_id} value={po.purchaseorder_id}>
                {po.purchaseorder_number}
                {po.vendor_name ? ` — ${po.vendor_name}` : ''}
                {po.status ? ` [${po.status}]` : ''}
              </option>
            ))}
          </select>
          {filteredPOs.length === 0 && allPOs.length > 0 && selectedSeller && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">No POs found for this seller.</p>
          )}
        </div>

        {/* Template select */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Template <span className="text-red-500">*</span>
          </label>
          <select
            className="input w-full"
            value={selectedTemplate}
            onChange={e => setSelectedTemplate(e.target.value)}
          >
            <option value="">— Select Template —</option>
            {TEMPLATES.map(t => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* ─── T3: Shipment Planned ─────────────────────────────────────────── */}
        {selectedTemplate === 'shipment_planned' && (
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
                    <input
                      type="text"
                      className="input text-xs"
                      placeholder="Item name"
                      value={row.itemName}
                      onChange={e => updateRow(i, 'itemName', e.target.value)}
                    />
                    <input
                      type="text"
                      className="input text-xs"
                      placeholder="Qty"
                      value={row.qty}
                      onChange={e => updateRow(i, 'qty', e.target.value)}
                    />
                    <input
                      type="text"
                      className="input text-xs"
                      placeholder="Vehicle#"
                      value={row.vehicleNo}
                      onChange={e => updateRow(i, 'vehicleNo', e.target.value)}
                    />
                    <button
                      onClick={() => removeRow(i)}
                      disabled={loadingPlan.length === 1}
                      className="text-red-400 hover:text-red-600 disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── T6: Adhoc ────────────────────────────────────────────────────── */}
        {selectedTemplate === 'adhoc' && (
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

        {/* Error / Success */}
        {error      && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {successMsg && <p className="text-sm text-green-600 dark:text-green-400 font-medium">{successMsg}</p>}

        {/* Send button */}
        <div className="flex justify-end pt-1">
          <button
            onClick={handleSend}
            disabled={sending || !selectedPO || !selectedTemplate}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 transition-opacity"
            style={{ background: '#25D366' }}
          >
            <Send className="h-4 w-4" />
            {sending ? 'Sending...' : 'Send Notification'}
          </button>
        </div>
      </div>
    </div>
  );
}
