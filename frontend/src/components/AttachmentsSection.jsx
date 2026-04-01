/**
 * AttachmentsSection
 *
 * Always-visible section on the PO detail page showing two attachment slots:
 *   1. Purchase Bill (PDF uploaded by seller)
 *   2. Zoho Invoice (auto-generated when bill is uploaded against a linked SO)
 *
 * Props:
 *   po  — the full PO object; reads po.attachments.bill and po.attachments.invoice
 *         (populated by purchaseOrders.js mergeLocalStatus via poAttachments.js)
 */
import React from 'react';
import { FileText, Download } from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatSize(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTs(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

// ─── Single attachment row ────────────────────────────────────────────────────
function AttachRow({ label, att, downloadUrl }) {
  return (
    <div className="flex items-center gap-3 py-3 px-4 border-b last:border-b-0 border-gray-100 dark:border-gray-700">
      {/* Icon */}
      <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
        att ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
      }`}>
        <FileText className="h-4 w-4" />
      </div>

      {/* Label + metadata */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {label}
        </p>
        {att ? (
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
            {att.originalName || att.invoiceNumber || att.filename}
          </p>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic">
            {label === 'Purchase Bill' ? 'No purchase bill uploaded yet.' : 'Invoice not yet generated.'}
          </p>
        )}
        {att && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {[formatSize(att.size), formatTs(att.uploadedAt || att.createdAt)].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      {/* Download link */}
      {att && (
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-brand-200 dark:border-brand-700 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 transition-colors"
          title="Open PDF in new tab"
        >
          <Download className="h-3.5 w-3.5" />
          View
        </a>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AttachmentsSection({ po }) {
  if (!po?.purchaseorder_id) return null;

  const { bill, invoice } = po.attachments || {};
  const apiBase = import.meta.env.VITE_API_URL || '/api';
  const billUrl    = `${apiBase}/purchase-orders/${po.purchaseorder_id}/attachments/bill`;
  const invoiceUrl = `${apiBase}/purchase-orders/${po.purchaseorder_id}/attachments/invoice`;

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Attachments</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Purchase bill and Zoho invoice linked to this PO.
        </p>
      </div>

      <AttachRow label="Purchase Bill"  att={bill}    downloadUrl={billUrl} />
      <AttachRow label="Zoho Invoice"   att={invoice} downloadUrl={invoiceUrl} />
    </div>
  );
}
