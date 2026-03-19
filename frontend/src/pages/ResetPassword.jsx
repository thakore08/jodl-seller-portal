import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Package, Eye, EyeOff, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import api from '../services/api';

export default function ResetPassword() {
  const { token }               = useParams();
  const navigate                = useNavigate();
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPw,    setShowPw]    = useState(false);
  const [showCfm,   setShowCfm]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      return setError('Password must be at least 8 characters.');
    }
    if (password !== confirm) {
      return setError('Passwords do not match.');
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, new_password: password });
      setSuccess(true);
      // Auto-redirect to login after 2.5s
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err.response?.data?.message || 'Reset failed. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 shadow-lg mb-4">
            <Package className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Reset Password</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 text-center">
            Enter a new password for your account.
          </p>
        </div>

        <div className="card p-8 shadow-lg">
          {success ? (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <CheckCircle className="h-12 w-12 text-green-500" />
              </div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Password reset successfully!
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Redirecting you to the login page…
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* New password */}
              <div>
                <label className="label">New Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="input pr-10"
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div>
                <label className="label">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showCfm ? 'text' : 'password'}
                    className="input pr-10"
                    placeholder="Re-enter your password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCfm(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showCfm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Resetting…
                  </span>
                ) : 'Reset Password'}
              </button>

              <div className="text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
