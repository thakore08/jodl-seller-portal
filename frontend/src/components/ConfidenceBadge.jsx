import React from 'react';

const CONFIDENCE_STYLES = {
  high:   'bg-green-100  text-green-800  dark:bg-green-900/30  dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  low:    'bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-400',
};

const CONFIDENCE_LABELS = {
  high:   'High',
  medium: 'Medium',
  low:    'Low',
};

/**
 * ConfidenceBadge — displays extraction confidence (high / medium / low).
 * Follows the same pattern as StatusBadge.jsx.
 *
 * Props:
 *   confidence  'high' | 'medium' | 'low'
 */
export default function ConfidenceBadge({ confidence }) {
  const key = (confidence || 'low').toLowerCase();
  const cls = CONFIDENCE_STYLES[key] || CONFIDENCE_STYLES.low;
  const lbl = CONFIDENCE_LABELS[key] || confidence || 'Low';
  return <span className={`badge ${cls}`}>{lbl}</span>;
}
