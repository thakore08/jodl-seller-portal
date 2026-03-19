import React from 'react';

const STATUS_STYLES = {
  // ── PO / general ──────────────────────────────────────────────────────────
  open:           'bg-yellow-100  text-yellow-800  dark:bg-yellow-900/30  dark:text-yellow-400',
  pending:        'bg-yellow-100  text-yellow-800  dark:bg-yellow-900/30  dark:text-yellow-400',
  draft:          'bg-gray-100    text-gray-700    dark:bg-gray-700       dark:text-gray-300',
  billed:         'bg-blue-100    text-blue-800    dark:bg-blue-900/30    dark:text-blue-400',
  paid:           'bg-green-100   text-green-700   dark:bg-green-900/30   dark:text-green-400',
  cancelled:      'bg-red-100     text-red-700     dark:bg-red-900/30     dark:text-red-400',
  rejected:       'bg-red-100     text-red-700     dark:bg-red-900/30     dark:text-red-400',
  accepted:       'bg-green-100   text-green-700   dark:bg-green-900/30   dark:text-green-400',
  sent:           'bg-green-100   text-green-700   dark:bg-green-900/30   dark:text-green-400',

  // ── Extended PO local statuses ────────────────────────────────────────────
  in_production:  'bg-purple-100  text-purple-800  dark:bg-purple-900/30  dark:text-purple-400',
  dispatched:     'bg-indigo-100  text-indigo-800  dark:bg-indigo-900/30  dark:text-indigo-400',
  invoiced:       'bg-blue-100    text-blue-800    dark:bg-blue-900/30    dark:text-blue-400',
  closed:         'bg-gray-200    text-gray-600    dark:bg-gray-700       dark:text-gray-400',
  issued:         'bg-gray-100    text-gray-700    dark:bg-gray-700       dark:text-gray-300',

  // ── RTD (Ready-to-Dispatch) line item statuses ────────────────────────────
  rtd_pending:    'bg-gray-100    text-gray-600    dark:bg-gray-700       dark:text-gray-300',
  rtd_overdue:    'bg-red-100     text-red-700     dark:bg-red-900/30     dark:text-red-400',
  rtd_ready:      'bg-green-100   text-green-700   dark:bg-green-900/30   dark:text-green-400',
  rtd_dispatched: 'bg-teal-100    text-teal-700    dark:bg-teal-900/30    dark:text-teal-400',

  // ── Payment / invoice statuses (1.5) ──────────────────────────────────────
  disputed:       'bg-orange-100  text-orange-800  dark:bg-orange-900/30  dark:text-orange-400',
  partially_paid: 'bg-amber-100   text-amber-800   dark:bg-amber-900/30   dark:text-amber-400',
  unpaid:         'bg-red-100     text-red-700     dark:bg-red-900/30     dark:text-red-400',
  overdue:        'bg-red-100     text-red-700     dark:bg-red-900/30     dark:text-red-400',
  approved:       'bg-green-100   text-green-700   dark:bg-green-900/30   dark:text-green-400',
};

const STATUS_LABELS = {
  open:           'Open',
  pending:        'Pending',
  draft:          'Draft',
  billed:         'Billed',
  paid:           'Paid',
  cancelled:      'Cancelled',
  rejected:       'Rejected',
  accepted:       'Accepted',
  sent:           'Sent',
  in_production:  'In Production',
  dispatched:     'Dispatched',
  closed:         'Closed',
  issued:         'Issued',
  disputed:       'Disputed',
  partially_paid: 'Partially Paid',
  unpaid:         'Unpaid',
  overdue:        'Overdue',
  approved:       'Approved',
};

export default function StatusBadge({ status }) {
  const key = (status || '').toLowerCase();
  const cls = STATUS_STYLES[key] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  const lbl = STATUS_LABELS[key] || status || '—';
  return <span className={`badge ${cls}`}>{lbl}</span>;
}
