import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle, XCircle, FileText,
  Calendar, Package, Truck, Factory,
  MapPin, User as UserIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import POStatusStepper from '../components/POStatusStepper';
import InvoiceSplitModal from '../components/InvoiceSplitModal';
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

// ─── Accept Modal ─────────────────────────────────────────────────────────────
function AcceptModal({ po, onClose, onAccept }) {
  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();

  const [dates, setDates] = useState(
    (po.line_items || []).map(item => ({
      item_id:       item.item_id,
      name:          item.name || item.description || '',
      quantity:      item.quantity,
      unit:          item.unit || '',
      expected_date: tomorrow,
    }))
  );
  const [loading, setLoading] = useState(false);

  const updateDate = (idx, value) =>
    setDates(prev => prev.map((d, i) => i === idx ? { ...d, expected_date: value } : d));

  const handleAccept = async () => {
    setLoading(true);
    await onAccept(dates);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Set the expected delivery date for each line item, then confirm acceptance.
      </p>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Item</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Qty</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 w-40">Expected Delivery</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {dates.map((item, idx) => (
              <tr key={idx}>
                <td className="px-3 py-2.5">
                  <p className="font-medium text-gray-800 dark:text-gray-200 leading-snug">{item.name || `Item ${idx + 1}`}</p>
                </td>
                <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {item.quantity} {item.unit}
                </td>
                <td className="px-3 py-2.5">
                  <input
                    type="date"
                    className="input py-1 text-xs text-right ml-auto w-full"
                    value={item.expected_date}
                    min={tomorrow}
                    onChange={e => updateDate(idx, e.target.value)}
                  />
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
            <><CheckCircle className="h-4 w-4" /> Confirm & Accept PO</>
          )}
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
  const [showAccept,  setShowAccept]  = useState(false);
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

  const handleAccept = async (lineItemDates) => {
    setShowAccept(false);
    await doAction(
      () => api.post(`/purchase-orders/${id}/accept`, { line_item_delivery_dates: lineItemDates }),
      'Purchase order accepted. You can now mark it as In Production.'
    );
  };
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
                <button onClick={() => setShowAccept(true)} disabled={acting} className="btn-success">
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

      {/* Invoice Split Modal */}
      <InvoiceSplitModal
        open={showInvoice}
        po={po}
        onClose={() => setShowInvoice(false)}
        onSuccess={() => {
          setShowInvoice(false);
          setActionMsg('Invoice posted to Zoho Books successfully!');
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
    </div>
  );
}
