import React from 'react';
import { Check } from 'lucide-react';

/**
 * POStatusStepper — horizontal (desktop) / vertical (mobile) step progress.
 *
 * Props:
 *   effectiveStatus — one of: 'issued' | 'accepted' | 'in_production' | 'dispatched' | 'closed' | 'cancelled'
 *
 * The stepper renders 5 linear steps:
 *   Issued → Accepted → In Production → Dispatched → Closed
 *
 * If status is 'cancelled', the stepper shows a standalone cancelled state.
 */

const STEPS = [
  { key: 'issued',        label: 'Issued' },
  { key: 'accepted',      label: 'Accepted' },
  { key: 'in_production', label: 'In Production' },
  { key: 'dispatched',    label: 'Dispatched' },
  { key: 'closed',        label: 'Closed' },
];

const STEP_ORDER = STEPS.map(s => s.key);

function getActiveIndex(effectiveStatus) {
  if (!effectiveStatus || effectiveStatus === 'cancelled') return -1;
  const idx = STEP_ORDER.indexOf(effectiveStatus);
  return idx === -1 ? 0 : idx;
}

export default function POStatusStepper({ effectiveStatus }) {
  if (effectiveStatus === 'cancelled') {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 font-medium">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-red-400 dark:border-red-600 text-red-500 dark:text-red-400 text-xs">✕</span>
        Order Cancelled
      </div>
    );
  }

  const activeIdx = getActiveIndex(effectiveStatus);

  return (
    <>
      {/* ── Desktop: horizontal ──────────────────────────────── */}
      <div className="hidden sm:flex items-center w-full">
        {STEPS.map((step, i) => {
          const completed = i < activeIdx;
          const active    = i === activeIdx;
          const future    = i > activeIdx;

          return (
            <React.Fragment key={step.key}>
              {/* Step bubble + label */}
              <div className="flex flex-col items-center min-w-0">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors
                    ${completed
                      ? 'border-brand-600 bg-brand-600 text-white dark:border-brand-500 dark:bg-brand-500'
                      : active
                        ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-900/30 dark:text-brand-400'
                        : 'border-gray-200 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500'
                    }`}
                >
                  {completed ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span
                  className={`mt-1.5 text-[11px] font-medium whitespace-nowrap
                    ${active    ? 'text-brand-700 dark:text-brand-400'
                    : completed ? 'text-brand-600 dark:text-brand-500'
                    :             'text-gray-400 dark:text-gray-500'}`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-1 transition-colors
                    ${i < activeIdx
                      ? 'bg-brand-500 dark:bg-brand-600'
                      : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Mobile: vertical compact list ────────────────────── */}
      <ol className="sm:hidden space-y-1.5">
        {STEPS.map((step, i) => {
          const completed = i < activeIdx;
          const active    = i === activeIdx;
          return (
            <li key={step.key} className="flex items-center gap-2">
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold
                  ${completed
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : active
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-900/30 dark:text-brand-400'
                      : 'border-gray-300 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-800'
                  }`}
              >
                {completed ? '✓' : i + 1}
              </div>
              <span
                className={`text-xs
                  ${active    ? 'font-semibold text-brand-700 dark:text-brand-400'
                  : completed ? 'font-medium text-brand-600 dark:text-brand-500'
                  :             'text-gray-400 dark:text-gray-500'}`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}
