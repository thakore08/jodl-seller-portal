import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle, FileText,
  Calendar, Package,
  MapPin, User as UserIcon, ClipboardList, Sparkles,
} from 'lucide-react';
import { format } from 'date-fns';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import POStatusStepper from '../components/POStatusStepper';
import PurchaseBillUploadModal from '../components/PurchaseBillUploadModal';
import RTDLineItemsPanel from '../components/RTDLineItemsPanel';
import ActivityLogDrawer from '../components/ActivityLogDrawer';
import { useAuth } from '../context/AuthContext';

// ─── Helper: format Zoho address object (or plain string) ────────────────────
function formatAddress(addr) {
  if (!addr) return null;
  if (typeof addr === 'string') return addr.trim() || null;
  const lines = [
    addr.attention,
    addr.address,
    addr.street2,
    [addr.city, addr.state, addr.zip].filter(Boolean).join(', '),
    addr.country,
  ].filter(Boolean);
  return lines.length ? lines.join('\n') : null;
}

// ─── Helper: derive effective status from PO ─────────────────────────────────
// Zoho status model:  draft / issued / open / billed / cancelled
// Local augmentation: local_status = 'accepted' | 'rejected' | 'dispatched'
//
// RULE: local_status is ALWAYS checked first.
// Zoho 'open' is intentionally mapped to 'issued' (not 'accepted') because
// portal acceptance is explicit and separate from Zoho's own status transitions.
function getEffectiveStatus(po) {
  if (!po) return null;
  if (po.local_status === 'rejected')   return 'rejected';
  if (po.local_status === 'dispatched') return 'dispatched';
  if (po.local_status === 'accepted')   return 'accepted';
  if (po.status === 'cancelled') return 'rejected';
  if (po.status === 'billed')    return 'invoiced';
  if (po.status === 'open')      return 'issued';   // requires explicit portal acceptance
  if (po.status === 'issued')    return 'issued';
  return null; // draft or unknown — not synced
}

// ─── Helper: determine the single contextual action ──────────────────────────
function getContextualAction(po, effectiveStatus, isOps, isFinance) {
  if (!po) return null;
  if (effectiveStatus === 'issued'    && isOps)     return 'accept';
  if (effectiveStatus === 'accepted'  && isFinance) return 'create_invoice';
  if (effectiveStatus === 'dispatched' && isFinance && po.status !== 'billed') return 'create_invoice';
  return null;
}

// ─── Reject Modal ────────────────────────────────────────────────────────────
function RejectModal({ onClose, onReject }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const isValid = reason.trim().length >= 10;

  const handleReject = async () => {
    setTouched(true);
    if (!isValid) return;
    setLoading(true);
    await onReject(reason.trim());
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Please provide a reason for rejecting this purchase order.
      </p>
      <div>
        <label className="label">
          Reason <span className="text-red-500">*</span>
        </label>
        <textarea
          className={`input h-24 resize-none ${touched && !isValid ? 'border-red-400 dark:border-red-600' : ''}`}
          placeholder="e.g. Pricing discrepancy, cannot fulfill quantities…"
          value={reason}
          onChange={e => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
        />
        <div className="flex items-center justify-between mt-1">
          {touched && !isValid ? (
            <p className="text-xs text-red-500 dark:text-red-400">Minimum 10 characters required</p>
          ) : (
            <span />
          )}
          <p className={`text-xs ml-auto ${reason.trim().length < 10 ? 'text-gray-400' : 'text-green-600 dark:text-green-400'}`}>
            {reason.trim().length} / 10 min
          </p>
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <button onClick={onClose} className="btn-outline flex-1">Cancel</button>
        <button
          onClick={handleReject}
          disabled={loading}
          className="btn-danger flex-1"
        >
          {loading ? 'Rejecting…' : 'Reject PO'}
        </button>
      </div>
    </div>
  );
}

// ─── Accept Modal ─────────────────────────────────────────────────────────────
// Collects per-line-item Ready-to-Dispatch ETAs (must all be >= today)
function AcceptModal({ po, onClose, onAccept }) {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();

  const [etas, setEtas] = useState(
    (po.line_items || []).map(() => tomorrow)
  );
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const updateEta = (idx, value) =>
    setEtas(prev => prev.map((e, i) => (i === idx ? value : e)));

  const etaErrors = etas.map(eta => (!eta || eta < today ? 'ETA must be today or later' : null));
  const hasErrors = etaErrors.some(Boolean);

  const handleAccept = async () => {
    setSubmitted(true);
    if (hasErrors) return;
    setLoading(true);
    const rtd_etas = (po.line_items || []).map((_, idx) => ({
      item_index: idx,
      eta: etas[idx],
    }));
    await onAccept(rtd_etas);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Set the <strong>Ready to Dispatch ETA</strong> for each line item, then confirm acceptance.
      </p>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Item</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Qty</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 w-44">RTD ETA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {(po.line_items || []).map((item, idx) => (
              <tr key={idx}>
                <td className="px-3 py-2.5">
                  <p className="font-medium text-gray-800 dark:text-gray-200 leading-snug">
                    {item.name || `Item ${idx + 1}`}
                  </p>
                </td>
                <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {item.quantity} {item.unit}
                </td>
                <td className="px-3 py-2.5">
                  <input
                    type="date"
                    className={`input py-1 text-xs w-full ${submitted && etaErrors[idx] ? 'border-red-400 dark:border-red-600' : ''}`}
                    value={etas[idx]}
                    min={today}
                    onChange={e => updateEta(idx, e.target.value)}
                  />
                  {submitted && etaErrors[idx] && (
                    <p className="text-[10px] text-red-500 mt-0.5">{etaErrors[idx]}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3 pt-1">
        <button onClick={onClose} className="btn-outline flex-1">Cancel</button>
        <button onClick={handleAccept} disabled={loading} className="btn-success flex-1">
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Accepting…
            </span>
          ) : (
            <><CheckCircle className="h-4 w-4" /> Confirm &amp; Accept PO</>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main PO Detail page ─────────────────────────────────────────────────────
export default function PODetail() {
  const { id }      = useParams();
  const { hasRole } = useAuth();

  const [po,           setPO]           = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [actionMsg,    setActionMsg]    = useState('');
  const [showPurchaseBill, setShowPurchaseBill] = useState(false);
  const [showAccept,   setShowAccept]   = useState(false);
  const [showReject,   setShowReject]   = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [acting,       setActing]       = useState(false);

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

  // ── Generic action wrapper ──────────────────────────────────────────────────
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

  // ── PO lifecycle actions ────────────────────────────────────────────────────
  const handleAccept = async (rtd_etas) => {
    setShowAccept(false);
    await doAction(
      () => api.post(`/purchase-orders/${id}/accept`, { rtd_etas }),
      'Purchase order accepted. RTD tracking is now active for all line items.'
    );
  };

  const handleReject = async (reason) => {
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

  // ── RTD actions ─────────────────────────────────────────────────────────────
  const handleMarkReady = async (itemIndex) => {
    await doAction(
      () => api.post(`/purchase-orders/${id}/rtd/mark-ready`, { item_index: itemIndex }),
      'Line item marked as Ready to Dispatch.'
    );
  };

  const handleUndoReady = async (itemIndex) => {
    await doAction(
      () => api.post(`/purchase-orders/${id}/rtd/undo-ready`, { item_index: itemIndex }),
      'Ready status reverted to Pending.'
    );
  };

  const handleReviseEta = async (itemIndex, newEta) => {
    await doAction(
      () => api.patch(`/purchase-orders/${id}/rtd/revised-eta`, { item_index: itemIndex, new_eta: newEta }),
      'RTD ETA updated.'
    );
  };

  // ── Derived state ───────────────────────────────────────────────────────────
  const effectiveStatus  = getEffectiveStatus(po);
  const isOpsRole        = hasRole('seller_admin', 'operations_user');
  const isFinanceRole    = hasRole('seller_admin', 'finance_user');
  const contextualAction = getContextualAction(po, effectiveStatus, isOpsRole, isFinanceRole);
  const showRTDPanel     = ['accepted', 'dispatched', 'invoiced'].includes(effectiveStatus);
  const rtdReadOnly      = effectiveStatus === 'invoiced';

  // ── Loading / error states ──────────────────────────────────────────────────
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
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          {error}
        </div>
      </div>
    );
  }

  if (!po) return null;

  // Suppress pages for unsynced POs (draft, unknown)
  if (effectiveStatus === null) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Link to="/purchase-orders" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft className="h-4 w-4" /> Back to Purchase Orders
        </Link>
        <div className="card p-6 text-center text-gray-400 dark:text-gray-500">
          <p className="text-sm">This purchase order is not yet synced to the seller portal.</p>
        </div>
      </div>
    );
  }

  const deliveryAddr = formatAddress(po.delivery_address);
  const buyerName    = typeof po.customer_name === 'string' ? po.customer_name : null;

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="page-hero">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="hero-title">Purchase Order Control</h2>
            <p className="hero-subtitle">Validate line items, update RTD status, and progress to purchase bill upload.</p>
            <div className="mt-3">
              <span className="chip-soft">PO {po.purchaseorder_number}</span>
            </div>
          </div>
          <span className="status-live text-white/90">
            <Sparkles className="h-3.5 w-3.5" />
            {effectiveStatus || 'Issued'}
          </span>
        </div>
      </div>

      {/* Back */}
      <Link
        to="/purchase-orders"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Purchase Orders
      </Link>

      {/* Feedback banners */}
      {actionMsg && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700 flex items-center gap-2 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
          <CheckCircle className="h-4 w-4 shrink-0" /> {actionMsg}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          {error}
        </div>
      )}

      {/* ── Header card ──────────────────────────────────────────────────────── */}
      <div className="card p-4 sm:p-6 space-y-4">

        {/* Row 1: PO number + status badge + contextual action */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-brand-600 dark:text-brand-400">
                {po.purchaseorder_number}
              </h1>
              <StatusBadge status={effectiveStatus} />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{po.vendor_name || 'JODL'}</p>
          </div>

          <div className="flex w-full flex-col items-start gap-1.5 sm:w-auto sm:items-end shrink-0">
            {/* Primary contextual action */}
            {contextualAction === 'accept' && (
              <button
                onClick={() => setShowAccept(true)}
                disabled={acting}
                className="btn-success"
              >
                <CheckCircle className="h-4 w-4" />
                {acting ? 'Processing…' : 'Accept PO'}
              </button>
            )}
            {contextualAction === 'create_invoice' && (
              <button
                onClick={() => setShowPurchaseBill(true)}
                className="btn-primary"
              >
                <FileText className="h-4 w-4" /> Upload Purchase Bill
              </button>
            )}

            {/* Reject — shown as text link only when PO is issued */}
            {effectiveStatus === 'issued' && isOpsRole && (
              <button
                onClick={() => setShowReject(true)}
                disabled={acting}
                className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 underline-offset-2 hover:underline"
              >
                Reject PO
              </button>
            )}

            {/* Activity log link — always visible */}
            <button
              onClick={() => setShowActivity(true)}
              className="text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 underline-offset-2 hover:underline flex items-center gap-1"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              View Activity Log
            </button>
          </div>
        </div>

        {/* Status stepper */}
        <div className="pt-1 pb-1">
          <POStatusStepper effectiveStatus={effectiveStatus} />
        </div>

        {/* Row 2: Metadata */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 border-t border-gray-100 dark:border-gray-700 pt-4">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">PO Date</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {po.date ? format(new Date(po.date), 'dd MMM yyyy') : '—'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Expected Delivery</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {po.expected_delivery_date ? format(new Date(po.expected_delivery_date), 'dd MMM yyyy') : '—'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Package className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Total Amount</p>
              <p className="font-bold text-brand-600 dark:text-brand-400">
                {po.currency_code} {Number(po.total || 0).toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </div>

        {/* Buyer / Delivery address */}
        {(buyerName || deliveryAddr) && (
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
        )}

        {po.notes && (
          <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Notes</p>
            <p className="text-sm text-gray-600 dark:text-gray-300">{po.notes}</p>
          </div>
        )}
      </div>

      {/* ── RTD Line Items Panel ──────────────────────────────────────────────── */}
      {showRTDPanel && (
        <RTDLineItemsPanel
          po={po}
          rtdData={po.rtd_data || {}}
          onMarkReady={handleMarkReady}
          onUndoReady={handleUndoReady}
          onReviseEta={handleReviseEta}
          readOnly={rtdReadOnly}
        />
      )}

      {/* ── Standard Line Items table (shown when RTD panel is NOT shown) ──────── */}
      {!showRTDPanel && (
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Line Items</h2>
          </div>

          {/* Mobile cards */}
          <ul className="divide-y divide-gray-100 dark:divide-gray-700 sm:hidden">
            {(po.line_items || []).map((item, idx) => (
              <li key={idx} className="px-4 py-3 space-y-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.name}</p>
                {item.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{item.description}</p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-400 pt-1">
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
                    <td className="table-td text-gray-500 dark:text-gray-400 max-w-xs truncate hidden md:table-cell">
                      {item.description || '—'}
                    </td>
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
                  <td colSpan={5} className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Total
                  </td>
                  <td className="px-4 py-3 text-right text-base font-bold text-brand-600 dark:text-brand-400 whitespace-nowrap">
                    {po.currency_code} {Number(po.total || 0).toLocaleString('en-IN')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────────── */}

      {/* Purchase Bill Upload Modal */}
      <PurchaseBillUploadModal
        open={showPurchaseBill}
        po={po}
        onClose={() => setShowPurchaseBill(false)}
        onSuccess={() => {
          setShowPurchaseBill(false);
          setActionMsg('Purchase bill submitted successfully!');
          loadPO();
        }}
      />

      {/* Accept Modal */}
      <Modal
        open={showAccept}
        onClose={() => setShowAccept(false)}
        title={`Accept PO — ${po.purchaseorder_number}`}
        maxWidth="max-w-xl"
      >
        <AcceptModal
          po={po}
          onClose={() => setShowAccept(false)}
          onAccept={handleAccept}
        />
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

      {/* Activity Log Drawer */}
      <ActivityLogDrawer
        open={showActivity}
        onClose={() => setShowActivity(false)}
        po={po}
      />
    </div>
  );
}
