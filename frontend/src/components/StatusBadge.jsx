import React from 'react';

const STATUS_STYLES = {
  open:       'bg-yellow-100 text-yellow-800',
  pending:    'bg-yellow-100 text-yellow-800',
  draft:      'bg-gray-100  text-gray-700',
  billed:     'bg-blue-100  text-blue-800',
  paid:       'bg-blue-100  text-blue-800',
  cancelled:  'bg-red-100   text-red-700',
  rejected:   'bg-red-100   text-red-700',
  accepted:   'bg-green-100 text-green-700',
  sent:       'bg-green-100 text-green-700',
};

const STATUS_LABELS = {
  open:       'Open',
  pending:    'Pending',
  draft:      'Draft',
  billed:     'Billed',
  paid:       'Paid',
  cancelled:  'Cancelled',
  rejected:   'Rejected',
  accepted:   'Accepted',
  sent:       'Sent',
};

export default function StatusBadge({ status }) {
  const key = (status || '').toLowerCase();
  const cls = STATUS_STYLES[key] || 'bg-gray-100 text-gray-700';
  const lbl = STATUS_LABELS[key] || status || '—';
  return <span className={`badge ${cls}`}>{lbl}</span>;
}
