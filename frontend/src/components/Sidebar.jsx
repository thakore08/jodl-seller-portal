import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, MessageSquare,
  LogOut, Package, X, ChevronLeft, ChevronRight,
  FileText, CreditCard, User, Bell, Factory, Truck, Warehouse,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const ROLE_LABELS = {
  seller_admin:    'Admin',
  operations_user: 'Operations',
  finance_user:    'Finance',
};

function getNavItems(role) {
  const all = [
    { to: '/',                icon: LayoutDashboard, label: 'Dashboard',       end: true,  roles: null },
    { to: '/purchase-orders', icon: ShoppingCart,    label: 'Purchase Orders', roles: ['seller_admin', 'operations_user'] },
    { to: '/production',      icon: Factory,         label: 'Production',      roles: ['seller_admin', 'operations_user'] },
    { to: '/dispatch',        icon: Truck,           label: 'Dispatch',        roles: ['seller_admin', 'operations_user'] },
    { to: '/cm-inventory',    icon: Warehouse,       label: 'CM Inventory',    roles: ['seller_admin', 'operations_user'] },
    { to: '/invoices',        icon: FileText,        label: 'Invoices',        roles: ['seller_admin', 'finance_user'] },
    { to: '/payments',        icon: CreditCard,      label: 'Payments',        roles: ['seller_admin', 'finance_user'] },
    { to: '/profile',         icon: User,            label: 'Profile',         roles: ['seller_admin'] },
    { to: '/whatsapp',              icon: MessageSquare, label: 'WhatsApp',     roles: ['seller_admin'] },
    { to: '/admin/notifications',   icon: Bell,          label: 'Notifications', roles: ['seller_admin'] },
  ];
  return all.filter(item => !item.roles || item.roles.includes(role));
}

/**
 * Sidebar — dual-mode:
 *  Mobile  : fixed slide-in drawer (open/onClose)
 *  Desktop : collapsible — full (w-64) ↔ icon-only (w-16) via collapsed/onToggleCollapse
 */
export default function Sidebar({ open, onClose, collapsed, onToggleCollapse, showCollapseCue }) {
  const { seller, logout } = useAuth();
  const { dark }   = useTheme();

  const navItems  = getNavItems(seller?.role);
  const roleLabel = ROLE_LABELS[seller?.role] || '';

  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-30 flex flex-col border-r backdrop-blur-xl
        ${dark ? 'border-slate-700/80 bg-slate-950/95' : 'border-indigo-200/60 bg-white/95'}
        transition-all duration-300 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0
        ${collapsed ? 'lg:w-16' : 'lg:w-64'}
        w-64 lg:w-auto
      `}
    >
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(90%_70%_at_0%_0%,rgba(65,105,255,0.22),transparent_60%)] dark:bg-[radial-gradient(90%_70%_at_0%_0%,rgba(129,152,255,0.2),transparent_60%)]" />

      {/* ── Brand row ─────────────────────────────────────────── */}
      <div className={`relative flex items-center border-b border-slate-200/70 dark:border-slate-700/60 py-5 transition-all duration-300 ${collapsed ? 'lg:justify-center lg:px-0 px-5' : 'justify-between px-5'}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 via-brand-600 to-signal-500 shadow-lg">
            <Package className="h-5 w-5 text-white" />
          </div>
          <div className={`min-w-0 overflow-hidden transition-all duration-300 ${collapsed ? 'lg:w-0 lg:opacity-0' : 'lg:w-auto lg:opacity-100'}`}>
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">JODL</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Seller Portal</p>
          </div>
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
      <nav className="relative flex-1 space-y-1.5 px-2 py-4">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `relative flex items-center rounded-xl px-3 py-2.5 text-sm font-semibold nav-transition
               ${collapsed ? 'lg:justify-center lg:px-0' : 'gap-3'}
               ${isActive
                 ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-md'
                 : 'text-gray-700 hover:bg-white/70 hover:text-gray-900 dark:text-slate-200/90 dark:hover:bg-slate-800/80 dark:hover:text-white'
               }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${collapsed ? 'lg:w-0 lg:opacity-0' : 'lg:w-auto lg:opacity-100'}`}>
              {label}
            </span>
          </NavLink>
        ))}
      </nav>

      {/* ── Seller info + logout + theme toggle ───────────────── */}
      <div className="relative border-t border-slate-200/70 dark:border-slate-700/60 px-2 py-4 space-y-1">
        {!collapsed ? (
          <div className="mb-2 flex items-center gap-3 px-2 py-1.5 rounded-xl bg-white/60 dark:bg-slate-900/55 border border-slate-200/70 dark:border-slate-700/60 transition-all duration-300">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 text-sm font-semibold">
              {seller?.name?.[0] || 'S'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{seller?.name}</p>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">{seller?.company}</p>
              {roleLabel && (
                <span className="mt-0.5 inline-block rounded-full bg-brand-100 dark:bg-brand-900/40 px-2 py-0.5 text-[10px] font-semibold text-brand-700 dark:text-brand-400">
                  {roleLabel}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex justify-center mb-2 transition-all duration-300" title={`${seller?.name} (${roleLabel})`}>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-400 text-sm font-semibold">
              {seller?.name?.[0] || 'S'}
            </div>
          </div>
        )}

        <button
          onClick={logout}
          title={collapsed ? 'Sign out' : undefined}
          className={`flex w-full items-center rounded-xl px-3 py-2 text-sm font-semibold text-gray-600
            hover:bg-white/70 hover:text-gray-900 transition-colors
            dark:text-gray-300 dark:hover:bg-slate-800/70 dark:hover:text-gray-100
            ${collapsed ? 'lg:justify-center lg:px-0' : 'gap-2'}`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${collapsed ? 'lg:w-0 lg:opacity-0' : 'lg:w-auto lg:opacity-100'}`}>
            Sign out
          </span>
        </button>

        {/* Desktop collapse toggle */}
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`relative hidden lg:flex w-full items-center rounded-xl px-3 py-2 text-sm font-semibold
            text-gray-400 hover:bg-white/70 hover:text-gray-600 transition-colors
            dark:text-gray-500 dark:hover:bg-slate-800/70 dark:hover:text-gray-400
            ${collapsed ? 'justify-center px-0' : 'gap-2'}`}
        >
          <ChevronRight className={`h-4 w-4 shrink-0 transition-transform duration-300 ${collapsed ? 'rotate-0' : 'rotate-180'}`} />
          <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${collapsed ? 'lg:w-0 lg:opacity-0' : 'lg:w-auto lg:opacity-100'}`}>
            Collapse
          </span>
          {showCollapseCue && (
            <span className={`collapse-cue ${collapsed ? 'collapse-cue--compact' : ''}`} aria-hidden="true">
              <svg viewBox="0 0 96 40" fill="none">
                <path className="collapse-cue-path" d="M86 20H10" />
                <path className="collapse-cue-head" d="M16 14L8 20L16 26" />
              </svg>
              <span className="collapse-cue-label">{collapsed ? 'Expand' : 'Collapse'}</span>
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}
