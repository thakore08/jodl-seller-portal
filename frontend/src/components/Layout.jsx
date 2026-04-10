import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, Package, Sparkles } from 'lucide-react';
import Sidebar from './Sidebar';
import ThemeModeToggle from './ThemeModeToggle';

const PAGE_TITLES = [
  { key: '/purchase-orders', title: 'Purchase Orders', subtitle: 'Track issued, accepted, and dispatched orders' },
  { key: '/production', title: 'Production', subtitle: 'Monitor production plans, actual output, and remaining PO balance' },
  { key: '/invoices', title: 'Invoices', subtitle: 'Review extracted bills and mapped invoice data' },
  { key: '/payments', title: 'Payments', subtitle: 'Monitor settlements, balance, and overdue amounts' },
  { key: '/profile', title: 'Profile', subtitle: 'Manage account, business and payout details' },
  { key: '/whatsapp', title: 'WhatsApp', subtitle: 'Message updates and operational notifications' },
  { key: '/', title: 'Dashboard', subtitle: 'Operational command center and quick actions' },
];

export default function Layout() {
  const [sidebarOpen,     setSidebarOpen]     = useState(false); // mobile drawer
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // desktop collapse
  const [showModeCue, setShowModeCue] = useState(false);
  const [showLiveCue, setShowLiveCue] = useState(false);
  const [showCollapseCue, setShowCollapseCue] = useState(false);
  const location = useLocation();

  const activePage = PAGE_TITLES.find(page => {
    if (page.key === '/') return location.pathname === '/';
    return location.pathname.startsWith(page.key);
  }) || PAGE_TITLES[PAGE_TITLES.length - 1];

  useEffect(() => {
    const shouldCollapse = localStorage.getItem('jodl_sidebar_collapsed') === '1';
    if (shouldCollapse) {
      setSidebarCollapsed(true);
      localStorage.setItem('jodl_sidebar_collapsed', '0');
    }
  }, []);

  useEffect(() => {
    const shouldShow = localStorage.getItem('jodl_show_onboarding_sequence') === '1';
    if (!shouldShow) return;
    localStorage.setItem('jodl_show_onboarding_sequence', '0');
    setShowModeCue(true);
    const modeTimer = setTimeout(() => {
      setShowModeCue(false);
      setShowLiveCue(true);
    }, 30000);

    const liveTimer = setTimeout(() => {
      setShowLiveCue(false);
      setShowCollapseCue(true);
    }, 60000);

    const collapseTimer = setTimeout(() => {
      setShowCollapseCue(false);
    }, 90000);

    return () => {
      clearTimeout(modeTimer);
      clearTimeout(liveTimer);
      clearTimeout(collapseTimer);
    };
  }, []);

  return (
    <div className="relative flex h-[100dvh] min-h-screen overflow-hidden">
      {/* Mobile backdrop overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(c => !c)}
        showCollapseCue={showCollapseCue}
      />

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between gap-3 border-b border-slate-200/70 bg-white/85 backdrop-blur-sm dark:bg-slate-900/70 dark:border-slate-700/60 px-4 py-3 shadow-sm lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600">
              <Package className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">JODL Seller Portal</span>
          </div>
          <ThemeModeToggle compact />
        </header>

        {/* Desktop contextual top rail */}
        <div className="hidden lg:flex items-center justify-between px-6 py-4 border-b border-slate-200/70 dark:border-slate-700/60 bg-white/55 dark:bg-slate-900/35 backdrop-blur-md">
          <div>
            <h1 className="text-lg font-black tracking-tight text-gray-900 dark:text-gray-100">{activePage.title}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{activePage.subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <ThemeModeToggle />
              {showModeCue && (
                <span className="mode-switch-cue mode-switch-cue--rail" aria-hidden="true">
                  <span className="mode-switch-cue-label">Mode</span>
                  <svg viewBox="0 0 40 46" fill="none">
                    <path className="mode-switch-cue-path" d="M20 6V30" />
                    <path className="mode-switch-cue-head" d="M14 26L20 34L26 26" />
                  </svg>
                </span>
              )}
            </div>
            <span className="status-live relative text-emerald-600 dark:text-emerald-400">
              <Sparkles className="h-3.5 w-3.5" />
              Live sync enabled
              {showLiveCue && (
                <span className="live-sync-cue" aria-hidden="true">
                  <svg viewBox="0 0 68 42" fill="none">
                    <path className="mode-switch-cue-path" d="M14 34C26 34 36 26 46 14" />
                    <path className="mode-switch-cue-head" d="M43 13L49 11L48 18" />
                  </svg>
                  <span className="mode-switch-cue-label">Live sync</span>
                </span>
              )}
            </span>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto">
          <div className="page-shell">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
