import React, { useState } from 'react';
import {
  User, Mail, Phone, Building2, Shield,
  MessageSquare, Bell, BellOff, Smartphone,
  CheckCircle, AlertCircle, Send, Info,
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

// ─── Toggle (reused from WhatsApp page) ──────────────────────────────────────
function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
          checked ? 'bg-brand-600' : 'bg-gray-200 dark:bg-gray-600'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
        {description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

// ─── Profile page (seller_admin only) ────────────────────────────────────────
export default function Profile() {
  const { seller, refresh } = useAuth();

  const [waForm, setWaForm] = useState({
    whatsapp_number:  seller?.whatsapp_number  || '',
    whatsapp_enabled: seller?.whatsapp_enabled ?? true,
    notifications: {
      new_po:         seller?.notifications?.new_po         ?? true,
      po_updated:     seller?.notifications?.po_updated     ?? true,
      invoice_posted: seller?.notifications?.invoice_posted ?? true,
    },
  });

  const [testPhone, setTestPhone] = useState('');
  const [waStatus,  setWaStatus]  = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [testing,   setTesting]   = useState(false);
  const [msg,       setMsg]       = useState({ type: '', text: '' });

  // Load WhatsApp API status on mount
  React.useEffect(() => {
    api.get('/whatsapp/status').then(({ data }) => setWaStatus(data)).catch(() => {});
  }, []);

  const saveWhatsApp = async () => {
    setSaving(true); setMsg({ type: '', text: '' });
    try {
      await api.post('/whatsapp/update-settings', waForm);
      await refresh();
      setMsg({ type: 'success', text: 'WhatsApp settings saved.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true); setMsg({ type: '', text: '' });
    try {
      await api.post('/whatsapp/send-test', { to: testPhone || undefined });
      setMsg({ type: 'success', text: 'Test message sent! Check WhatsApp.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Failed to send test message' });
    } finally {
      setTesting(false);
    }
  };

  const ROLE_LABELS = {
    seller_admin:    'Administrator',
    operations_user: 'Operations User',
    finance_user:    'Finance User',
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Profile</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Your account information and notification settings.</p>
      </div>

      {/* Company / Account Info */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          Account Information
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Name */}
          <div className="flex items-start gap-3">
            <User className="h-4 w-4 text-gray-400 dark:text-gray-500 mt-1 shrink-0" />
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Full Name</p>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{seller?.name || '—'}</p>
            </div>
          </div>

          {/* Email */}
          <div className="flex items-start gap-3">
            <Mail className="h-4 w-4 text-gray-400 dark:text-gray-500 mt-1 shrink-0" />
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Email Address</p>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{seller?.email || '—'}</p>
            </div>
          </div>

          {/* Company */}
          <div className="flex items-start gap-3">
            <Building2 className="h-4 w-4 text-gray-400 dark:text-gray-500 mt-1 shrink-0" />
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Company</p>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{seller?.company || '—'}</p>
            </div>
          </div>

          {/* Phone */}
          <div className="flex items-start gap-3">
            <Phone className="h-4 w-4 text-gray-400 dark:text-gray-500 mt-1 shrink-0" />
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Phone</p>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{seller?.phone || '—'}</p>
            </div>
          </div>

          {/* Role */}
          <div className="flex items-start gap-3">
            <Shield className="h-4 w-4 text-gray-400 dark:text-gray-500 mt-1 shrink-0" />
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Role</p>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {ROLE_LABELS[seller?.role] || seller?.role || '—'}
              </p>
            </div>
          </div>

          {/* Zoho Vendor ID */}
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

        <p className="text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700 pt-3">
          To update your profile information, please contact your administrator.
        </p>
      </div>

      {/* WhatsApp Settings */}
      <div className="card p-5 space-y-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-green-600" />
          WhatsApp for Business
        </h2>

        {/* API Status */}
        <div className={`rounded-lg p-3 flex items-start gap-3 border ${
          waStatus?.configured
            ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
            : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
        }`}>
          {waStatus?.configured
            ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
            : <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          }
          <p className={`text-xs ${waStatus?.configured ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
            {waStatus?.configured
              ? `Connected — Phone Number ID: ${waStatus.phoneNumberId}`
              : 'WhatsApp Business API not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in backend .env.'}
          </p>
        </div>

        {/* Feedback */}
        {msg.text && (
          <div className={`rounded-lg p-3 text-sm flex items-center gap-2 ${
            msg.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400'
              : 'bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'
          }`}>
            {msg.type === 'success'
              ? <CheckCircle className="h-4 w-4 shrink-0" />
              : <AlertCircle className="h-4 w-4 shrink-0" />
            }
            {msg.text}
          </div>
        )}

        {/* Phone number */}
        <div>
          <label className="label">Your WhatsApp Number (with country code)</label>
          <div className="relative">
            <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <input
              type="tel"
              className="input pl-9"
              placeholder="+919876543210"
              value={waForm.whatsapp_number}
              onChange={e => setWaForm(p => ({ ...p, whatsapp_number: e.target.value }))}
            />
          </div>
        </div>

        {/* Enable toggle */}
        <Toggle
          checked={waForm.whatsapp_enabled}
          onChange={v => setWaForm(p => ({ ...p, whatsapp_enabled: v }))}
          label="Enable WhatsApp Notifications"
          description="Receive order alerts and act on POs directly from WhatsApp"
        />

        {/* Notification preferences */}
        <div className="space-y-3 border-t border-gray-100 dark:border-gray-700 pt-4">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5" /> Notification Preferences
          </p>
          <Toggle
            checked={waForm.notifications.new_po}
            onChange={v => setWaForm(p => ({ ...p, notifications: { ...p.notifications, new_po: v } }))}
            label="New Purchase Order"
            description="Notified when JODL sends a new PO with Accept/Reject buttons"
          />
          <Toggle
            checked={waForm.notifications.po_updated}
            onChange={v => setWaForm(p => ({ ...p, notifications: { ...p.notifications, po_updated: v } }))}
            label="PO Status Updates"
            description="Notified when a PO status changes"
          />
          <Toggle
            checked={waForm.notifications.invoice_posted}
            onChange={v => setWaForm(p => ({ ...p, notifications: { ...p.notifications, invoice_posted: v } }))}
            label="Invoice Confirmed"
            description="Notified when your invoice is posted to Zoho Books"
          />
        </div>

        <button onClick={saveWhatsApp} disabled={saving} className="btn-primary w-full justify-center">
          {saving ? 'Saving…' : 'Save WhatsApp Settings'}
        </button>

        {/* Test message */}
        <div className="border-t border-gray-100 dark:border-gray-700 pt-4 space-y-3">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
            <Send className="h-3.5 w-3.5" /> Send Test Message
          </p>
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 p-2.5 dark:bg-blue-900/20 dark:border-blue-800">
            <Info className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-400">Leave blank to send to your registered number.</p>
          </div>
          <div className="flex gap-2">
            <input
              type="tel"
              className="input flex-1"
              placeholder="+919876543210 (optional override)"
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
            />
            <button
              onClick={sendTest}
              disabled={testing || !waStatus?.configured}
              className="btn-outline shrink-0 gap-1.5"
            >
              <MessageSquare className="h-4 w-4 text-green-600" />
              {testing ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
