import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart,
  MessageSquare, LogOut, Package, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/',                icon: LayoutDashboard, label: 'Dashboard',       end: true },
  { to: '/purchase-orders', icon: ShoppingCart,    label: 'Purchase Orders' },
  { to: '/whatsapp',        icon: MessageSquare,   label: 'WhatsApp' },
];

// Desktop: static sidebar. Mobile: fixed slide-in drawer controlled by `open` prop.
export default function Sidebar({ open, onClose }) {
  const { seller, logout } = useAuth();

  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-gray-200 bg-white
        transition-transform duration-300 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0 lg:transition-none
      `}
    >
      {/* Brand + mobile close button */}
      <div className="flex items-center justify-between gap-3 px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600">
            <Package className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">JODL</p>
            <p className="text-xs text-gray-500">Seller Portal</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Seller info + logout */}
      <div className="border-t border-gray-100 px-4 py-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-sm font-semibold">
            {seller?.name?.[0] || 'S'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">{seller?.name}</p>
            <p className="truncate text-xs text-gray-500">{seller?.company}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
