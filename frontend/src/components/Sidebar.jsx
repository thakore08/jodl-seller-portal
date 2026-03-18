import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, MessageSquare,
  LogOut, Package, X, ChevronLeft, ChevronRight,
  Sun, Moon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const navItems = [
  { to: '/',                icon: LayoutDashboard, label: 'Dashboard',       end: true },
  { to: '/purchase-orders', icon: ShoppingCart,    label: 'Purchase Orders' },
  { to: '/whatsapp',        icon: MessageSquare,   label: 'WhatsApp' },
];

/**
 * Sidebar — dual-mode:
 *  Mobile  : fixed slide-in drawer (open/onClose)
 *  Desktop : collapsible — full (w-64) ↔ icon-only (w-16) via collapsed/onToggleCollapse
 */
export default function Sidebar({ open, onClose, collapsed, onToggleCollapse }) {
  const { seller, logout } = useAuth();
  const { dark, toggle }   = useTheme();

  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-30 flex flex-col border-r border-gray-200 bg-white
        dark:bg-gray-800 dark:border-gray-700
        transition-all duration-300 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0
        ${collapsed ? 'lg:w-16' : 'lg:w-64'}
        w-64
      `}
    >
      {/* ── Brand row ─────────────────────────────────────────── */}
      <div className={`flex items-center border-b border-gray-100 dark:border-gray-700 py-5 ${collapsed ? 'lg:justify-center lg:px-0 px-5' : 'justify-between px-5'}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600">
            <Package className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">JODL</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Seller Portal</p>
            </div>
          )}
        </div>

        {/* Mobile close button */}
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300 transition-colors lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* ── Navigation ────────────────────────────────────────── */}
      <nav className="flex-1 space-y-1 px-2 py-4">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
               ${collapsed ? 'lg:justify-center lg:px-0' : 'gap-3'}
               ${isActive
                 ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                 : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100'
               }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* ── Seller info + logout + theme toggle ───────────────── */}
      <div className="border-t border-gray-100 dark:border-gray-700 px-2 py-4 space-y-1">
        {!collapsed ? (
          <div className="mb-2 flex items-center gap-3 px-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-400 text-sm font-semibold">
              {seller?.name?.[0] || 'S'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{seller?.name}</p>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">{seller?.company}</p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center mb-2" title={seller?.name}>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-400 text-sm font-semibold">
              {seller?.name?.[0] || 'S'}
            </div>
          </div>
        )}

        <button
          onClick={logout}
          title={collapsed ? 'Sign out' : undefined}
          className={`flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-600
            hover:bg-gray-50 hover:text-gray-900 transition-colors
            dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100
            ${collapsed ? 'lg:justify-center lg:px-0' : 'gap-2'}`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>

        {/* Dark / Light mode toggle */}
        <button
          onClick={toggle}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          className={`flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-600
            hover:bg-gray-50 hover:text-gray-900 transition-colors
            dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100
            ${collapsed ? 'lg:justify-center lg:px-0' : 'gap-2'}`}
        >
          {dark
            ? <Sun  className="h-4 w-4 shrink-0" />
            : <Moon className="h-4 w-4 shrink-0" />
          }
          {!collapsed && <span>{dark ? 'Light mode' : 'Dark mode'}</span>}
        </button>

        {/* Desktop collapse toggle */}
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`hidden lg:flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium
            text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors
            dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-400
            ${collapsed ? 'justify-center px-0' : 'gap-2'}`}
        >
          {collapsed
            ? <ChevronRight className="h-4 w-4 shrink-0" />
            : <><ChevronLeft className="h-4 w-4 shrink-0" /><span>Collapse</span></>
          }
        </button>
      </div>
    </aside>
  );
}
