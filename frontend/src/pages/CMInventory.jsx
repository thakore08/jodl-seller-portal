import React, { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw, Settings, Package, ChevronDown, ChevronRight,
  Warehouse, BarChart3, ListFilter, CheckCircle2, AlertCircle,
  Pencil, Save, X, Plus, CloudDownload, Factory,
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n) {
  const num = Number(n);
  return Number.isFinite(num) ? num.toLocaleString('en-IN') : '0';
}

function QtyBadge({ value, type = 'neutral' }) {
  const num = Number(value);
  const base = 'inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums';
  if (type === 'positive' || num > 0)
    return <span className={`${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400`}>{fmt(value)}</span>;
  if (type === 'warning' || num < 0)
    return <span className={`${base} bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400`}>{fmt(value)}</span>;
  return <span className={`${base} bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300`}>{fmt(value)}</span>;
}

function StatusPill({ status }) {
  const map = {
    open:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    closed: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
    draft:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${map[status] || map.draft}`}>
      {status || 'draft'}
    </span>
  );
}

// ─── CM Config Panel ──────────────────────────────────────────────────────────
function CMConfigPanel({ onConfigSaved }) {
  const [vendors,    setVendors]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [syncing,    setSyncing]    = useState(false);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState('');
  const [selected,   setSelected]   = useState(new Set());
  const [showAdd,    setShowAdd]    = useState(false);
  const [newName,    setNewName]    = useState('');
  const [newZohoId,  setNewZohoId]  = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError,   setAddError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/config/cm-vendors');
      const list = data.data || [];
      setVendors(list);
      setSelected(new Set(list.filter(v => v.is_contract_manufacturer).map(v => v.id)));
    } catch { setError('Failed to load vendors.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = id => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const save = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      await api.put('/config/cm-vendors', { vendor_ids: [...selected] });
      setSuccess('Contract manufacturer config saved.');
      onConfigSaved?.();
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save config.');
    } finally { setSaving(false); }
  };

  const addVendor = async () => {
    if (!newName.trim()) { setAddError('Vendor name is required.'); return; }
    setAddLoading(true); setAddError('');
    try {
      await api.post('/config/cm-vendors', { name: newName.trim(), zoho_vendor_id: newZohoId.trim() || null });
      setNewName(''); setNewZohoId(''); setShowAdd(false);
      load();
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to add vendor.');
    } finally { setAddLoading(false); }
  };

  const syncNow = async () => {
    setSyncing(true); setError(''); setSuccess('');
    try {
      const { data } = await api.post('/inventory/sync');
      setSuccess(data.message || 'Sync complete.');
      if (data.errors?.length) setError('Some errors: ' + data.errors.slice(0, 2).join('; '));
    } catch (err) {
      setError(err.response?.data?.error || 'Sync failed.');
    } finally { setSyncing(false); }
  };

  return (
    <div className="space-y-4">
      {/* Sync card */}
      <div className="card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <CloudDownload className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              Sync POs from Zoho Books
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Pulls all Purchase Orders for configured CM vendors and stores them in the inventory DB.
            </p>
          </div>
          <button onClick={syncNow} disabled={syncing} className="btn-primary px-4 py-2 text-xs">
            {syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Vendor config card */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Contract Manufacturer Config</h3>
          </div>
          <button onClick={() => setShowAdd(s => !s)} className="btn-outline text-xs px-2.5 py-1">
            <Plus className="h-3.5 w-3.5" /> Add Vendor
          </button>
        </div>

        {showAdd && (
          <div className="rounded-lg border border-dashed border-brand-300 dark:border-brand-700 bg-brand-50/40 dark:bg-brand-900/10 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">New Vendor</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Vendor Name *</label>
                <input className="input text-sm" placeholder="e.g. Amba Shakti" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Zoho Books Vendor ID</label>
                <input className="input text-sm" placeholder="e.g. 1988755000000800313" value={newZohoId} onChange={e => setNewZohoId(e.target.value)} />
              </div>
            </div>
            {addError && <p className="text-xs text-red-600 dark:text-red-400">{addError}</p>}
            <div className="flex gap-2">
              <button onClick={addVendor} disabled={addLoading} className="btn-primary text-xs px-3 py-1.5">
                {addLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save Vendor
              </button>
              <button onClick={() => { setShowAdd(false); setAddError(''); }} className="btn-outline text-xs px-3 py-1.5">
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            </div>
          </div>
        )}

        {error   && <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}</p>}
        {success && <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" />{success}</p>}

        {loading ? (
          <div className="flex justify-center py-6"><div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /></div>
        ) : vendors.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">No vendors found. Add a vendor to get started.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">Check vendors to mark as <strong>Contract Manufacturers</strong>.</p>
            <div className="divide-y divide-gray-100 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              {vendors.map(v => (
                <label key={v.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                  <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggle(v.id)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{v.name}</p>
                    {v.zoho_vendor_id && <p className="text-xs text-gray-400 dark:text-gray-500">Zoho ID: {v.zoho_vendor_id}</p>}
                  </div>
                  {v.is_contract_manufacturer && (
                    <span className="shrink-0 rounded-full bg-brand-100 dark:bg-brand-900/40 px-2 py-0.5 text-[10px] font-semibold text-brand-700 dark:text-brand-400">CM</span>
                  )}
                </label>
              ))}
            </div>
            <button onClick={save} disabled={saving} className="btn-primary w-full justify-center mt-2">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save CM Config
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Summary View ─────────────────────────────────────────────────────────────
function SummaryView() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/inventory/summary');
      setRows(data.data || []);
    } catch { setError('Failed to load inventory summary.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const grouped = rows.reduce((acc, row) => {
    if (!acc[row.vendor_id]) acc[row.vendor_id] = { vendor_name: row.vendor_name, items: [] };
    acc[row.vendor_id].items.push(row);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400">{rows.length} line item{rows.length !== 1 ? 's' : ''} across all CM vendors</p>
        <button onClick={load} disabled={loading} className="btn-outline text-xs px-2.5 py-1">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">{error}</div>}
      {loading ? (
        <div className="flex justify-center py-10"><div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" /></div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="card py-14 text-center">
          <Warehouse className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm text-gray-400 dark:text-gray-500">No inventory data. Sync POs from the Config tab first.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([vendorId, group]) => (
            <VendorSummaryCard key={vendorId} vendorName={group.vendor_name} items={group.items} />
          ))}
        </div>
      )}
    </div>
  );
}

function VendorSummaryCard({ vendorName, items }) {
  const [open, setOpen] = useState(true);
  const totals = items.reduce((a, r) => ({
    physical: a.physical + Number(r.physical_inventory),
    planned:  a.planned  + Number(r.planned_inventory),
  }), { physical: 0, planned: 0 });

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
        <div className="flex items-center gap-3">
          {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{vendorName}</span>
          <span className="text-[10px] font-semibold rounded-full bg-brand-100 dark:bg-brand-900/40 px-2 py-0.5 text-brand-700 dark:text-brand-400">CM</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>{items.length} items</span>
          <span className="hidden sm:inline">Physical: <QtyBadge value={totals.physical} /></span>
          <span className="hidden sm:inline">Planned: <QtyBadge value={totals.planned} /></span>
        </div>
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-gray-100 dark:border-gray-700">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="table-th py-2.5">Item Description</th>
                <th className="table-th py-2.5 text-right">Physical Inventory</th>
                <th className="table-th py-2.5 text-right">Planned Inventory</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {items.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="table-td py-2.5 font-medium max-w-xs truncate">{row.item_description || '—'}</td>
                  <td className="table-td py-2.5 text-right"><QtyBadge value={row.physical_inventory} /></td>
                  <td className="table-td py-2.5 text-right"><QtyBadge value={row.planned_inventory} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50/70 dark:bg-gray-700/30">
              <tr>
                <td className="table-td py-2.5 font-bold text-gray-700 dark:text-gray-300">Total</td>
                <td className="table-td py-2.5 text-right font-bold"><QtyBadge value={totals.physical} /></td>
                <td className="table-td py-2.5 text-right font-bold"><QtyBadge value={totals.planned} /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Production View ──────────────────────────────────────────────────────────
function ProductionView() {
  const [vendors,  setVendors]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [syncing,  setSyncing]  = useState(false);
  const [error,    setError]    = useState('');
  const [syncMsg,  setSyncMsg]  = useState('');

  // Inline edit state
  const [editing,  setEditing]  = useState(null); // po_line_item_id
  const [editVals, setEditVals] = useState({ planned_qty: '', actual_qty: '' });
  const [saving,   setSaving]   = useState(false);
  const [saveErr,  setSaveErr]  = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/inventory/production');
      setVendors(data.data || []);
    } catch { setError('Failed to load production data.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const syncAndReload = async () => {
    setSyncing(true); setSyncMsg(''); setError('');
    try {
      const { data } = await api.post('/inventory/sync');
      setSyncMsg(data.message || 'Sync complete.');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Sync failed.');
    } finally { setSyncing(false); }
  };

  const startEdit = (li) => {
    setEditing(li.po_line_item_id);
    setEditVals({ planned_qty: li.planned_qty, actual_qty: li.actual_qty });
    setSaveErr('');
  };

  const cancelEdit = () => { setEditing(null); setSaveErr(''); };

  const saveEdit = async (id) => {
    setSaving(true); setSaveErr('');
    try {
      await api.patch(`/production/${id}`, {
        planned_qty: Number(editVals.planned_qty),
        actual_qty:  Number(editVals.actual_qty),
      });
      setEditing(null);
      load();
    } catch (err) {
      setSaveErr(err.response?.data?.error || 'Failed to save. Please try again.');
    } finally { setSaving(false); }
  };

  const totalLineItems = vendors.reduce((s, v) => s + v.pos.reduce((sp, p) => sp + p.line_items.length, 0), 0);

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {totalLineItems} line item{totalLineItems !== 1 ? 's' : ''} across all CM vendors
        </p>
        <div className="flex items-center gap-2">
          {syncMsg && <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />{syncMsg}</p>}
          <button onClick={syncAndReload} disabled={syncing || loading} className="btn-outline text-xs px-3 py-1.5">
            <CloudDownload className={`h-3.5 w-3.5 ${syncing ? 'animate-bounce' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync from Zoho'}
          </button>
          <button onClick={load} disabled={loading || syncing} className="btn-outline text-xs px-3 py-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {error   && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">{error}</div>}
      {saveErr && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">{saveErr}</div>}

      {loading ? (
        <div className="flex justify-center py-10"><div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" /></div>
      ) : vendors.length === 0 ? (
        <div className="card py-14 text-center">
          <Factory className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm text-gray-400 dark:text-gray-500">No POs found.</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Configure CM vendors with Zoho IDs in Config tab, then click <strong>Sync from Zoho</strong>.
          </p>
          <button onClick={syncAndReload} disabled={syncing} className="btn-primary mt-4 text-xs px-4 py-2">
            <CloudDownload className="h-3.5 w-3.5" /> Sync from Zoho Now
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {vendors.map(vendor => (
            <VendorProductionCard
              key={vendor.vendor_id}
              vendor={vendor}
              editing={editing}
              editVals={editVals}
              saving={saving}
              onStartEdit={startEdit}
              onCancelEdit={cancelEdit}
              onSaveEdit={saveEdit}
              onEditValChange={(field, val) => setEditVals(v => ({ ...v, [field]: val }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VendorProductionCard({ vendor, editing, editVals, saving, onStartEdit, onCancelEdit, onSaveEdit, onEditValChange }) {
  const [openPOs, setOpenPOs] = useState({});

  const togglePO = (poId) => setOpenPOs(s => ({ ...s, [poId]: !s[poId] }));

  // Default first PO open
  useEffect(() => {
    if (vendor.pos.length > 0) {
      setOpenPOs({ [vendor.pos[0].po_id]: true });
    }
  }, [vendor.pos.length]);

  const vendorTotals = vendor.pos.reduce((acc, po) => {
    po.line_items.forEach(li => {
      acc.po_qty    += li.po_qty;
      acc.planned   += li.planned_qty;
      acc.actual    += li.actual_qty;
      acc.remaining += li.remaining_qty;
    });
    return acc;
  }, { po_qty: 0, planned: 0, actual: 0, remaining: 0 });

  return (
    <div className="card overflow-hidden">
      {/* Vendor header */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{vendor.vendor_name}</span>
            <span className="text-[10px] font-semibold rounded-full bg-brand-100 dark:bg-brand-900/40 px-2 py-0.5 text-brand-700 dark:text-brand-400">CM</span>
            <span className="text-xs text-gray-400">{vendor.pos.length} PO{vendor.pos.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>PO Qty: <span className="font-semibold text-gray-700 dark:text-gray-300">{fmt(vendorTotals.po_qty)}</span></span>
            <span>Planned: <span className="font-semibold text-brand-600 dark:text-brand-400">{fmt(vendorTotals.planned)}</span></span>
            <span>Actual: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{fmt(vendorTotals.actual)}</span></span>
            <span>Remaining: <span className="font-semibold text-amber-600 dark:text-amber-400">{fmt(vendorTotals.remaining)}</span></span>
          </div>
        </div>
      </div>

      {/* POs */}
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {vendor.pos.map(po => (
          <div key={po.po_id}>
            {/* PO row */}
            <button
              onClick={() => togglePO(po.po_id)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                {openPOs[po.po_id]
                  ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                  : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                <span className="text-sm font-semibold text-brand-600 dark:text-brand-400">{po.po_number}</span>
                <StatusPill status={po.cm_status} />
                {po.po_date && <span className="text-xs text-gray-400">{new Date(po.po_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
              </div>
              <span className="text-xs text-gray-400">{po.line_items.length} item{po.line_items.length !== 1 ? 's' : ''}</span>
            </button>

            {/* Line items table */}
            {openPOs[po.po_id] && (
              <div className="overflow-x-auto bg-white dark:bg-gray-800/20">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th className="table-th py-2">Item</th>
                      <th className="table-th py-2">Description</th>
                      <th className="table-th py-2 text-right">PO Qty</th>
                      <th className="table-th py-2 text-right">Planned</th>
                      <th className="table-th py-2 text-right">Actual</th>
                      <th className="table-th py-2 text-right">Remaining</th>
                      <th className="table-th py-2 text-right">Billed</th>
                      <th className="table-th py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                    {po.line_items.map(li => {
                      const isEditing = editing === li.po_line_item_id;
                      return (
                        <tr key={li.po_line_item_id} className={`transition-colors ${isEditing ? 'bg-brand-50/40 dark:bg-brand-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/20'}`}>
                          <td className="table-td py-2 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">{li.po_item_id || '—'}</td>
                          <td className="table-td py-2 max-w-[180px] truncate" title={li.description}>{li.description || '—'}</td>
                          <td className="table-td py-2 text-right"><QtyBadge value={li.po_qty} /></td>

                          {/* Planned qty */}
                          <td className="table-td py-2 text-right">
                            {isEditing ? (
                              <input type="number" min="0"
                                className="input w-20 text-right text-xs py-1"
                                value={editVals.planned_qty}
                                onChange={e => onEditValChange('planned_qty', e.target.value)} />
                            ) : <QtyBadge value={li.planned_qty} />}
                          </td>

                          {/* Actual qty — highlighted */}
                          <td className="table-td py-2 text-right">
                            {isEditing ? (
                              <input type="number" min="0"
                                className="input w-20 text-right text-xs py-1 border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500"
                                value={editVals.actual_qty}
                                onChange={e => onEditValChange('actual_qty', e.target.value)} />
                            ) : (
                              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                                li.actual_qty >= li.po_qty
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                  : li.actual_qty > 0
                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                              }`}>{fmt(li.actual_qty)}</span>
                            )}
                          </td>

                          <td className="table-td py-2 text-right">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                              li.remaining_qty <= 0
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            }`}>{fmt(li.remaining_qty)}</span>
                          </td>

                          <td className="table-td py-2 text-right"><QtyBadge value={li.billed_qty} /></td>

                          <td className="table-td py-2">
                            {isEditing ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => onSaveEdit(li.po_line_item_id)}
                                  disabled={saving}
                                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-brand-600 text-white text-[11px] font-semibold hover:bg-brand-700 disabled:opacity-50"
                                >
                                  {saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
                                </button>
                                <button onClick={onCancelEdit} className="flex items-center gap-1 px-2 py-1 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 text-[11px]">
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => onStartEdit(li)}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 text-[11px] font-medium"
                              >
                                <Pencil className="h-3 w-3" /> Update
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Detail View ──────────────────────────────────────────────────────────────
function DetailView() {
  const [vendors,  setVendors]  = useState([]);
  const [vendorId, setVendorId] = useState('');
  const [rows,     setRows]     = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [vLoading, setVLoading] = useState(true);
  const [error,    setError]    = useState('');

  useEffect(() => {
    api.get('/config/cm-vendors')
      .then(({ data }) => {
        const cm = (data.data || []).filter(v => v.is_contract_manufacturer);
        setVendors(cm);
        if (cm.length > 0) setVendorId(cm[0].id);
      })
      .catch(() => {})
      .finally(() => setVLoading(false));
  }, []);

  const load = useCallback(async () => {
    if (!vendorId) return;
    setLoading(true); setError('');
    try {
      const { data } = await api.get(`/inventory/detail?vendor_id=${vendorId}`);
      setRows(data.data || []);
    } catch { setError('Failed to load inventory detail.'); }
    finally { setLoading(false); }
  }, [vendorId]);

  useEffect(() => { load(); }, [load]);

  if (vLoading) return <div className="flex justify-center py-10"><div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1 max-w-xs">
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Contract Manufacturer</label>
          {vendors.length === 0 ? (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" /> No CM vendors configured.
            </p>
          ) : (
            <select className="input text-sm" value={vendorId} onChange={e => setVendorId(e.target.value)}>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          )}
        </div>
        <button onClick={load} disabled={loading || !vendorId} className="btn-outline text-xs px-3 py-2">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">{error}</div>}
      {loading ? (
        <div className="flex justify-center py-10"><div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" /></div>
      ) : rows.length === 0 ? (
        <div className="card py-14 text-center">
          <Package className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm text-gray-400 dark:text-gray-500">No line items. Use Production tab → Sync from Zoho.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  <th className="table-th">PO #</th>
                  <th className="table-th">Item ID</th>
                  <th className="table-th">Description</th>
                  <th className="table-th text-right">PO Qty</th>
                  <th className="table-th text-right">Planned</th>
                  <th className="table-th text-right">Actual</th>
                  <th className="table-th text-right">Billed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {rows.map(row => (
                  <tr key={row.po_line_item_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="table-td font-medium text-brand-600 dark:text-brand-400">{row.po_number}</td>
                    <td className="table-td text-gray-500">{row.po_item_id || '—'}</td>
                    <td className="table-td max-w-[200px] truncate">{row.description || '—'}</td>
                    <td className="table-td text-right"><QtyBadge value={row.po_qty} /></td>
                    <td className="table-td text-right"><QtyBadge value={row.planned_qty} /></td>
                    <td className="table-td text-right"><QtyBadge value={row.actual_qty} /></td>
                    <td className="table-td text-right"><QtyBadge value={row.billed_qty} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'production', label: 'Production', icon: Factory },
  { id: 'summary',    label: 'Summary',    icon: BarChart3 },
  { id: 'detail',     label: 'Detail',     icon: ListFilter },
  { id: 'config',     label: 'Config',     icon: Settings },
];

export default function CMInventory() {
  const { seller } = useAuth();
  const [tab, setTab] = useState('production');
  const isAdmin = seller?.role === 'seller_admin';
  const visibleTabs = isAdmin ? TABS : TABS.filter(t => t.id !== 'config');

  return (
    <div className="space-y-5">
      <div className="page-hero">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="hero-title">Contract Manufacturer Inventory</h2>
            <p className="hero-subtitle">
              Track production actuals against PO quantities — synced from Zoho Books.
            </p>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="chip-soft">Zoho Books Sync</span>
              <span className="chip-soft">Actual vs Planned</span>
              <span className="chip-soft">Physical Inventory</span>
              {isAdmin && <span className="chip-soft">CM Config</span>}
            </div>
          </div>
          <span className="status-live text-white/90 self-start">
            <Warehouse className="h-3.5 w-3.5" /> CM Inventory
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1 w-fit">
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
              tab === id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      {tab === 'production' && <ProductionView />}
      {tab === 'summary'    && <SummaryView />}
      {tab === 'detail'     && <DetailView />}
      {tab === 'config'     && isAdmin && <CMConfigPanel onConfigSaved={() => {}} />}
    </div>
  );
}
