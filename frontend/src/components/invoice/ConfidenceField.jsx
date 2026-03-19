import React from 'react';
import { AlertTriangle, AlertCircle, Pencil } from 'lucide-react';

/**
 * ConfidenceField
 *
 * Wraps any <input> or <select> child and applies confidence-based border/bg/label styling.
 *
 * The wrapper div owns the border; the child <input> should use:
 *   className="input border-0 focus:ring-0 bg-transparent"
 * to strip the .input class's built-in border so they don't double up.
 *
 * Props:
 *   label          string    — field label text
 *   confidence     'high' | 'medium' | 'low' | null
 *   required       boolean   — appends * to label, triggers auto-focus on low
 *   manuallyEdited boolean   — overrides confidence display with pencil indicator
 *   onFocus        () => void — called when the wrapper is focused (for PDF sync)
 *   id             string    — for label htmlFor
 *   readOnly       boolean   — if true, no confidence dot shown (system-populated fields)
 *   children       ReactNode — the actual <input> / <select>
 */
export default function ConfidenceField({
  label,
  confidence,
  required = false,
  manuallyEdited = false,
  onFocus,
  id,
  readOnly = false,
  children,
}) {
  const level = readOnly
    ? 'none'
    : manuallyEdited
    ? 'manual'
    : (confidence || 'low').toLowerCase();

  // ── Border + background on the wrapper ─────────────────────────────────────
  const wrapperBorder = {
    high:   'border-green-400 dark:border-green-600',
    medium: 'border-amber-400 dark:border-amber-500',
    low:    'border-red-400   dark:border-red-500',
    manual: 'border-gray-300  dark:border-gray-600',
    none:   'border-gray-300  dark:border-gray-600',
  }[level];

  const wrapperBg = {
    high:   '',
    medium: 'bg-amber-50/60 dark:bg-amber-900/20',
    low:    'bg-red-50/60   dark:bg-red-900/20',
    manual: '',
    none:   '',
  }[level];

  // ── Dot indicator ───────────────────────────────────────────────────────────
  const dotColor = {
    high:   'bg-green-500',
    medium: 'bg-amber-400',
    low:    'bg-red-500',
    manual: 'bg-gray-400',
    none:   '',
  }[level];

  // ── Tooltip ─────────────────────────────────────────────────────────────────
  const tooltip = {
    high:   'Auto-filled with high confidence',
    medium: 'Auto-filled — please verify',
    low:    'Extraction failed or low confidence — manual entry required',
    manual: 'Manually edited (original value from PDF)',
    none:   '',
  }[level];

  const isIssue = level === 'low' || level === 'medium';

  return (
    <div>
      {/* Label row */}
      <div className="flex items-center gap-1.5 mb-1">
        {level !== 'none' && (
          <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
        )}
        {level === 'manual' && (
          <Pencil className="h-3 w-3 text-gray-400 -ml-0.5 shrink-0" />
        )}
        <label htmlFor={id} className="label mb-0">
          {label}{required ? ' *' : ''}
        </label>
        {level === 'medium' && (
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        )}
        {level === 'low' && (
          <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
        )}
      </div>

      {/* Wrapper div owns the border */}
      <div
        className={`rounded-lg border ${wrapperBorder} ${wrapperBg} focus-within:ring-1 focus-within:ring-offset-0 ${
          level === 'high'   ? 'focus-within:ring-green-400 dark:focus-within:ring-green-600' :
          level === 'medium' ? 'focus-within:ring-amber-400 dark:focus-within:ring-amber-500' :
          level === 'low'    ? 'focus-within:ring-red-400   dark:focus-within:ring-red-500'   :
          'focus-within:ring-brand-500'
        } transition-colors`}
        title={tooltip}
        onFocus={onFocus}
        data-confidence-issue={isIssue ? 'true' : undefined}
      >
        {children}
      </div>
    </div>
  );
}
