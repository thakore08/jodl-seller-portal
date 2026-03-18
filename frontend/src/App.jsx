import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PurchaseOrders from './pages/PurchaseOrders';
import PODetail from './pages/PODetail';
import WhatsApp from './pages/WhatsApp';

function PrivateRoute({ children }) {
  const { seller, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center dark:bg-gray-900">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }
  return seller ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { seller, loading } = useAuth();
  if (loading) return null;
  return !seller ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="purchase-orders" element={<PurchaseOrders />} />
              <Route path="purchase-orders/:id" element={<PODetail />} />
              <Route path="whatsapp" element={<WhatsApp />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
