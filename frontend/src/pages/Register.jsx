import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Package, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [form, setForm] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    vendor_id: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await register({
        name: form.name.trim(),
        company: form.company.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        vendor_id: form.vendor_id.trim(),
        password: form.password,
      });
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-20 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -right-24 h-80 w-80 rounded-full bg-signal-500/20 blur-3xl" />

      <div className="w-full max-w-xl relative z-10">
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 via-brand-600 to-signal-500 shadow-xl mb-4">
            <Package className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-gray-100">Create Seller Account</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Register a seller profile to access the portal</p>
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Full Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="John Doe"
                  value={form.name}
                  onChange={e => update('name', e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="label">Company</label>
                <input
                  type="text"
                  className="input"
                  placeholder="ABC Metals Pvt Ltd"
                  value={form.company}
                  onChange={e => update('company', e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="label">Email Address</label>
                <input
                  type="email"
                  className="input"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={e => update('email', e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="label">Phone (Optional)</label>
                <input
                  type="tel"
                  className="input"
                  placeholder="+919876543210"
                  value={form.phone}
                  onChange={e => update('phone', e.target.value)}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="label">Zoho Vendor ID (Optional)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="1988755000019260007"
                  value={form.vendor_id}
                  onChange={e => update('vendor_id', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="input pr-10"
                    placeholder="Minimum 8 characters"
                    value={form.password}
                    onChange={e => update('password', e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="label">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    className="input pr-10"
                    placeholder="Re-enter password"
                    value={form.confirmPassword}
                    onChange={e => update('confirmPassword', e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary shimmer-on-hover w-full justify-center py-2.5">
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Creating account…
                </span>
              ) : 'Create Seller Account'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
