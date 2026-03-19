import React from 'react';

/**
 * EmptyState — generic zero-data placeholder.
 *
 * Props:
 *   icon     — React element (e.g. <FileText className="..." />)
 *   title    — primary message
 *   subtitle — secondary message (optional)
 *   action   — React element (e.g. a button or link) (optional)
 */
export default function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</p>
      {subtitle && (
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 max-w-xs">{subtitle}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
