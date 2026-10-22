import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { SlidersHorizontal, Edit3, Trash2, RefreshCw, X, Box, Zap, ShieldAlert, Copy, Shirt, Plus, Search } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { parsePoLines, formatPoLinesString } from '../../utils/formatters';
import '../../styles/tokens.css';

interface PoConfigItem {
  id?: string;
  config_code?: string;
  configCode?: string;
  size?: string;
  product_type?: string;
  productType?: string;
  quantity: number;
}

interface FullPoFormData {
  poNumber: string;
  poName: string;
  mapPo: string;
  customer: string;
  styleId: string;
  supervisorId: string;
  shiftId: string;
  startDate: string;
  dueDate: string;
  plant?: string;
  lineNumber?: string;
  status: string;
  qcTestMode: string;
  remarks: string;
  allowNoProductPrefix: boolean;
  allowNoBoxPrefix: boolean;
  totalQuantity: number;
  configs: PoConfigItem[];
}

export const AdminOrders: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useApp();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Reference catalog data for full edit
  const [stylesList, setStylesList] = useState<any[]>([]);
  const [supervisorsList, setSupervisorsList] = useState<any[]>([]);
  const [shiftsList, setShiftsList] = useState<any[]>([]);

  // 1. Edit Quantity Modal State
  const [qtyOrder, setQtyOrder] = useState<any | null>(null);
  const [editTotalQty, setEditTotalQty] = useState<number>(0);
  const [editConfigs, setEditConfigs] = useState<PoConfigItem[]>([]);
  const [savingQty, setSavingQty] = useState<boolean>(false);
  const [isQtyDirty, setIsQtyDirty] = useState<boolean>(false);

  // 2. Edit Full PO Modal State
  const [fullOrder, setFullOrder] = useState<any | null>(null);
  const [fullForm, setFullForm] = useState<FullPoFormData>({
    poNumber: '',
    poName: '',
    mapPo: '',
    customer: '',
    styleId: '',
    supervisorId: '',
    shiftId: '',
    startDate: '',
    dueDate: '',
    plant: '',
    status: 'CURRENT',
    qcTestMode: 'QC & Test',
    remarks: '',
    allowNoProductPrefix: false,
    allowNoBoxPrefix: false,
    totalQuantity: 500,
    configs: []
  });
  const [savingFull, setSavingFull] = useState<boolean>(false);
  const [isFullDirty, setIsFullDirty] = useState<boolean>(false);

  // 3. Delete PO Modal State
  const [deleteTargetPo, setDeleteTargetPo] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  // ── Tab State & Garment Styles Management State ─────────────────
  const [activeTab, setActiveTab] = useState<'orders' | 'styles'>('orders');
  const [adminStyles, setAdminStyles] = useState<any[]>([]);
  const [loadingStyles, setLoadingStyles] = useState<boolean>(false);
  const [styleSearchQuery, setStyleSearchQuery] = useState<string>('');

  // Add Style Modal State
  const [showAddStyleModal, setShowAddStyleModal] = useState<boolean>(false);
  const [newStyleForm, setNewStyleForm] = useState({
    code: '',
    name: '',
    customer: '',
    season: '',
    notes: ''
  });
  const [savingNewStyle, setSavingNewStyle] = useState<boolean>(false);

  // Delete Style Modal State
  const [deleteTargetStyle, setDeleteTargetStyle] = useState<any | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState<boolean>(false);
  const [deletingStyle, setDeletingStyle] = useState<boolean>(false);

  const fetchAdminStyles = async () => {
    setLoadingStyles(true);
    try {
      const res = await apiFetch('/api/admin/styles');
      if (Array.isArray(res)) {
        setAdminStyles(res);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load garment styles', 'error');
    } finally {
      setLoadingStyles(false);
    }
  };

  const handleCreateStyle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStyleForm.code.trim() || !newStyleForm.name.trim()) {
      showToast('Style code and style name are required', 'error');
      return;
    }
    setSavingNewStyle(true);
    try {
      await apiFetch('/api/styles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStyleForm)
      });
      showToast(`Style "${newStyleForm.code}" created successfully`, 'success');
      setShowAddStyleModal(false);
      setNewStyleForm({ code: '', name: '', customer: '', season: '', notes: '' });
      fetchAdminStyles();
      fetchReferenceData();
    } catch (err: any) {
      showToast(err.message || 'Failed to create style', 'error');
    } finally {
      setSavingNewStyle(false);
    }
  };

  const handleDeleteStyle = async () => {
    if (!deleteTargetStyle) return;
    setDeletingStyle(true);
    try {
      const query = confirmUnlink ? '?force=true' : '';
      await apiFetch(`/api/admin/styles/${deleteTargetStyle.id}${query}`, {
        method: 'DELETE'
      });
      showToast(`Style "${deleteTargetStyle.code || deleteTargetStyle.name}" deleted successfully`, 'success');
      setDeleteTargetStyle(null);
      setConfirmUnlink(false);
      fetchAdminStyles();
      fetchReferenceData();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete style', 'error');
    } finally {
      setDeletingStyle(false);
    }
  };

  const filteredStyles = adminStyles.filter((s) => {
    if (!styleSearchQuery.trim()) return true;
    const q = styleSearchQuery.toLowerCase();
    return (
      (s.code || '').toLowerCase().includes(q) ||
      (s.name || '').toLowerCase().includes(q) ||
      (s.customer || '').toLowerCase().includes(q) ||
      (s.season || '').toLowerCase().includes(q)
    );
  });

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/admin/orders');
      if (Array.isArray(data)) {
        setOrders(data);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch production orders', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchReferenceData = async () => {
    try {
      const [stylesData, usersData, shiftsData] = await Promise.allSettled([
        apiFetch('/api/styles'),
        apiFetch('/api/admin/users'),
        apiFetch('/api/shifts')
      ]);

      if (stylesData.status === 'fulfilled' && Array.isArray(stylesData.value)) {
        setStylesList(stylesData.value);
      }
      if (usersData.status === 'fulfilled' && Array.isArray(usersData.value)) {
        // Include supervisors and admins
        const sups = usersData.value.filter((u: any) => u.role === 'SUPERVISOR' || u.role === 'ADMIN');
        setSupervisorsList(sups.length > 0 ? sups : usersData.value);
      }
      if (shiftsData.status === 'fulfilled' && Array.isArray(shiftsData.value)) {
        setShiftsList(shiftsData.value);
      }
    } catch (err) {
      console.warn('Failed to pre-fetch reference catalogs', err);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchReferenceData();
    fetchAdminStyles();
  }, []);

  // ── Open Edit PO Qty Modal ───────────────────────────────────────
  const openEditQtyModal = (po: any) => {
    setQtyOrder(po);
    setEditTotalQty(po.configuredQuantity || po.total_quantity || 500);
    setEditConfigs(
      (po.configs || []).map((c: any) => ({
        id: c.id,
        config_code: c.config_code || c.configCode,
        size: c.size,
        quantity: c.quantity || 0
      }))
    );
    setIsQtyDirty(false);
  };

  const handleCloseQtyModal = () => {
    if (isQtyDirty && !window.confirm('You have unsaved quantity edits. Discard changes and close?')) {
      return;
    }
    setQtyOrder(null);
    setIsQtyDirty(false);
  };

  const handleSaveQuantity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qtyOrder) return;

    setSavingQty(true);
    try {
      const payload: any = {};
      if (editConfigs.length > 0) {
        payload.configs = editConfigs.map(c => ({
          id: c.id,
          quantity: Number(c.quantity)
        }));
        payload.newQuantity = editConfigs.reduce((sum, c) => sum + Number(c.quantity || 0), 0);
      } else {
        payload.newQuantity = Number(editTotalQty);
      }

      await apiFetch(`/api/admin/orders/${qtyOrder.id}/quantity`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });

      showToast(`Updated planned quantity for PO ${qtyOrder.poNumber || qtyOrder.po_number}`, 'success');
      setQtyOrder(null);
      setIsQtyDirty(false);
      fetchOrders();
    } catch (err: any) {
      showToast(err.message || 'Failed to update PO quantity', 'error');
    } finally {
      setSavingQty(false);
    }
  };

  // ── Open Edit Full PO Modal ───────────────────────────────────────
  const openEditFullModal = (po: any) => {
    setFullOrder(po);

    let resolvedQcMode = 'QC & Test';
    const rawQc = po.qcTestMode || po.qc_test_mode;
    if (rawQc === 'QC_ONLY' || rawQc === 'QC Only') resolvedQcMode = 'QC Only';
    else if (rawQc === 'TEST_ONLY' || rawQc === 'Test Only') resolvedQcMode = 'Test Only';

    setFullForm({
      poNumber: po.poNumber || po.po_number || '',
      poName: po.poName || po.po_name || '',
      mapPo: po.mapPo || po.map_po || po.poNumber || po.po_number || '',
      customer: po.customer || 'Factory Customer',
      styleId: po.styleId || po.style_id || '',
      supervisorId: po.supervisorId || po.supervisor_id || '',
      shiftId: po.shiftId || po.shift_id || '',
      startDate: po.startDate || po.start_date || new Date().toISOString().split('T')[0],
      dueDate: po.dueDate || po.due_date || new Date().toISOString().split('T')[0],
      plant: po.plant || '',
      lineNumber: po.lineNumber || po.line_number || '',
      status: (po.status || 'CURRENT').toUpperCase(),
      qcTestMode: resolvedQcMode,
      remarks: po.remarks || '',
      allowNoProductPrefix: Boolean(po.allowNoProductPrefix),
      allowNoBoxPrefix: Boolean(po.allowNoBoxPrefix),
      totalQuantity: po.configuredQuantity || po.total_quantity || 500,
      configs: (po.configs || []).map((c: any) => ({
        id: c.id,
        configCode: c.configCode || c.config_code,
        size: c.size,
        productType: c.productType || c.product_type,
        quantity: Number(c.quantity) || 0
      }))
    });
    setIsFullDirty(false);
  };

  const handleCloseFullModal = () => {
    if (isFullDirty && !window.confirm('You have unsaved changes in this PO. Discard and close?')) {
      return;
    }
    setFullOrder(null);
    setIsFullDirty(false);
  };

  const handleSaveFullOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullOrder) return;

    if (!fullForm.poNumber.trim()) {
      showToast('PO Number is required', 'error');
      return;
    }
    if (!fullForm.customer.trim()) {
      showToast('Customer name is required', 'error');
      return;
    }

    setSavingFull(true);
    try {
      const payload: any = {
        poNumber: fullForm.poNumber.trim(),
        poName: fullForm.poName.trim() || null,
        mapPo: fullForm.mapPo.trim() || fullForm.poNumber.trim(),
        customer: fullForm.customer.trim(),
        styleId: fullForm.styleId || null,
        supervisorId: fullForm.supervisorId || null,
        shiftId: fullForm.shiftId || null,
        plant: fullForm.plant?.trim() || null,
        lineNumber: fullForm.lineNumber?.trim() ? (formatPoLinesString(fullForm.lineNumber) || fullForm.lineNumber.trim()) : null,
        startDate: fullForm.startDate,
        dueDate: fullForm.dueDate,
        status: fullForm.status,
        qcTestMode: fullForm.qcTestMode,
        remarks: fullForm.remarks,
        allowNoProductPrefix: fullForm.allowNoProductPrefix,
        allowNoBoxPrefix: fullForm.allowNoBoxPrefix
      };

      if (fullForm.configs.length > 0) {
        payload.configs = fullForm.configs.map(c => ({
          id: c.id,
          configCode: c.configCode || c.config_code,
          size: c.size,
          productType: c.productType || c.product_type,
          quantity: Number(c.quantity)
        }));
        payload.totalQuantity = fullForm.configs.reduce((sum, c) => sum + Number(c.quantity || 0), 0);
      } else {
        payload.totalQuantity = Number(fullForm.totalQuantity);
      }

      const res = await apiFetch<{ message: string; order: any }>(`/api/admin/orders/${fullOrder.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });

      showToast(res.message || `PO ${fullForm.poNumber} updated successfully`, 'success');
      setFullOrder(null);
      setIsFullDirty(false);
      fetchOrders();
    } catch (err: any) {
      showToast(err.message || 'Failed to update Production Order', 'error');
    } finally {
      setSavingFull(false);
    }
  };

  const handleDeletePo = async () => {
    if (!deleteTargetPo) return;
    setDeleting(true);
    try {
      const res = await apiFetch<{ message: string }>(`/api/admin/orders/${deleteTargetPo.id}`, {
        method: 'DELETE'
      });
      showToast(res.message || `PO ${deleteTargetPo.poNumber || deleteTargetPo.po_number} permanently deleted`, 'success');
      setDeleteTargetPo(null);
      fetchOrders();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete Production Order', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyPoToNew = (po: any) => {
    const newPoId = `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const draftGen = {
      id: newPoId,
      poName: po.poName || po.po_name ? `${po.poName || po.po_name} (Copy)` : `${po.poNumber || po.po_number || po.id} Copy`,
      mapPo: po.mapPo || po.map_po ? `${po.mapPo || po.map_po}-COPY` : `MAP-PO-${Math.floor(40000 + Math.random() * 9000)}`,
      customer: po.customer,
      styleId: po.styleId || po.style_id,
      styleCode: po.styleCode || po.style_code,
      styleName: po.styleName || po.style_name,
      startDate: po.startDate || po.start_date,
      dueDate: po.dueDate || po.due_date,
      supervisorId: po.supervisorId || po.supervisor_id,
      shiftId: po.shiftId || po.shift_id,
      shiftName: po.shiftName || po.shift_name,
      remarks: po.remarks,
      selectedOperations: po.selectedOperations || ['Pre QC', 'QC Test', 'Packing', 'AQL Checker', 'Box Transfer'],
      qcTestMode: po.qcTestMode || 'QC & Test',
      qcStationCount: po.qcStationCount || po.qc_station_count || 1,
      allocations: po.allocations || po.shifts || []
    };

    sessionStorage.setItem('uniflow_draft_po_style_id', po.styleId || po.style_id || '');
    sessionStorage.setItem('uniflow_draft_po_general', JSON.stringify(draftGen));
    sessionStorage.setItem('uniflow_draft_po_shifts', JSON.stringify(po.allocations || po.shifts || []));
    sessionStorage.setItem('uniflow_draft_po_configs', JSON.stringify(po.productConfigurations || []));
    sessionStorage.setItem('uniflow_draft_po_box_configs', JSON.stringify(po.boxConfigurations || []));
    sessionStorage.setItem('uniflow_draft_po_allow_no_product_prefix', String(Boolean(po.allowNoProductPrefix || po.allow_no_product_prefix)));
    sessionStorage.setItem('uniflow_draft_po_allow_no_box_prefix', String(Boolean(po.allowNoBoxPrefix || po.allow_no_box_prefix)));
    sessionStorage.setItem('uniflow_copy_source_po_id', po.poNumber || po.po_number || po.id);

    showToast(`Configurations copied from ${po.poNumber || po.po_number || po.id}! Customizing new PO...`, 'info');
    navigate('/supervisor/production-orders/new/general');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ flex: '1 1 auto', minWidth: '200px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>
            {activeTab === 'orders' ? 'Factory Production Orders & Quantity Config' : 'Garment Styles Management'}
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
            {activeTab === 'orders'
              ? 'Configure target quantities, style allocations, and full PO specifications with audit logging.'
              : 'View, create, and manage garment styles catalog and production order associations.'}
          </p>
        </div>
        <div className="admin-page-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {activeTab === 'orders' ? (
            <>
              <button
                onClick={fetchOrders}
                className="btn btn-secondary"
                style={{ padding: '9px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '10px', whiteSpace: 'nowrap' }}
                disabled={loading}
              >
                <RefreshCw size={14} className={loading ? 'spin' : ''} />
                {loading ? 'Refreshing...' : 'Refresh Orders'}
              </button>
              <button
                onClick={() => navigate('/supervisor/production-orders/new/style')}
                className="btn btn-primary"
                style={{ padding: '9px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '10px', whiteSpace: 'nowrap' }}
              >
                <Zap size={14} /> + New Production Order
              </button>
            </>
          ) : (
            <>
              <button
                onClick={fetchAdminStyles}
                className="btn btn-secondary"
                style={{ padding: '9px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '10px', whiteSpace: 'nowrap' }}
                disabled={loadingStyles}
              >
                <RefreshCw size={14} className={loadingStyles ? 'spin' : ''} />
                {loadingStyles ? 'Refreshing...' : 'Refresh Styles'}
              </button>
              <button
                onClick={() => setShowAddStyleModal(true)}
                className="btn btn-primary"
                style={{ padding: '9px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '10px', whiteSpace: 'nowrap' }}
              >
                <Plus size={14} /> + Add New Style
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Modern Tabs Bar ── */}
      <div style={{
        display: 'flex',
        gap: '6px',
        backgroundColor: 'var(--bg-surface-1)',
        padding: '5px',
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        width: '100%',
        maxWidth: '460px',
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          style={{
            flex: 1,
            padding: '8px 14px',
            fontSize: '13px',
            fontWeight: 800,
            borderRadius: '9px',
            backgroundColor: activeTab === 'orders' ? 'var(--primary-teal)' : 'transparent',
            color: activeTab === 'orders' ? '#071B23' : 'var(--text-secondary)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap'
          }}
        >
          <Box size={16} /> Production Orders ({orders.length})
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('styles'); fetchAdminStyles(); }}
          style={{
            flex: 1,
            padding: '8px 14px',
            fontSize: '13px',
            fontWeight: 800,
            borderRadius: '9px',
            backgroundColor: activeTab === 'styles' ? 'var(--primary-teal)' : 'transparent',
            color: activeTab === 'styles' ? '#071B23' : 'var(--text-secondary)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap'
          }}
        >
          <Shirt size={16} /> Garment Styles ({adminStyles.length})
        </button>
      </div>

      {/* ── Active Tab Content: Orders vs Styles ── */}
      {activeTab === 'orders' ? (
        loading && orders.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading production orders...
        </div>
      ) : orders.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No production orders registered.
        </div>
      ) : (
        <div className="grid-2-desktop" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '14px' }}>
          {orders.map(po => {
            const packedQty = Number(po.packedCount || po.packed_count || 0);
            const targetQty = Number(po.configuredQuantity || po.total_quantity || 500);
            const configs: any[] = po.configs || [];
            const percent = targetQty > 0 ? Math.min(100, Math.round((packedQty / targetQty) * 100)) : 0;

            return (
              <div key={po.id} className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Header Row: PO Number & Status Pill */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Box size={16} color="var(--color-teal)" />
                    <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-teal)', margin: 0 }}>
                      {po.poNumber || po.po_number}
                    </h3>
                  </div>
                  <StatusPill label={po.status || 'CURRENT'} variant={po.status === 'COMPLETED' ? 'green' : 'teal'} />
                </div>

                {/* Sub-info: Name, Style, Plant, Line */}
                <div>
                  {(po.poName || po.po_name) && (
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      🏷️ {po.poName || po.po_name}
                    </span>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Style: <strong>{po.styleName || po.style_name || 'Standard Style'}</strong></span>
                    {po.plant && (
                      <span style={{
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(59, 130, 246, 0.15)',
                        color: '#60a5fa',
                        fontWeight: 700
                      }}>
                        🏢 {po.plant}
                      </span>
                    )}
                    {(po.lineNumber || po.line_number) && (
                      <span style={{
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(168, 85, 247, 0.15)',
                        color: '#c084fc',
                        fontWeight: 700
                      }}>
                        🧵 {po.lineNumber || po.line_number}
                      </span>
                    )}
                  </div>
                  {(po.allowNoProductPrefix || po.allowNoBoxPrefix) && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                      {po.allowNoProductPrefix && (
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(20, 184, 166, 0.15)', color: 'var(--color-teal)', fontWeight: 700 }}>
                          🔓 Free Serials
                        </span>
                      )}
                      {po.allowNoBoxPrefix && (
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(20, 184, 166, 0.15)', color: 'var(--color-teal)', fontWeight: 700 }}>
                          📦 Free Box IDs
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Target vs Packed:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{packedQty} / {targetQty} pcs ({percent}%)</strong>
                  </div>
                  <ProgressBar current={packedQty} total={targetQty} height={8} color="var(--color-teal)" />
                </div>

                {/* Configurations breakdown */}
                {configs.length > 0 && (
                  <div style={{ marginTop: '2px', paddingTop: '8px', borderTop: '1px dashed var(--border-color)' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Configured Sizes & Quantities ({configs.length}):
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                      {configs.map((cfg: any) => (
                        <div key={cfg.id} style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', backgroundColor: 'var(--bg-surface-2)', padding: '6px 10px', borderRadius: '6px' }}>
                          <span>Size {cfg.size || 'STD'} ({cfg.config_code || cfg.configCode})</span>
                          <span style={{ color: 'var(--color-teal)', fontWeight: 700 }}>{cfg.quantity} pcs</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Card Action Buttons: Dedicated Row at the bottom */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                  <button
                    onClick={() => openEditQtyModal(po)}
                    style={{
                      flex: '1 1 calc(50% - 6px)',
                      minWidth: '115px',
                      fontSize: '11px',
                      padding: '7px 10px',
                      borderRadius: '7px',
                      backgroundColor: 'rgba(20, 184, 166, 0.15)',
                      border: '1px solid var(--color-teal)',
                      color: 'var(--color-teal)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                    title="Edit only the quantity of this PO"
                  >
                    <SlidersHorizontal size={12} /> Edit PO Qty
                  </button>
                  <button
                    onClick={() => openEditFullModal(po)}
                    style={{
                      flex: '1 1 calc(50% - 6px)',
                      minWidth: '115px',
                      fontSize: '11px',
                      padding: '7px 10px',
                      borderRadius: '7px',
                      backgroundColor: 'rgba(168, 85, 247, 0.15)',
                      border: '1px solid #a855f7',
                      color: '#c084fc',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                    title="Edit all fields of this PO"
                  >
                    <Edit3 size={12} /> Edit Full PO
                  </button>
                  <button
                    onClick={() => handleCopyPoToNew(po)}
                    style={{
                      flex: '1 1 calc(50% - 6px)',
                      minWidth: '115px',
                      fontSize: '11px',
                      padding: '7px 10px',
                      borderRadius: '7px',
                      backgroundColor: 'rgba(59, 130, 246, 0.15)',
                      border: '1px solid #3b82f6',
                      color: '#60a5fa',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                    title="Copy this PO configurations to create a new Production Order"
                  >
                    <Copy size={12} /> Copy to New PO
                  </button>
                  <button
                    onClick={() => setDeleteTargetPo(po)}
                    style={{
                      flex: '1 1 calc(50% - 6px)',
                      minWidth: '115px',
                      fontSize: '11px',
                      padding: '7px 10px',
                      borderRadius: '7px',
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid #ef4444',
                      color: '#f87171',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                    title="Permanently delete this Production Order"
                  >
                    <Trash2 size={12} /> Delete PO
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )) : (
        /* ── Garment Styles Tab View ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Search & Actions Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            backgroundColor: 'var(--bg-surface-1)',
            padding: '12px 16px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 260px', maxWidth: '400px' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search styles by code, name, customer..."
                  value={styleSearchQuery}
                  onChange={(e) => setStyleSearchQuery(e.target.value)}
                  style={{
                    ...styles.input,
                    paddingLeft: '34px',
                    margin: 0
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Showing <strong>{filteredStyles.length}</strong> of {adminStyles.length} styles
              </span>
              <button
                type="button"
                onClick={() => setShowAddStyleModal(true)}
                className="btn btn-primary"
                style={{ padding: '8px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px' }}
              >
                <Plus size={14} /> Add New Style
              </button>
            </div>
          </div>

          {/* Styles Grid */}
          {loadingStyles && adminStyles.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading garment styles...
            </div>
          ) : filteredStyles.length === 0 ? (
            <div style={{
              padding: '48px 24px',
              textAlign: 'center',
              backgroundColor: 'var(--bg-surface-1)',
              borderRadius: '14px',
              border: '1px dashed var(--border-color)',
              color: 'var(--text-muted)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px'
            }}>
              <Shirt size={32} color="var(--text-muted)" style={{ opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>No garment styles found</p>
              <p style={{ margin: 0, fontSize: '12px' }}>
                {styleSearchQuery ? 'Try matching a different keyword or filter' : 'Create your first garment style to get started'}
              </p>
              <button
                type="button"
                onClick={() => setShowAddStyleModal(true)}
                className="btn btn-primary"
                style={{ marginTop: '8px', padding: '8px 16px', fontSize: '12px' }}
              >
                <Plus size={14} /> Add New Style
              </button>
            </div>
          ) : (
            <div className="grid-2-desktop" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '14px' }}>
              {filteredStyles.map((s: any) => {
                const poCount = Number(s.po_count || 0);
                return (
                  <div
                    key={s.id}
                    className="card"
                    style={{
                      backgroundColor: 'var(--bg-surface-1)',
                      margin: 0,
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '12px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(20, 184, 166, 0.15)',
                              color: 'var(--color-teal)',
                              fontWeight: 800,
                              fontSize: '12px',
                              fontFamily: 'monospace'
                            }}>
                              {s.code}
                            </span>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '10px',
                              backgroundColor: poCount > 0 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                              color: poCount > 0 ? '#60a5fa' : 'var(--text-muted)',
                              fontSize: '11px',
                              fontWeight: 700
                            }}>
                              {poCount} {poCount === 1 ? 'PO' : 'POs'} Linked
                            </span>
                          </div>
                          <h4 style={{ margin: '8px 0 0 0', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {s.name}
                          </h4>
                        </div>

                        {/* Delete Style Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteTargetStyle(s);
                            setConfirmUnlink(false);
                          }}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '7px',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#ef4444',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            transition: 'all 0.2s ease'
                          }}
                          title="Delete Style"
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>

                      {/* Metadata Table / Items */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px', fontSize: '12px' }}>
                        <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '6px 10px', borderRadius: '6px' }}>
                          <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>Customer</span>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{s.customer || '—'}</span>
                        </div>
                        <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '6px 10px', borderRadius: '6px' }}>
                          <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>Season</span>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{s.season || '—'}</span>
                        </div>
                      </div>

                      {s.notes && (
                        <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic', backgroundColor: 'rgba(255, 255, 255, 0.02)', padding: '6px 8px', borderRadius: '6px' }}>
                          "{s.notes}"
                        </div>
                      )}
                    </div>

                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Added: {s.created_at ? new Date(s.created_at).toLocaleDateString() : 'Active'}</span>
                      <span style={{ color: 'var(--color-teal)' }}>ID: {s.id}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 1. EDIT PO QUANTITY MODAL ────────────────────────────────────── */}
      {qtyOrder && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '12px 8px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '520px',
            padding: '16px',
            maxHeight: '92vh',
            overflowY: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-teal)' }}>PO QUANTITY CONFIGURATION</span>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Edit PO Quantity: {qtyOrder.poNumber || qtyOrder.po_number}
                </h3>
              </div>
              <button onClick={handleCloseQtyModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ backgroundColor: 'rgba(20, 184, 166, 0.1)', border: '1px solid rgba(20, 184, 166, 0.3)', padding: '10px 12px', borderRadius: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-teal)' }}>
                🛡️ Processed Safety Limit: Minimum {qtyOrder.packedCount || qtyOrder.packed_count || 0} pcs
              </span>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                You cannot reduce target planned quantity below already packed/processed garments ({qtyOrder.packedCount || qtyOrder.packed_count || 0} pcs). This updates only the quantity.
              </p>
            </div>

            <form onSubmit={handleSaveQuantity} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {editConfigs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>Size Configurations Quantity:</label>
                  {editConfigs.map((cfg, index) => (
                    <div key={cfg.id || index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', minWidth: '120px' }}>
                        Size {cfg.size || 'STD'} ({cfg.config_code || cfg.configCode})
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={cfg.quantity}
                        onChange={e => {
                          const val = Number(e.target.value);
                          const updated = [...editConfigs];
                          updated[index].quantity = val;
                          setEditConfigs(updated);
                          setIsQtyDirty(true);
                        }}
                        style={{
                          width: '100px',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          backgroundColor: 'var(--bg-surface-2)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-primary)',
                          fontWeight: 700
                        }}
                        required
                      />
                    </div>
                  ))}
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-teal)', textAlign: 'right', marginTop: '4px' }}>
                    Total Target Planned: {editConfigs.reduce((sum, c) => sum + Number(c.quantity || 0), 0)} pcs
                  </div>
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>Total Target Quantity (pcs)</label>
                  <input
                    type="number"
                    min={Number(qtyOrder.packedCount || qtyOrder.packed_count || 0)}
                    value={editTotalQty}
                    onChange={e => {
                      setEditTotalQty(Number(e.target.value));
                      setIsQtyDirty(true);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--bg-surface-2)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      fontWeight: 700
                    }}
                    required
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={handleCloseQtyModal}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={savingQty}
                >
                  {savingQty ? 'Saving...' : 'Save Quantity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 2. EDIT FULL PO MODAL ────────────────────────────────────────── */}
      {fullOrder && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.78)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '12px 8px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '680px',
            maxHeight: '94vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 30px 60px -15px rgba(0, 0, 0, 0.8)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--bg-surface-1)'
            }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  FULL PRODUCTION ORDER MANAGEMENT
                </span>
                <h3 style={{ margin: '2px 0 0 0', fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Edit Full PO: {fullOrder.poNumber || fullOrder.po_number}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseFullModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Form Content */}
            <form onSubmit={handleSaveFullOrder} style={{ overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Safety banner */}
              <div style={{
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                padding: '10px 14px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <ShieldAlert size={18} color="#c084fc" />
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: '#c084fc' }}>Processed Safeguard: </strong>
                  Cannot reduce quantity below already processed garments ({fullOrder.packedCount || fullOrder.packed_count || 0} pcs). Existing IDs, relationships, and tracking records will be preserved.
                </div>
              </div>

              {/* 1. Identification Section */}
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  1. PO Identification & Reference
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '12px', marginTop: '8px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      PO Number *
                    </label>
                    <input
                      type="text"
                      value={fullForm.poNumber}
                      onChange={e => {
                        setFullForm({ ...fullForm, poNumber: e.target.value });
                        setIsFullDirty(true);
                      }}
                      required
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      PO Display Name / Tag
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Summer Batch 2026"
                      value={fullForm.poName}
                      onChange={e => {
                        setFullForm({ ...fullForm, poName: e.target.value });
                        setIsFullDirty(true);
                      }}
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      Customer / Buyer *
                    </label>
                    <input
                      type="text"
                      value={fullForm.customer}
                      onChange={e => {
                        setFullForm({ ...fullForm, customer: e.target.value });
                        setIsFullDirty(true);
                      }}
                      required
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      Map PO / External Ref
                    </label>
                    <input
                      type="text"
                      value={fullForm.mapPo}
                      onChange={e => {
                        setFullForm({ ...fullForm, mapPo: e.target.value });
                        setIsFullDirty(true);
                      }}
                      style={styles.input}
                    />
                  </div>
                </div>
              </div>

              {/* 2. Operations & Style Section */}
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  2. Style & Operational Assignment
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '12px', marginTop: '8px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      Garment Style
                    </label>
                    <select
                      value={fullForm.styleId}
                      onChange={e => {
                        setFullForm({ ...fullForm, styleId: e.target.value });
                        setIsFullDirty(true);
                      }}
                      style={styles.select}
                    >
                      <option value="">-- Current Style ({fullOrder.styleName || 'Standard'}) --</option>
                      {stylesList.map(st => (
                        <option key={st.id} value={st.id}>
                          {st.name} ({st.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      Assigned Supervisor
                    </label>
                    <select
                      value={fullForm.supervisorId}
                      onChange={e => {
                        setFullForm({ ...fullForm, supervisorId: e.target.value });
                        setIsFullDirty(true);
                      }}
                      style={styles.select}
                    >
                      <option value="">-- Keep Current ({fullOrder.supervisorName || 'Supervisor'}) --</option>
                      {supervisorsList.map(sup => (
                        <option key={sup.id} value={sup.id}>
                          {sup.full_name || sup.name || sup.username} ({sup.employee_no || sup.role})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      Shift Allocation
                    </label>
                    <select
                      value={fullForm.shiftId}
                      onChange={e => {
                        setFullForm({ ...fullForm, shiftId: e.target.value });
                        setIsFullDirty(true);
                      }}
                      style={styles.select}
                    >
                      <option value="">-- Factory Shift (Default) --</option>
                      {shiftsList.map(sh => (
                        <option key={sh.id} value={sh.id}>
                          {sh.name} ({sh.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      Order Status
                    </label>
                    <select
                      value={fullForm.status}
                      onChange={e => {
                        setFullForm({ ...fullForm, status: e.target.value });
                        setIsFullDirty(true);
                      }}
                      style={styles.select}
                    >
                      <option value="CURRENT">CURRENT (Active / In Progress)</option>
                      <option value="COMPLETED">COMPLETED</option>
                      <option value="DRAFT">DRAFT</option>
                      <option value="CANCELLED">CANCELLED</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      Plant / Garment Location
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Biyagama, Katunayake"
                      value={fullForm.plant || ''}
                      onChange={e => {
                        setFullForm({ ...fullForm, plant: e.target.value });
                        setIsFullDirty(true);
                      }}
                      style={styles.input}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                        Production Line Numbers (Assigned Lines)
                      </label>
                      {fullForm.lineNumber?.trim() && (
                        <span style={{ fontSize: '11px', color: 'var(--primary-teal)', fontWeight: 700 }}>
                          {parsePoLines(fullForm.lineNumber).length} Line{parsePoLines(fullForm.lineNumber).length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <div style={{
                        position: 'absolute',
                        left: '12px',
                        color: 'var(--primary-teal)',
                        fontWeight: 800,
                        fontSize: '12px',
                        pointerEvents: 'none'
                      }}>
                        Line
                      </div>
                      <input
                        type="text"
                        placeholder="1, 6, 8 (Enter line numbers separated by comma)"
                        value={(fullForm.lineNumber || '').replace(/^Line\s*/i, '')}
                        onChange={e => {
                          const val = e.target.value;
                          setFullForm({
                            ...fullForm,
                            lineNumber: !val.trim() ? '' : val.toLowerCase().startsWith('line') ? val : `Line ${val}`
                          });
                          setIsFullDirty(true);
                        }}
                        style={{ ...styles.input, paddingLeft: '48px' }}
                      />
                    </div>
                    {fullForm.lineNumber?.trim() && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                        {parsePoLines(fullForm.lineNumber).map((line, idx) => (
                          <span
                            key={idx}
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '10px',
                              backgroundColor: 'rgba(20, 184, 166, 0.15)',
                              color: 'var(--primary-teal)',
                              border: '1px solid rgba(20, 184, 166, 0.35)'
                            }}
                          >
                            ✓ {line}
                          </span>
                        ))}
                      </div>
                    )}
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                      Multiple factory line numbers (e.g. 1, 6, 8). Operators can select their active line during work.
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Schedule & QC Mode */}
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  3. Timeline Schedule & Quality Testing
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '12px', marginTop: '8px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      Start Date *
                    </label>
                    <input
                      type="date"
                      value={fullForm.startDate}
                      onChange={e => {
                        setFullForm({ ...fullForm, startDate: e.target.value });
                        setIsFullDirty(true);
                      }}
                      required
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      Due Date *
                    </label>
                    <input
                      type="date"
                      value={fullForm.dueDate}
                      onChange={e => {
                        setFullForm({ ...fullForm, dueDate: e.target.value });
                        setIsFullDirty(true);
                      }}
                      required
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      QC Test Mode
                    </label>
                    <select
                      value={fullForm.qcTestMode}
                      onChange={e => {
                        setFullForm({ ...fullForm, qcTestMode: e.target.value });
                        setIsFullDirty(true);
                      }}
                      style={styles.select}
                    >
                      <option value="QC & Test">QC & Test (Standard)</option>
                      <option value="QC Only">QC Only</option>
                      <option value="Test Only">Test Only</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 4. Prefix Validation Modes */}
              <div style={{ padding: '14px', borderRadius: '12px', backgroundColor: 'var(--bg-surface-2)', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>
                  4. Prefix Validation Modes
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={fullForm.allowNoProductPrefix}
                      onChange={e => {
                        setFullForm({ ...fullForm, allowNoProductPrefix: e.target.checked });
                        setIsFullDirty(true);
                      }}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--color-teal)' }}
                    />
                    <span>
                      <strong>No Prefix / Free Serial Numbers</strong>
                      <small style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '11px' }}>
                        Permit product serial numbers without enforcing configured prefixes.
                      </small>
                    </span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={fullForm.allowNoBoxPrefix}
                      onChange={e => {
                        setFullForm({ ...fullForm, allowNoBoxPrefix: e.target.checked });
                        setIsFullDirty(true);
                      }}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--color-teal)' }}
                    />
                    <span>
                      <strong>No Box Prefix / Free Box Identifiers</strong>
                      <small style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '11px' }}>
                        Permit any box identifier without enforcing configured box prefix.
                      </small>
                    </span>
                  </label>
                </div>
              </div>

              {/* 5. Planned Quantities & Configurations */}
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  5. Target Quantities & Size Breakdown
                </span>
                {fullForm.configs.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                    {fullForm.configs.map((cfg, index) => (
                      <div key={cfg.id || index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', backgroundColor: 'var(--bg-surface-2)', padding: '8px 12px', borderRadius: '8px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>
                          Size {cfg.size || 'STD'} ({cfg.configCode || cfg.config_code})
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="number"
                            min={1}
                            value={cfg.quantity}
                            onChange={e => {
                              const val = Number(e.target.value);
                              const updated = [...fullForm.configs];
                              updated[index].quantity = val;
                              setFullForm({ ...fullForm, configs: updated });
                              setIsFullDirty(true);
                            }}
                            style={{
                              width: '90px',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              backgroundColor: 'var(--bg-surface-1)',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-primary)',
                              fontWeight: 700,
                              textAlign: 'right'
                            }}
                            required
                          />
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>pcs</span>
                        </div>
                      </div>
                    ))}
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-teal)', textAlign: 'right', marginTop: '4px' }}>
                      Sum Target Planned: {fullForm.configs.reduce((sum, c) => sum + Number(c.quantity || 0), 0)} pcs
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      Total Planned Quantity (pcs) *
                    </label>
                    <input
                      type="number"
                      min={Number(fullOrder.packedCount || fullOrder.packed_count || 0)}
                      value={fullForm.totalQuantity}
                      onChange={e => {
                        setFullForm({ ...fullForm, totalQuantity: Number(e.target.value) });
                        setIsFullDirty(true);
                      }}
                      required
                      style={styles.input}
                    />
                  </div>
                )}
              </div>

              {/* 6. Remarks / Notes */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                  Remarks / Special Instructions
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional production instructions or audit notes..."
                  value={fullForm.remarks}
                  onChange={e => {
                    setFullForm({ ...fullForm, remarks: e.target.value });
                    setIsFullDirty(true);
                  }}
                  style={{
                    ...styles.input,
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Modal Footer Actions */}
              <div style={{
                display: 'flex',
                gap: '12px',
                marginTop: '10px',
                paddingTop: '16px',
                borderTop: '1px solid var(--border-color)'
              }}>
                <button
                  type="button"
                  onClick={handleCloseFullModal}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    flex: 1.5,
                    backgroundColor: '#a855f7',
                    borderColor: '#a855f7',
                    color: '#ffffff'
                  }}
                  disabled={savingFull}
                >
                  {savingFull ? 'Saving Full PO...' : 'Save Full PO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 3. DELETE PO CONFIRMATION MODAL ───────────────────────────── */}
      {deleteTargetPo && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.78)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '20px',
            width: '94%',
            maxWidth: '460px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trash2 size={20} color="#ef4444" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Delete Production Order
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !deleting && setDeleteTargetPo(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              padding: '12px 14px',
              borderRadius: '12px'
            }}>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                Are you sure you want to permanently delete Production Order{' '}
                <strong style={{ color: '#f87171' }}>{deleteTargetPo.poNumber || deleteTargetPo.po_number}</strong>?
              </p>
              <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                This action is irreversible and will permanently delete all associated size configurations, allocations, and child records from the database.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setDeleteTargetPo(null)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeletePo}
                className="btn btn-primary"
                style={{
                  flex: 1.2,
                  backgroundColor: '#ef4444',
                  borderColor: '#ef4444',
                  color: '#ffffff'
                }}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add New Style Modal ────────────────────────────────────── */}
      {showAddStyleModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-color)',
            borderRadius: '20px',
            width: '94%',
            maxWidth: '500px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shirt size={20} color="var(--primary-teal)" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Add New Garment Style
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !savingNewStyle && setShowAddStyleModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateStyle} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Style Code (Required)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ST-900, POLO-01"
                  style={{ ...styles.input, textTransform: 'uppercase', fontWeight: 800 }}
                  value={newStyleForm.code}
                  onChange={e => setNewStyleForm({ ...newStyleForm, code: e.target.value.toUpperCase() })}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Style Name (Required)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Premium BioTab Jersey"
                  style={styles.input}
                  value={newStyleForm.name}
                  onChange={e => setNewStyleForm({ ...newStyleForm, name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                    Customer
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Factory Orders"
                    style={styles.input}
                    value={newStyleForm.customer}
                    onChange={e => setNewStyleForm({ ...newStyleForm, customer: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                    Season
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2026 Q3, Summer"
                    style={styles.input}
                    value={newStyleForm.season}
                    onChange={e => setNewStyleForm({ ...newStyleForm, season: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Notes / Specifications (Optional)
                </label>
                <textarea
                  placeholder="e.g. Standard stitching, 100% cotton..."
                  style={{ ...styles.input, height: '60px', resize: 'vertical' }}
                  value={newStyleForm.notes}
                  onChange={e => setNewStyleForm({ ...newStyleForm, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddStyleModal(false)}
                  disabled={savingNewStyle}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingNewStyle}
                  style={{ flex: 1.2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  {savingNewStyle ? 'Creating...' : '+ Create Style'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Style Confirmation Modal ───────────────────────── */}
      {deleteTargetStyle && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-color)',
            borderRadius: '20px',
            width: '94%',
            maxWidth: '460px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trash2 size={20} color="#ef4444" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Delete Garment Style
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !deletingStyle && setDeleteTargetStyle(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              padding: '12px 14px',
              borderRadius: '12px'
            }}>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                Are you sure you want to permanently delete style{' '}
                <strong style={{ color: '#f87171' }}>{deleteTargetStyle.name} ({deleteTargetStyle.code})</strong>?
              </p>
              <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                This will remove the style from the catalog and drop-down selectors.
              </p>
            </div>

            {Number(deleteTargetStyle.po_count || 0) > 0 && (
              <div style={{
                padding: '10px 12px',
                borderRadius: '10px',
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b' }}>
                  ⚠️ Style Linked to Active Orders
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  This style is currently associated with <strong>{deleteTargetStyle.po_count}</strong> production order(s).
                  Deleting this style will unlink it from these orders.
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={confirmUnlink}
                    onChange={e => setConfirmUnlink(e.target.checked)}
                    style={{ accentColor: '#ef4444' }}
                  />
                  I confirm unlinking and deleting this style
                </label>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => { setDeleteTargetStyle(null); setConfirmUnlink(false); }}
                className="btn btn-secondary"
                style={{ flex: 1 }}
                disabled={deletingStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteStyle}
                className="btn btn-primary"
                style={{
                  flex: 1.2,
                  backgroundColor: '#ef4444',
                  borderColor: '#ef4444',
                  color: '#ffffff',
                  opacity: (Number(deleteTargetStyle.po_count || 0) > 0 && !confirmUnlink) ? 0.5 : 1,
                  cursor: (Number(deleteTargetStyle.po_count || 0) > 0 && !confirmUnlink) ? 'not-allowed' : 'pointer'
                }}
                disabled={deletingStyle || (Number(deleteTargetStyle.po_count || 0) > 0 && !confirmUnlink)}
              >
                {deletingStyle ? 'Deleting...' : 'Delete Style'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  input: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    boxSizing: 'border-box'
  },
  select: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    boxSizing: 'border-box'
  }
};
