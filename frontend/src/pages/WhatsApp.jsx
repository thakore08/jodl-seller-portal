import React, { useEffect, useState } from 'react';
import {
  MessageSquare, Send, CheckCircle, AlertCircle,
  Smartphone, Bell, BellOff, Info,
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

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

export default function WhatsApp() {
  const { seller, refresh } = useAuth();
  const [status,   setStatus]   = useState(null);
  const [form,     setForm]     = useState({
    whatsapp_number:  seller?.whatsapp_number  || '',
    whatsapp_enabled: seller?.whatsapp_enabled ?? true,
    notifications: {
      new_po:         seller?.notifications?.new_po         ?? true,
      po_updated:     seller?.notifications?.po_updated     ?? true,
      invoice_posted: seller?.notifications?.invoice_posted ?? true,
    },
  });
  const [testPhone, setTestPhone] = useState('');
  const [saving,    setSaving]    = useState(false);
  const [testing,   setTesting]   = useState(false);
  const [msg,       setMsg]       = useState({ type: '', text: '' });

  useEffect(() => {
    api.get('/whatsapp/status').then(({ data }) => setStatus(data)).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true); setMsg({ type: '', text: '' });
    try {
      await api.post('/whatsapp/update-settings', form);
      await refresh();
      setMsg({ type: 'success', text: 'Settings saved successfully.' });
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

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-green-600" />
          WhatsApp for Business
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Receive PO notifications and act on them directly from WhatsApp.
        </p>
      </div>

      {/* API Status */}
      <div className={`card p-4 flex items-start gap-3 ${
        status?.configured
          ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
          : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
      }`}>
        {status?.configured
          ? <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          : <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        }
        <div>
          <p className={`text-sm font-medium ${status?.configured ? 'text-green-800 dark:text-green-400' : 'text-amber-800 dark:text-amber-400'}`}>
            {status?.configured ? 'WhatsApp Business API is connected' : 'WhatsApp Business API not configured'}
          </p>
          {status?.configured ? (
            <p className="text-xs text-green-700 dark:text-green-500 mt-0.5">Phone Number ID: {status.phoneNumberId}</p>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">
              Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in backend .env to enable.
            </p>
          )}
        </div>
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

      {/* Settings */}
      <div className="card p-5 space-y-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Your WhatsApp Number</h2>

        <div>
          <label className="label">Phone Number (with country code)</label>
          <div className="relative">
            <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <input
              type="tel"
              className="input pl-9"
              placeholder="+919876543210"
              value={form.whatsapp_number}
              onChange={e => setForm(p => ({ ...p, whatsapp_number: e.target.value }))}
            />
          </div>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Must be registered with WhatsApp. Include + and country code.
          </p>
        </div>

        <Toggle
          checked={form.whatsapp_enabled}
          onChange={v => setForm(p => ({ ...p, whatsapp_enabled: v }))}
          label="Enable WhatsApp Notifications"
          description="Receive order alerts and act on POs directly from WhatsApp"
        />
      </div>

      {/* Notification Preferences */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notification Preferences</h2>
        </div>

        <Toggle
          checked={form.notifications.new_po}
          onChange={v => setForm(p => ({ ...p, notifications: { ...p.notifications, new_po: v } }))}
          label="New Purchase Order"
          description="Notified when JODL sends a new PO with Accept/Reject buttons"
        />
        <Toggle
          checked={form.notifications.po_updated}
          onChange={v => setForm(p => ({ ...p, notifications: { ...p.notifications, po_updated: v } }))}
          label="PO Status Updates"
          description="Notified when a PO status changes (accepted, rejected, billed)"
        />
        <Toggle
          checked={form.notifications.invoice_posted}
          onChange={v => setForm(p => ({ ...p, notifications: { ...p.notifications, invoice_posted: v } }))}
          label="Invoice Confirmed"
          description="Notified when your invoice is posted to Zoho Books"
        />

        <button onClick={save} disabled={saving} className="btn-primary w-full justify-center">
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      {/* Test Message */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Send Test Message</h2>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 p-3 dark:bg-blue-900/20 dark:border-blue-800">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-400">
            Leave phone blank to send to your registered number above.
          </p>
        </div>

        <div>
          <label className="label">Override Phone (optional)</label>
          <input
            type="tel"
            className="input"
            placeholder="+919876543210"
            value={testPhone}
            onChange={e => setTestPhone(e.target.value)}
          />
        </div>

        <button
          onClick={sendTest}
          disabled={testing || !status?.configured}
          className="btn-outline w-full justify-center gap-2"
        >
          <MessageSquare className="h-4 w-4 text-green-600" />
          {testing ? 'Sending…' : 'Send Test Message'}
        </button>

        {!status?.configured && (
          <p className="text-xs text-center text-gray-400 dark:text-gray-500">
            Configure WhatsApp API credentials to enable this feature.
          </p>
        )}
      </div>

      {/* How it works */}
      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">How it works</h2>
        <ol className="space-y-2 text-sm text-gray-600 dark:text-gray-300 list-decimal list-inside">
          <li>JODL sends a new Purchase Order → you get a WhatsApp message with <strong>Accept</strong> / <strong>Reject</strong> buttons.</li>
          <li>Tap <strong>Accept</strong> to confirm the PO, or <strong>Reject</strong> to decline — directly from WhatsApp.</li>
          <li>Log in to the portal to create and post your invoice against the accepted PO.</li>
          <li>Once the invoice is posted to Zoho Books, you get a confirmation message on WhatsApp.</li>
        </ol>
        <div className="mt-3 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 p-3 text-xs text-gray-500 dark:text-gray-400">
          <strong>Webhook URL</strong> (register in Meta Developer Console):{' '}
          <code className="bg-gray-100 dark:bg-gray-600 px-1 py-0.5 rounded">
            https://your-domain.com/api/whatsapp/webhook
          </code>
        </div>
      </div>
    </div>
  );
}
