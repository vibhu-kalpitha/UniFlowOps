import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../services/api';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { DueDateBadge } from '../../components/DueDateBadge';
import { formatPoDisplayName } from '../../utils/formatters';
import { ProductionOrder } from '../../types';
import { CodeLifecycleModal } from '../../components/CodeLifecycleModal';
import {
  PlusCircle,
  Clock,
  AlertTriangle,
  Box,
  Package,
  CheckCircle2,
  Search,
  Filter,
  X,
  ChevronRight,
  Eye,
  Menu,
  Users,
  ClipboardList,
  Copy,
  ScanLine,
  ArrowRight,
  Layers,
  Sparkles,
  Shirt,
  Calendar,
  Building2
} from 'lucide-react';
import '../../styles/tokens.css';

export const SupervisorHome: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, productionOrders, refreshProductionOrders, showToast } = useApp();

  // Tab State: 'current' (Current Orders oversight) vs 'new' (Create New PO)
  const [activeTab, setActiveTab] = useState<'current' | 'new'>('current');

  // Dashboard Overview state
  const [loading, setLoading] = useState<boolean>(true);
  const [authorizedPos, setAuthorizedPos] = useState<any[]>([]);
  const [selectedPoId, setSelectedPoId] = useState<string>('');
  const [currentPoDetails, setCurrentPoDetails] = useState<any>(null);
  const [overviewMetrics, setOverviewMetrics] = useState<any>({
    plannedQuantity: 0,
    qcCompleted: 0,
    packedQuantity: 0,
    aqlCompleted: 0,
    remainingQuantity: 0,
    completionPct: 0
  });
  const [supervisorBoxes, setSupervisorBoxes] = useState<any[]>([]);
  const [selectedBoxForModal, setSelectedBoxForModal] = useState<any>(null);
  const [showBoxOverview, setShowBoxOverview] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  // Orders Oversight state (merged from SupervisorOrders)
  const [selectedPo, setSelectedPo] = useState<ProductionOrder | null>(null);
  const [updatingPrefix, setUpdatingPrefix] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showLifecycleModal, setShowLifecycleModal] = useState<boolean>(false);
  const [lifecycleSearchCode, setLifecycleSearchCode] = useState<string>('');

  // Synchronize URL query params
  useEffect(() => {
    refreshProductionOrders();
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'new') {
      setActiveTab('new');
    } else if (tabParam === 'current') {
      setActiveTab('current');
    }

    const targetPoId = params.get('poId');
    if (targetPoId && productionOrders.length > 0) {
      const found = productionOrders.find(p => p.id === targetPoId || p.dbId === targetPoId);
      if (found) {
        setSelectedPo(found);
      }
    }
  }, [productionOrders.length]);

  const fetchSupervisorData = async (poIdStr = selectedPoId) => {
    setLoading(true);
    try {
      const url = poIdStr ? `/api/dashboard/supervisor?poId=${encodeURIComponent(poIdStr)}` : '/api/dashboard/supervisor';
      const data = await apiFetch<any>(url);
      if (data) {
        setAuthorizedPos(data.authorizedPos || []);
        setCurrentPoDetails(data.currentPoDetails || null);
        setOverviewMetrics(data.overviewMetrics || {});
        setSupervisorBoxes(data.supervisorBoxes || []);
        if (!selectedPoId && data.currentPoDetails?.poId) {
          setSelectedPoId(data.currentPoDetails.poId);
        }
      }
    } catch (err) {
      console.warn('Failed to load supervisor dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSupervisorData(selectedPoId);
  }, [selectedPoId]);

  const handlePoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPoId = e.target.value;
    setSelectedPoId(newPoId);
  };

  const navTo = (path: string) => {
    setSidebarOpen(false);
    navigate(path);
  };

  // Toggle Prefix validation modes
  const handleTogglePrefix = async (type: 'product' | 'box') => {
    if (!selectedPo) return;
    const targetId = selectedPo.dbId || selectedPo.id;
    const newProductVal = type === 'product' ? !selectedPo.allowNoProductPrefix : selectedPo.allowNoProductPrefix;
    const newBoxVal = type === 'box' ? !selectedPo.allowNoBoxPrefix : selectedPo.allowNoBoxPrefix;

    setUpdatingPrefix(true);
    try {
      const res = await apiFetch<{ ok: boolean; allowNoProductPrefix: boolean; allowNoBoxPrefix: boolean }>(
        `/api/production-orders/${targetId}/no-prefix-config`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            allowNoProductPrefix: newProductVal,
            allowNoBoxPrefix: newBoxVal
          })
        }
      );

      setSelectedPo(prev => prev ? {
        ...prev,
        allowNoProductPrefix: res.allowNoProductPrefix,
        allowNoBoxPrefix: res.allowNoBoxPrefix
      } : null);

      await refreshProductionOrders();
      showToast(
        type === 'product'
          ? `Product serial prefix validation ${res.allowNoProductPrefix ? 'disabled (Free serials allowed)' : 'enforced'}`
          : `Box identifier prefix validation ${res.allowNoBoxPrefix ? 'disabled (Free box IDs allowed)' : 'enforced'}`,
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'Failed to update prefix validation settings', 'error');
    } finally {
      setUpdatingPrefix(false);
    }
  };

  // Copy PO to new draft
  const handleCopyPoToNew = (po: ProductionOrder) => {
    const newPoId = `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const draftGen = {
      id: newPoId,
      poName: po.poName ? `${po.poName} (Copy)` : `${po.id} Copy`,
      mapPo: po.mapPo ? `${po.mapPo}-COPY` : `SO-${Math.floor(40000 + Math.random() * 9000)}`,
      customer: po.customer,
      styleId: po.styleId,
      styleCode: po.styleCode,
      styleName: po.styleName,
      startDate: po.startDate,
      dueDate: po.dueDate,
      supervisorId: po.supervisorId,
      plant: po.plant,
      lineNumber: po.lineNumber || po.line_number || '',
      shiftId: po.shiftId,
      shiftName: po.shiftName,
      remarks: po.remarks,
      selectedOperations: po.selectedOperations || ['Pre QC', 'QC Test', 'Packing', 'AQL Checker', 'Box Transfer'],
      qcTestMode: po.qcTestMode || 'QC & Test',
      qcStationCount: po.qcStationCount || 1,
      allocations: po.allocations || po.shifts || []
    };

    sessionStorage.setItem('uniflow_draft_po_style_id', po.styleId || '');
    sessionStorage.setItem('uniflow_draft_po_general', JSON.stringify(draftGen));
    sessionStorage.setItem('uniflow_draft_po_shifts', JSON.stringify(po.allocations || po.shifts || []));
    sessionStorage.setItem('uniflow_draft_po_configs', JSON.stringify(po.productConfigurations || []));
    sessionStorage.setItem('uniflow_draft_po_box_configs', JSON.stringify(po.boxConfigurations || []));
    sessionStorage.setItem('uniflow_draft_po_allow_no_product_prefix', String(Boolean(po.allowNoProductPrefix)));
    sessionStorage.setItem('uniflow_draft_po_allow_no_box_prefix', String(Boolean(po.allowNoBoxPrefix)));
    sessionStorage.setItem('uniflow_copy_source_po_id', po.id);

    showToast(`Configurations copied from ${po.id}! Customizing new PO...`, 'info');
    navigate('/supervisor/production-orders/new/general');
  };

  // Filtered orders list
  const filteredOrders = productionOrders.filter(po => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const poNum = String(po.id || '').toLowerCase();
    const poName = String(po.poName || '').toLowerCase();
    const mapPo = String(po.mapPo || '').toLowerCase();
    const styleName = String(po.styleName || '').toLowerCase();
    const styleCode = String(po.styleCode || '').toLowerCase();
    const customer = String(po.customer || '').toLowerCase();
    const lineNum = String(po.lineNumber || po.line_number || '').toLowerCase();
    const plant = String(po.plant || '').toLowerCase();

    return (
      poNum.includes(q) ||
      poName.includes(q) ||
      mapPo.includes(q) ||
      styleName.includes(q) ||
      styleCode.includes(q) ||
      customer.includes(q) ||
      lineNum.includes(q) ||
      plant.includes(q)
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>

      {/* ── Slide-in Sidebar Drawer ───────────────────────────── */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)', zIndex: 9000
          }}
        />
      )}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '280px',
        backgroundColor: 'var(--bg-surface-1)',
        borderLeft: '1px solid var(--border-color)',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
        zIndex: 9001, display: 'flex', flexDirection: 'column', gap: '10px',
        padding: '20px 16px', overflowY: 'auto',
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>Supervisor Tools</h3>
          <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px' }}>
            <X size={20} />
          </button>
        </div>

        <button
          onClick={() => { setSidebarOpen(false); setShowBoxOverview(!showBoxOverview); }}
          style={{
            backgroundColor: showBoxOverview ? 'var(--primary-teal)' : '#0F2942',
            border: `1px solid ${showBoxOverview ? 'var(--primary-teal)' : '#1E4650'}`,
            borderRadius: '12px', padding: '14px 16px', textAlign: 'left',
            display: 'flex', flexDirection: 'column', cursor: 'pointer'
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 700, color: showBoxOverview ? '#000' : '#3B82F6' }}>📦 Box Overview</span>
          <span style={{ fontSize: '11px', color: showBoxOverview ? '#000' : 'var(--text-secondary)', marginTop: '2px' }}>View packed boxes & QRs</span>
        </button>

        <button onClick={() => navTo('/supervisor/shifts')} style={{ backgroundColor: '#1A1C38', border: '1px solid #2D3055', borderRadius: '12px', padding: '14px 16px', textAlign: 'left', display: 'flex', flexDirection: 'column', cursor: 'pointer' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#8B5CF6' }}>👥 Shift Allocation</span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Manage shift members</span>
        </button>
        <button onClick={() => navTo('/admin/dashboard')} style={{ backgroundColor: '#0B2D27', border: '1px solid #174E45', borderRadius: '12px', padding: '14px 16px', textAlign: 'left', display: 'flex', flexDirection: 'column', cursor: 'pointer' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#10B981' }}>📊 Factory Dashboard</span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Live metrics & KPIs</span>
        </button>
        <button onClick={() => navTo('/admin/users')} style={{ backgroundColor: '#2D1A25', border: '1px solid #4A2A3B', borderRadius: '12px', padding: '14px 16px', textAlign: 'left', display: 'flex', flexDirection: 'column', cursor: 'pointer' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#EC4899' }}>👤 Manage Users</span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Add/edit factory users</span>
        </button>
        <button onClick={() => navTo('/admin/reports')} style={{ backgroundColor: '#0F2942', border: '1px solid #1E4650', borderRadius: '12px', padding: '14px 16px', textAlign: 'left', display: 'flex', flexDirection: 'column', cursor: 'pointer' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#3B82F6' }}>📄 Production Reports</span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Generate PDF exports</span>
        </button>
      </div>

      {/* ── Hamburger Trigger ─────────────────────────────────── */}
      <button
        onClick={() => setSidebarOpen(true)}
        style={{
          position: 'fixed', top: '12px', right: '100px',
          width: '36px', height: '36px', borderRadius: '10px',
          backgroundColor: 'var(--bg-surface-1)',
          border: '1px solid var(--primary-teal)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', zIndex: 200, color: 'var(--primary-teal)'
        }}
        aria-label="Open supervisor menu"
      >
        <Menu size={18} />
      </button>

      {/* Supervisor Header */}
      <div style={styles.headerRow}>
        <div>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Welcome back, Supervisor</span>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: '2px 0' }}>
            {currentUser?.name || 'Supervisor'} 👨‍💼
          </h2>
          <span style={{ fontSize: '12px', color: 'var(--primary-teal)', fontWeight: 600 }}>
            Unified Production Order Management & Live Oversight
          </span>
        </div>
      </div>

      {/* ── PRIMARY TWO-TAB SWITCHER ─────────────────────────── */}
      <div style={{
        display: 'flex',
        backgroundColor: 'var(--bg-surface-1)',
        padding: '5px',
        borderRadius: '16px',
        border: '1.5px solid var(--border-color)',
        gap: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.18)'
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('new')}
          style={{
            flex: 1,
            padding: '12px 18px',
            borderRadius: '12px',
            border: activeTab === 'new' ? '1.5px solid var(--primary-teal)' : '1px solid transparent',
            backgroundColor: activeTab === 'new' ? 'rgba(20, 184, 166, 0.18)' : 'transparent',
            color: activeTab === 'new' ? 'var(--primary-teal)' : 'var(--text-secondary)',
            fontWeight: 800,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            boxShadow: activeTab === 'new' ? '0 0 12px rgba(20, 184, 166, 0.2)' : 'none'
          }}
        >
          <PlusCircle size={18} />
          <span>Create New PO</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('current')}
          style={{
            flex: 1,
            padding: '12px 18px',
            borderRadius: '12px',
            border: activeTab === 'current' ? '1.5px solid var(--primary-teal)' : '1px solid transparent',
            backgroundColor: activeTab === 'current' ? 'rgba(20, 184, 166, 0.18)' : 'transparent',
            color: activeTab === 'current' ? 'var(--primary-teal)' : 'var(--text-secondary)',
            fontWeight: 800,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            boxShadow: activeTab === 'current' ? '0 0 12px rgba(20, 184, 166, 0.2)' : 'none'
          }}
        >
          <ClipboardList size={18} />
          <span>Current Orders ({productionOrders.length})</span>
        </button>
      </div>

      {/* ───────────────────────────────────────────────────────── */}
      {/* ── TAB 1: CREATE NEW PO WORKFLOW ─────────────────────── */}
      {/* ───────────────────────────────────────────────────────── */}
      {activeTab === 'new' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Main Action Banner */}
          <div className="card" style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1.5px solid var(--primary-teal)',
            borderRadius: '16px',
            padding: '24px 20px',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ maxWidth: '640px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                New Production Setup
              </span>
              <h3 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--text-primary)', marginTop: '4px', marginBottom: '8px' }}>
                Launch a New Production Order
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '18px' }}>
                Start a fresh production run by selecting an existing style from the database or configuring a custom garment style with prefixes, size breakdowns, and line assignments.
              </p>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => navigate('/supervisor/production-orders/new/style')}
                  style={{
                    backgroundColor: 'var(--primary-teal)',
                    color: '#041820',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '12px 22px',
                    fontSize: '14px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 16px rgba(20, 184, 166, 0.35)'
                  }}
                >
                  <PlusCircle size={18} />
                  <span>Start New Production Order</span>
                  <ArrowRight size={16} />
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/supervisor/shifts')}
                  style={{
                    backgroundColor: 'rgba(20, 184, 166, 0.1)',
                    color: 'var(--primary-teal)',
                    border: '1px solid var(--primary-teal)',
                    borderRadius: '12px',
                    padding: '12px 18px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <Users size={16} />
                  <span>Manage Shift Members</span>
                </button>
              </div>
            </div>
          </div>

          {/* Visual Step-by-Step Creation Roadmap */}
          <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-color)', margin: 0, padding: '20px' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '14px' }}>
              Standard 4-Step Production Setup Workflow
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              <div
                onClick={() => navigate('/supervisor/production-orders/new/style')}
                style={{
                  backgroundColor: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '14px',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: 'rgba(20, 184, 166, 0.2)', color: 'var(--primary-teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                    1
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>Select Style</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                  Choose from master style catalog or define a new style code & name.
                </p>
              </div>

              <div
                onClick={() => navigate('/supervisor/production-orders/new/general')}
                style={{
                  backgroundColor: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '14px',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                    2
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>General Info & SO</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                  Input Customer, SO (Sales Order), Plant, Line numbers and target Due Date.
                </p>
              </div>

              <div
                onClick={() => navigate('/supervisor/shifts')}
                style={{
                  backgroundColor: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '14px',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                    3
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>Line & Shift Allocation</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                  Assign shift members, operators, and line stations to the scheduled run.
                </p>
              </div>

              <div
                onClick={() => navigate('/supervisor/production-orders/new/review')}
                style={{
                  backgroundColor: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '14px',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                    4
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>Review & Deploy</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                  Review sizes, quantities, packaging configurations and activate order.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Copy from Existing Order Templates */}
          <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-color)', margin: 0, padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Quick Clone / Copy from Existing Orders
                </h4>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Duplicate pre-configured sizes, prefixes, and operations into a new draft in 1-click.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('current')}
                style={{ background: 'none', border: 'none', color: 'var(--primary-teal)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                View All in Current Orders →
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
              {productionOrders.slice(0, 4).map(po => (
                <div
                  key={po.id}
                  style={{
                    backgroundColor: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', display: 'block' }}>
                      {po.id} — {po.styleName || po.styleCode || 'Style'}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      Customer: {po.customer || 'Factory'} • SO: {po.mapPo}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyPoToNew(po)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 700,
                      backgroundColor: 'rgba(59, 130, 246, 0.15)',
                      border: '1px solid #3b82f6',
                      color: '#60a5fa',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <Copy size={13} /> Copy PO
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────── */}
      {/* ── TAB 2: CURRENT ORDERS & OVERSIGHT ─────────────────── */}
      {/* ───────────────────────────────────────────────────────── */}
      {activeTab === 'current' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* ── PART 1: PRODUCTION OVERVIEW & KPI METRICS ───────────── */}
          <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1.5px solid var(--border-color)', margin: 0, padding: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', letterSpacing: '0.05em' }}>
                  SUPERVISOR PRODUCTION OVERVIEW
                </span>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                  Authorized Production Orders & Live Metrics
                </h3>
              </div>

              {/* PO Selector Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Active PO:</span>
                <select
                  value={selectedPoId}
                  onChange={handlePoChange}
                  style={{
                    backgroundColor: 'var(--bg-surface-2)',
                    border: '1.5px solid var(--primary-teal)',
                    color: 'var(--text-primary)',
                    borderRadius: '10px',
                    padding: '8px 14px',
                    fontSize: '13px',
                    fontWeight: 700,
                    outline: 'none',
                    minWidth: '240px'
                  }}
                >
                  {authorizedPos.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {formatPoDisplayName(p)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Selected PO Details Card Banner */}
            {currentPoDetails && (
              <div style={{
                backgroundColor: 'var(--bg-surface-2)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '14px 16px',
                marginBottom: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span>{formatPoDisplayName(currentPoDetails)}</span>
                    <DueDateBadge dueDate={currentPoDetails.dueDate || currentPoDetails.due_date} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <StatusPill label={currentPoDetails.status || 'CURRENT'} variant="teal" />
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--primary-teal)' }}>
                      {currentPoDetails.completionPct || 0}% Complete
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  <span><strong>PO Name:</strong> {currentPoDetails.poName || 'N/A'}</span>
                  <span><strong>PO Number:</strong> {currentPoDetails.poNumber}</span>
                  <span><strong>Style Name:</strong> {currentPoDetails.styleName}</span>
                  <span><strong>Customer:</strong> {currentPoDetails.customer}</span>
                  <span><strong>Supervisor:</strong> {currentPoDetails.supervisorName}</span>
                  <span><strong>Shift:</strong> {currentPoDetails.shiftName}</span>
                </div>

                <div style={{ marginTop: '6px' }}>
                  <ProgressBar current={overviewMetrics.packedQuantity || 0} total={overviewMetrics.plannedQuantity || 1} height={8} />
                </div>
              </div>
            )}

            {/* Supervisor PO Overview KPI Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
              <div style={styles.metricBox('rgba(20, 184, 166, 0.12)', 'var(--primary-teal)')}>
                <span style={styles.metricVal('#16B8AE')}>{overviewMetrics.plannedQuantity || 0}</span>
                <span style={styles.metricLbl('#16B8AE')}>Planned Quantity</span>
              </div>

              <div style={styles.metricBox('rgba(16, 185, 129, 0.12)', '#10B981')}>
                <span style={styles.metricVal('#10B981')}>{overviewMetrics.qcCompleted || 0}</span>
                <span style={styles.metricLbl('#10B981')}>Items Processed</span>
              </div>

              <div style={styles.metricBox('rgba(59, 130, 246, 0.12)', '#3B82F6')}>
                <span style={styles.metricVal('#3B82F6')}>{overviewMetrics.packedQuantity || 0}</span>
                <span style={styles.metricLbl('#3B82F6')}>Packed Quantity</span>
              </div>

              <div style={styles.metricBox('rgba(139, 92, 246, 0.12)', '#8B5CF6')}>
                <span style={styles.metricVal('#8B5CF6')}>{overviewMetrics.aqlCompleted || 0}</span>
                <span style={styles.metricLbl('#8B5CF6')}>AQL Completed</span>
              </div>

              <div style={styles.metricBox('rgba(245, 158, 11, 0.12)', '#F59E0B')}>
                <span style={styles.metricVal('#F59E0B')}>{overviewMetrics.remainingQuantity || 0}</span>
                <span style={styles.metricLbl('#F59E0B')}>Remaining Qty</span>
              </div>

              <div style={styles.metricBox('rgba(5, 150, 105, 0.12)', '#059669')}>
                <span style={styles.metricVal('#059669')}>{overviewMetrics.completionPct || 0}%</span>
                <span style={styles.metricLbl('#059669')}>PO Completion</span>
              </div>
            </div>
          </div>

          {/* ── PART 2: SEARCH & BARCODE SCAN BAR ────────────────── */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: 'var(--bg-surface-1)',
            padding: '10px 14px',
            borderRadius: '14px',
            border: '1.5px solid var(--border-color)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
          }}>
            <Search size={18} color="var(--primary-teal)" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && searchQuery.trim()) {
                  setLifecycleSearchCode(searchQuery.trim());
                  setShowLifecycleModal(true);
                }
              }}
              placeholder="Search by PO Number, Style, Customer or scan Box / Product QR…"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: '14px',
                fontWeight: 600,
                outline: 'none',
                flex: 1
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setLifecycleSearchCode(searchQuery.trim());
                setShowLifecycleModal(true);
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(22, 184, 174, 0.15)',
                border: '1px solid var(--primary-teal)',
                color: 'var(--primary-teal)',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
              title="Inspect lifecycle of product QR or box code"
            >
              <ScanLine size={14} /> Scan / Inspect QR
            </button>
          </div>

          {/* ── PART 3: ALL ORDERS OVERSIGHT GRID ─────────────────── */}
          {filteredOrders.length === 0 ? (
            <div style={{
              padding: '30px',
              textAlign: 'center',
              backgroundColor: 'var(--bg-surface-1)',
              borderRadius: '14px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                No Production Orders matched "<strong>{searchQuery}</strong>"
              </span>
              <button
                type="button"
                onClick={() => {
                  setLifecycleSearchCode(searchQuery.trim());
                  setShowLifecycleModal(true);
                }}
                className="btn btn-secondary"
                style={{ padding: '8px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ScanLine size={14} color="var(--primary-teal)" /> Inspect "{searchQuery}" as Product QR or Box Barcode
              </button>
            </div>
          ) : (
            <div className="grid-2-desktop" style={{ display: 'grid', gap: '12px' }}>
              {filteredOrders.map(po => {
                const totalQty = po.totalQuantity || (po.productConfigurations?.reduce((sum, c) => sum + c.quantity, 0)) || 1000;
                const qcPassed = po.progress?.qcPassed || 0;
                const packedQty = po.progress?.packed || 0;
                const configsCount = po.productConfigurations?.length || 0;

                return (
                  <div
                    key={po.id}
                    className="card"
                    style={{ backgroundColor: 'var(--bg-surface-1)', cursor: 'pointer', margin: 0, border: '1px solid var(--border-color)' }}
                    onClick={() => setSelectedPo(po)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                          {po.id} — {po.styleName || po.styleCode || 'Garment Style'}
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>SO: {po.mapPo}</span>
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
                          <DueDateBadge dueDate={po.dueDate || (po as any).due_date} />
                        </div>
                      </div>
                      <StatusPill label={po.status || 'Current'} variant={po.status === 'Current' ? 'teal' : 'muted'} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                      <span>Customer: {po.customer || 'Factory Customer'}</span>
                      <span>{configsCount} Configurations</span>
                    </div>

                    {(po.allowNoProductPrefix || po.allowNoBoxPrefix) && (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                        {po.allowNoProductPrefix && (
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(22, 184, 174, 0.15)', color: 'var(--primary-teal)', fontWeight: 700 }}>
                            🔓 Free Serials
                          </span>
                        )}
                        {po.allowNoBoxPrefix && (
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(22, 184, 174, 0.15)', color: 'var(--primary-teal)', fontWeight: 700 }}>
                            📦 Free Box IDs
                          </span>
                        )}
                      </div>
                    )}

                    <div style={{ marginTop: '10px' }}>
                      <ProgressBar current={qcPassed} total={totalQty} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        <span>Supervisor: {po.supervisorId}</span>
                        <span>{qcPassed} / {totalQty} passed ({packedQty} packed)</span>
                      </div>
                    </div>

                    <div style={styles.cardFooter}>
                      <span style={{ fontSize: '12px', color: 'var(--primary-teal)', fontWeight: 600 }}>
                        View PO Configurations & Progress
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyPoToNew(po);
                          }}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: 'rgba(59, 130, 246, 0.15)',
                            border: '1px solid #3b82f6',
                            color: '#60a5fa',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          title="Copy this PO configurations into a new order"
                        >
                          <Copy size={12} /> Copy PO
                        </button>
                        <ChevronRight size={16} color="var(--primary-teal)" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── PART 4: BOX OVERVIEW SECTION ─────────────────────── */}
          {showBoxOverview && (
            <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-color)', margin: 0, padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <h4 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Box Overview ({supervisorBoxes.length} boxes)
                  </h4>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Actual packing box capacity and active product fill levels for authorized POs
                  </span>
                </div>
              </div>

              {supervisorBoxes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
                  <Box size={36} />
                  <div style={{ fontSize: '13px', marginTop: '8px' }}>No packing boxes recorded for this PO yet.</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-secondary)', borderBottom: '1.5px solid var(--border-color)' }}>
                        <th style={{ padding: '10px 12px' }}>Box Code</th>
                        <th style={{ padding: '10px 12px' }}>Production Order</th>
                        <th style={{ padding: '10px 12px' }}>Filled / Capacity</th>
                        <th style={{ padding: '10px 12px' }}>Active Products Inside</th>
                        <th style={{ padding: '10px 12px' }}>Status</th>
                        <th style={{ padding: '10px 12px' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supervisorBoxes.map((bx: any) => (
                        <tr key={bx.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td data-label="Box Code" style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {bx.boxCode}
                          </td>
                          <td data-label="Production Order" style={{ padding: '10px 12px', color: 'var(--primary-teal)', fontWeight: 600 }}>
                            {formatPoDisplayName(bx)}
                          </td>
                          <td data-label="Filled / Capacity" style={{ padding: '10px 12px' }}>
                            <span style={{ fontWeight: 800, color: bx.activeFilledCount >= bx.capacity ? '#10B981' : 'var(--text-primary)' }}>
                              {bx.activeFilledCount} / {bx.capacity}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                              ({bx.remainingCapacity} space left)
                            </span>
                          </td>
                          <td data-label="Active Products Inside" style={{ padding: '10px 12px', color: 'var(--text-secondary)', maxWidth: '240px' }}>
                            {bx.productQrs && bx.productQrs.length > 0 ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {bx.productQrs.slice(0, 3).map((qr: string, idx: number) => (
                                  <span key={idx} style={{ backgroundColor: 'var(--bg-surface-2)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, border: '1px solid var(--border-color)' }}>
                                    {qr}
                                  </span>
                                ))}
                                {bx.productQrs.length > 3 && (
                                  <span style={{ fontSize: '11px', color: 'var(--primary-teal)', fontWeight: 700, alignSelf: 'center' }}>
                                    +{bx.productQrs.length - 3} more
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Empty box</span>
                            )}
                          </td>
                          <td data-label="Status" style={{ padding: '10px 12px' }}>
                            <StatusPill label={bx.status} variant={bx.status === 'COMPLETED' || bx.status === 'COMPLETE' ? 'green' : 'teal'} />
                          </td>
                          <td data-label="Action" style={{ padding: '10px 12px' }}>
                            <button
                              onClick={() => setSelectedBoxForModal(bx)}
                              style={{
                                backgroundColor: 'var(--bg-surface-2)',
                                border: '1px solid var(--border-color)',
                                color: 'var(--primary-teal)',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Eye size={12} /> Contents
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* ── Box Detail Modal ─────────────────────────────────────── */}
      {selectedBoxForModal && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '540px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Box {selectedBoxForModal.boxCode} Details
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {formatPoDisplayName(selectedBoxForModal)}
                </span>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelectedBoxForModal(null)}>
                <X size={20} color="var(--text-secondary)" />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px', fontSize: '13px' }}>
              <div><strong>Capacity:</strong> {selectedBoxForModal.capacity} pcs</div>
              <div><strong>Filled:</strong> {selectedBoxForModal.activeFilledCount} pcs</div>
              <div><strong>Space Remaining:</strong> {selectedBoxForModal.remainingCapacity} pcs</div>
              <div><strong>Status:</strong> {selectedBoxForModal.status}</div>
            </div>

            <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>
              Packed Product Serial QRs ({selectedBoxForModal.productQrs?.length || 0})
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
              {selectedBoxForModal.productQrs && selectedBoxForModal.productQrs.length > 0 ? (
                selectedBoxForModal.productQrs.map((qr: string, idx: number) => (
                  <div key={idx} style={{ padding: '6px 10px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace' }}>
                    {idx + 1}. {qr}
                  </div>
                ))
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' }}>
                  No active items currently assigned to this box.
                </div>
              )}
            </div>

            <div style={{ marginTop: '16px', textAlign: 'right' }}>
              <button className="btn-secondary" onClick={() => setSelectedBoxForModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PO Detail Modal (From SupervisorOrders) ─────────────── */}
      {selectedPo && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--primary-teal)', fontWeight: 700 }}>PO OVERVIEW</span>
                <h3 style={{ fontSize: '20px', fontWeight: 800 }}>{selectedPo.id}</h3>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelectedPo(null)}>
                <X size={20} color="var(--text-secondary)" />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              <span><strong>Garment Style:</strong> {selectedPo.styleName || selectedPo.styleCode || 'Standard'}</span>
              <span><strong>SO:</strong> {selectedPo.mapPo}</span>
              <span><strong>Customer:</strong> {selectedPo.customer}</span>
              <span><strong>Due Date:</strong> {selectedPo.dueDate}</span>
              <span><strong>Plant:</strong> {selectedPo.plant || 'Standard'}</span>
              <span><strong>Supervisor:</strong> {selectedPo.supervisorId || 'N/A'}</span>
              {selectedPo.qcTestMode && (
                <span style={{ gridColumn: '1 / -1' }}>
                  <strong>QC Test Mode:</strong> <span style={{ color: 'var(--primary-teal)', fontWeight: 700 }}>{selectedPo.qcTestMode}</span>
                </span>
              )}
            </div>

            {selectedPo.remarks && (
              <div style={{ marginBottom: '14px', padding: '10px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>REMARKS:</span>
                <p style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '2px' }}>{selectedPo.remarks}</p>
              </div>
            )}

            {/* Prefix Validation Modes Controls */}
            <div style={{ marginBottom: '14px', padding: '12px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Prefix Validation Modes
                </span>
                {updatingPrefix && <span style={{ fontSize: '11px', color: 'var(--primary-teal)', fontWeight: 600 }}>Updating...</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Product Serials:</span>
                  <button
                    type="button"
                    onClick={() => handleTogglePrefix('product')}
                    disabled={updatingPrefix}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: selectedPo.allowNoProductPrefix ? '1px solid var(--primary-teal)' : '1px solid var(--border-color)',
                      backgroundColor: selectedPo.allowNoProductPrefix ? 'rgba(22, 184, 174, 0.2)' : 'var(--bg-surface-1)',
                      color: selectedPo.allowNoProductPrefix ? 'var(--primary-teal)' : 'var(--text-secondary)'
                    }}
                  >
                    {selectedPo.allowNoProductPrefix ? '🔓 Free Serial Numbers (Enabled)' : '🔒 Enforce Config Prefix'}
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Box Identifiers:</span>
                  <button
                    type="button"
                    onClick={() => handleTogglePrefix('box')}
                    disabled={updatingPrefix}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: selectedPo.allowNoBoxPrefix ? '1px solid var(--primary-teal)' : '1px solid var(--border-color)',
                      backgroundColor: selectedPo.allowNoBoxPrefix ? 'rgba(22, 184, 174, 0.2)' : 'var(--bg-surface-1)',
                      color: selectedPo.allowNoBoxPrefix ? 'var(--primary-teal)' : 'var(--text-secondary)'
                    }}
                  >
                    {selectedPo.allowNoBoxPrefix ? '🔓 Free Box Identifiers (Enabled)' : '🔒 Enforce Box Prefix'}
                  </button>
                </div>
              </div>
            </div>

            <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>
              Product Configurations ({selectedPo.productConfigurations?.length || 0})
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
              {selectedPo.productConfigurations?.map((cfg, idx) => (
                <div key={idx} style={styles.soRow}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary-teal)' }}>{cfg.configCode}</span>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>{cfg.quantity} pcs</span>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
                    {cfg.productType ? `Type: ${cfg.productType} ` : ''}{cfg.size ? `• Size: ${cfg.size}` : ''}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', gap: '10px' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleCopyPoToNew(selectedPo)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
              >
                <Copy size={14} /> Copy to New PO
              </button>
              <button className="btn-secondary" onClick={() => setSelectedPo(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Scan & Lifecycle Lookup Modal ── */}
      <CodeLifecycleModal
        isOpen={showLifecycleModal}
        onClose={() => setShowLifecycleModal(false)}
        initialQuery={lifecycleSearchCode}
      />
    </div>
  );
};

const styles: Record<string, any> = {
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    padding: '4px 0'
  },
  actionBtnPrimary: {
    backgroundColor: 'var(--primary-teal)',
    color: '#041820',
    border: 'none',
    borderRadius: '10px',
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 800,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  actionBtnSecondary: {
    backgroundColor: 'var(--bg-surface-2)',
    color: 'var(--primary-teal)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  metricBox: (bg: string, border: string): React.CSSProperties => ({
    backgroundColor: bg,
    border: `1px solid ${border}`,
    borderRadius: '12px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
  }),
  metricVal: (color: string): React.CSSProperties => ({
    fontSize: '20px',
    fontWeight: 800,
    color,
    lineHeight: 1,
  }),
  metricLbl: (color: string): React.CSSProperties => ({
    fontSize: '10px',
    fontWeight: 700,
    color,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    textAlign: 'center',
  }),
  cardFooter: {
    marginTop: '12px',
    paddingTop: '10px',
    borderTop: '1px solid var(--border-color)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '16px',
  },
  modalContent: {
    backgroundColor: 'var(--bg-surface-1)',
    borderRadius: '20px',
    border: '1px solid var(--border-color)',
    padding: '20px',
    width: '100%',
    maxWidth: '520px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
    maxHeight: '90vh',
    overflowY: 'auto'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
  soRow: {
    padding: '10px 12px',
    borderRadius: '10px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
  }
};
