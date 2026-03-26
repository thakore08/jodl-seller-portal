import React from 'react';
import { Link } from 'react-router-dom';
import {
  User, Mail, Phone, Building2, Shield,
  MessageSquare, Bell, Sparkles, ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Profile() {
  const { seller } = useAuth();

  const ROLE_LABELS = {
    seller_admin: 'Administrator',
    operations_user: 'Operations User',
    finance_user: 'Finance User',
  };

  return (
    <div className="space-y-6 max-w-none">
      <div className="page-hero">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="hero-title">Profile & Communication</h2>
            <p className="hero-subtitle">Manage account details and notification channels.</p>
            <div className="mt-3">
              <span className="chip-soft">{ROLE_LABELS[seller?.role] || 'Seller User'}</span>
            </div>
          </div>
          <span className="status-live text-white/90">
            <Sparkles className="h-3.5 w-3.5" />
            Connected
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7">
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              Account Information
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <User className="h-4 w-4 text-gray-400 dark:text-gray-500 mt-1 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Full Name</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{seller?.name || '—'}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 text-gray-400 dark:text-gray-500 mt-1 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Email Address</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{seller?.email || '—'}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Building2 className="h-4 w-4 text-gray-400 dark:text-gray-500 mt-1 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Company</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{seller?.company || '—'}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="h-4 w-4 text-gray-400 dark:text-gray-500 mt-1 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Phone</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{seller?.phone || '—'}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Shield className="h-4 w-4 text-gray-400 dark:text-gray-500 mt-1 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Role</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {ROLE_LABELS[seller?.role] || seller?.role || '—'}
                  </p>
                </div>
              </div>

              {seller?.vendor_id && (
                <div className="flex items-start gap-3">
                  <Building2 className="h-4 w-4 text-gray-400 dark:text-gray-500 mt-1 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Zoho Vendor ID</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 font-mono">{seller.vendor_id}</p>
                  </div>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-3">
              To update profile data, please contact your administrator.
            </p>
          </div>
        </div>

        <div className="xl:col-span-5">
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-green-600" />
              Communication Center
            </h2>

            <div className="rounded-xl border border-slate-200/80 dark:border-slate-700/70 bg-slate-50/70 dark:bg-slate-900/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">WhatsApp Alerts</span>
                <span className={`badge ${seller?.whatsapp_enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                  {seller?.whatsapp_enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Number: {seller?.whatsapp_number || 'Not configured'}
              </p>
              <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5" />
                {(seller?.notifications?.new_po ? 1 : 0) +
                  (seller?.notifications?.po_updated ? 1 : 0) +
                  (seller?.notifications?.invoice_posted ? 1 : 0)} notification rules enabled
              </div>
            </div>

            <Link to="/whatsapp" className="btn-primary shimmer-on-hover w-full justify-center">
              Open WhatsApp Settings <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
