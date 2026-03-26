import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeModeToggle({ compact = false, className = '' }) {
  const { dark, toggle } = useTheme();

  if (compact) {
    return (
      <button
        onClick={toggle}
        title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        className={`flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white/80 text-gray-600 shadow-sm transition-colors hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-gray-300 dark:hover:bg-slate-900 ${className}`}
      >
        {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`theme-toggle ${className}`}
    >
      <div className="theme-toggle-track">
        <div
          className={`theme-toggle-thumb ${dark ? 'theme-toggle-thumb--dark' : 'theme-toggle-thumb--light'}`}
        />

        <div className="theme-toggle-icons">
          <span className={`theme-toggle-icon ${dark ? 'is-muted' : 'is-active'}`}>
            <Sun className="h-3.5 w-3.5" />
            <span className="sr-only">Light</span>
          </span>
          <span className={`theme-toggle-icon ${dark ? 'is-active' : 'is-muted'}`}>
            <Moon className="h-3.5 w-3.5" />
            <span className="sr-only">Dark</span>
          </span>
        </div>

      </div>
    </button>
  );
}
