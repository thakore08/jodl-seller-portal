import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import PurchaseOrders from './pages/PurchaseOrders';
import PODetail from './pages/PODetail';
import ProductionPlans from './pages/ProductionPlans';
import Invoices from './pages/Invoices';
import Payments from './pages/Payments';
import PaymentDetail from './pages/PaymentDetail';
import Profile from './pages/Profile';
import WhatsApp from './pages/WhatsApp';
import AdminNotifications from './pages/AdminNotifications';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

// ─── Loading spinner ──────────────────────────────────────────────────────────
function LoadingSpinner() {
  return (
    <div className="flex h-screen items-center justify-center dark:bg-gray-900">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
    </div>
  );
}

// ─── Route guards ─────────────────────────────────────────────────────────────
function PrivateRoute({ children }) {
  const { seller, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  return seller ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { seller, loading } = useAuth();
  if (loading) return null;
  return !seller ? children : <Navigate to="/" replace />;
}

/**
 * RoleRoute — private route restricted to specific roles.
 * Unauthenticated → /login | Wrong role → / (dashboard)
 */
function RoleRoute({ children, roles }) {
  const { seller, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!seller) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(seller.role)) return <Navigate to="/" replace />;
  return children;
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* ── Public routes ─────────────────────────────────────────── */}
            <Route path="/login"                element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register"             element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/forgot-password"      element={<PublicRoute><ForgotPassword /></PublicRoute>} />
            <Route path="/reset-password/:token" element={<PublicRoute><ResetPassword /></PublicRoute>} />

            {/* ── Private routes (inside Layout) ────────────────────────── */}
            <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
              {/* All roles */}
              <Route index element={<Dashboard />} />

              {/* seller_admin + operations_user */}
              <Route path="purchase-orders" element={
                <RoleRoute roles={['seller_admin', 'operations_user']}><PurchaseOrders /></RoleRoute>
              } />
              <Route path="purchase-orders/:id" element={
                <RoleRoute roles={['seller_admin', 'operations_user']}><PODetail /></RoleRoute>
              } />
              <Route path="production" element={
                <RoleRoute roles={['seller_admin', 'operations_user']}><ProductionPlans /></RoleRoute>
              } />

              {/* seller_admin + finance_user */}
              <Route path="invoices" element={
                <RoleRoute roles={['seller_admin', 'finance_user']}><Invoices /></RoleRoute>
              } />
              <Route path="payments" element={
                <RoleRoute roles={['seller_admin', 'finance_user']}><Payments /></RoleRoute>
              } />
              <Route path="payments/:id" element={
                <RoleRoute roles={['seller_admin', 'finance_user']}><PaymentDetail /></RoleRoute>
              } />

              {/* seller_admin only */}
              <Route path="profile" element={
                <RoleRoute roles={['seller_admin']}><Profile /></RoleRoute>
              } />
              <Route path="whatsapp" element={
                <RoleRoute roles={['seller_admin']}><WhatsApp /></RoleRoute>
              } />
              <Route path="admin/notifications" element={
                <RoleRoute roles={['seller_admin']}><AdminNotifications /></RoleRoute>
              } />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
