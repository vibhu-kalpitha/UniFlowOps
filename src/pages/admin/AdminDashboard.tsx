import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Box,
  Calendar,
  CheckCircle2,
  Clock,
  Filter,
  Layers,
  Menu,
  Package,
  PieChart,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Trash2,
  TrendingUp,
  Users,
  X,
  Zap,
  ChevronRight,
  Sparkles,
  SlidersHorizontal
} from 'lucide-react';
import { apiFetch } from '../../services/api';
import '../../styles/tokens.css';

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useApp();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState<boolean>(false);

  // Filter states
  const [selectedStyle, setSelectedStyle] = useState<string>('');
  const [selectedPoId, setSelectedPoId] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [activeDatePreset, setActiveDatePreset] = useState<'today' | '7d' | '30d' | 'all' | 'custom'>('all');

  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async (
    styleFilter = selectedStyle,
    poFilter = selectedPoId,
    yrFilter = selectedYear,
    fromD = fromDate,
    toD = toDate
  ) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (styleFilter) params.set('styleName', styleFilter);
      if (poFilter) params.set('poId', poFilter);
      if (yrFilter) params.set('year', yrFilter);
      if (fromD) params.set('fromDate', fromD);
      if (toD) params.set('toDate', toD);

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const res = await apiFetch(`/api/dashboard/admin${queryString}`);
      setData(res);
    } catch (err: any) {
      console.error('Failed to load admin dashboard data:', err);
      setError(err?.message || 'Failed to load live admin dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData(selectedStyle, selectedPoId, selectedYear, fromDate, toDate);
  }, [selectedStyle, selectedPoId, selectedYear, fromDate, toDate]);

  const filterOptions = data?.filter || { availableStyles: [], availablePos: [] };

  const handleStyleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedStyle(e.target.value);
    setSelectedPoId('');
  };

  const handleClearFilters = () => {
    setSelectedStyle('');
    setSelectedPoId('');
    setSelectedYear('');
    setFromDate('');
    setToDate('');
    setActiveDatePreset('all');
  };

  const handleDatePreset = (preset: 'today' | '7d' | '30d' | 'all') => {
    setActiveDatePreset(preset);
    const now = new Date();
    if (preset === 'all') {
      setFromDate('');
      setToDate('');
    } else if (preset === 'today') {
      const dStr = now.toISOString().split('T')[0];
      setFromDate(dStr);
      setToDate(dStr);
    } else if (preset === '7d') {
      const past = new Date();
      past.setDate(past.getDate() - 7);
      setFromDate(past.toISOString().split('T')[0]);
      setToDate(now.toISOString().split('T')[0]);
    } else if (preset === '30d') {
      const past = new Date();
      past.setDate(past.getDate() - 30);
      setFromDate(past.toISOString().split('T')[0]);
      setToDate(now.toISOString().split('T')[0]);
    }
  };

  const isFiltered = Boolean(selectedStyle || selectedPoId || selectedYear || fromDate || toDate);

  const kpis = data?.kpis || {
    totalStyles: 0,
    activePos: 0,
    runningPos: 0,
    plannedQuantity: 0,
    qcPassed: 0,
    qcFailed: 0,
    packedQuantity: 0,
    aqlPassed: 0,
    aqlFailed: 0,
    totalBoxes: 0,
    openBoxes: 0,
    fullBoxes: 0,
    overallPoCompletion: 0
  };

  const activeOrders: any[] = data?.activeProductionOrders || [];
  const recentScrapped: any[] = data?.recentScrapped || [];

  const totalQc = kpis.qcPassed + kpis.qcFailed;
  const qcPassRate = totalQc > 0 ? Math.round((kpis.qcPassed / totalQc) * 100) : 100;
  const totalAql = kpis.aqlPassed + kpis.aqlFailed;
  const aqlPassRate = totalAql > 0 ? Math.round((kpis.aqlPassed / totalAql) * 100) : 100;
  const completionPct = kpis.overallPoCompletion || (kpis.plannedQuantity > 0 ? Math.min(100, Math.round((kpis.packedQuantity / kpis.plannedQuantity) * 100)) : 0);

  // Box calculations for Donut
  const fullBoxPct = kpis.totalBoxes > 0 ? Math.round((kpis.fullBoxes / kpis.totalBoxes) * 100) : 0;
  const openBoxPct = kpis.totalBoxes > 0 ? Math.max(0, 100 - fullBoxPct) : 0;

  const navTo = (path: string) => {
    setSidebarOpen(false);
    navigate(path);
  };

  return (
    <div className="desktop-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>

      {/* ── Slide-in Admin Panel Drawer ───────────────────────── */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 9000
          }}
        />
      )}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '280px',
          backgroundColor: 'var(--bg-surface-1)',
          borderLeft: '1px solid var(--border-color)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
          zIndex: 9001,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          padding: '20px 16px',
          overflowY: 'auto',
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>Admin Navigation</h3>
          <button
            onClick={() => setSidebarOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        <button onClick={() => navTo('/admin/reports')} style={styles.navCard('#0B2D27', '#174E45')}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#10B981' }}>📊 Production Reports & Logs</span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Inspect PO details, cartons & audit feed
          </span>
        </button>
        <button onClick={() => navTo('/admin/orders')} style={styles.navCard('#2D1A25', '#4A2A3B')}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#EC4899' }}>📦 Production Orders Config</span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Configure PO QR ranges</span>
        </button>
        <button onClick={() => navTo('/admin/users')} style={styles.navCard('#1A1C38', '#2D3055')}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#8B5CF6' }}>👥 Shift Members & Operators</span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Manage operator allocations</span>
        </button>
        <button onClick={() => navTo('/admin/sessions')} style={styles.navCard('#0F2942', '#1E4650')}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#3B82F6' }}>🔐 User Sessions & Activity</span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Inspect login history</span>
        </button>
      </div>

      {/* ── Hamburger Menu Trigger (Top-Right) ─── */}
      <button
        onClick={() => setSidebarOpen(true)}
        style={{
          position: 'fixed',
          top: '12px',
          right: '90px',
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          backgroundColor: 'var(--bg-surface-1)',
          border: '1px solid var(--primary-teal)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 200,
          color: 'var(--primary-teal)'
        }}
        aria-label="Open admin menu"
      >
        <Menu size={18} />
      </button>

      {/* ── Top Header & Executive Control Bar ─────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '16px 20px',
          backgroundColor: 'var(--bg-surface-1)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#10B981',
                boxShadow: '0 0 10px #10B981',
                display: 'inline-block'
              }}
            />
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              FACTORY REAL-TIME MASTER DASHBOARD
            </span>
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '3px', margin: 0 }}>
            Executive Operations Command 🏢
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px', margin: 0 }}>
            Welcome back, <strong>{currentUser?.name || currentUser?.username || 'Admin'}</strong> • Live stream across garment stages
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Mobile Filter Toggle Button */}
          <button
            onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
            className="btn btn-secondary mobile-only-filter-btn"
            style={{
              padding: '8px 12px',
              fontSize: '12px',
              display: 'none',
              alignItems: 'center',
              gap: '6px',
              borderRadius: '10px'
            }}
          >
            <SlidersHorizontal size={14} color="var(--primary-teal)" />
            {isFiltered ? 'Filters (Active)' : 'Filters'}
          </button>

          <button
            onClick={() => fetchDashboardData(selectedStyle, selectedPoId, selectedYear, fromDate, toDate)}
            className="btn btn-secondary"
            style={{ padding: '8px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '10px' }}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            {loading ? 'Refreshing...' : 'Refresh Live'}
          </button>

          <button
            onClick={() => navigate('/admin/reports')}
            className="btn btn-secondary"
            style={{ padding: '8px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '10px' }}
          >
            <BarChart3 size={14} color="var(--primary-teal)" /> Reports & Logs →
          </button>

          <button
            onClick={() => navigate('/supervisor/production-orders/new/style')}
            className="btn btn-primary"
            style={{ padding: '8px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '10px' }}
          >
            <Zap size={14} /> + New PO
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1.5px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '12px',
            color: '#EF4444',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <AlertTriangle size={18} />
          <span style={{ fontWeight: 700, fontSize: '13px' }}>
            Failed to load admin live data: {error}
          </span>
        </div>
      )}

      {/* ── TWO-COLUMN MASTER LAYOUT: LEFT SIDE FILTER + RIGHT SIDE MASTER CHARTS & KPIS ── */}
      <div
        className="admin-dashboard-layout"
        style={{
          display: 'flex',
          gap: '20px',
          alignItems: 'flex-start',
          position: 'relative'
        }}
      >
        {/* ── LEFT SIDE COMPACT FILTER PANEL ───────────────────────────── */}
        <aside
          className={`admin-filter-sidebar ${mobileFilterOpen ? 'mobile-open' : ''}`}
          style={{
            width: '260px',
            minWidth: '260px',
            maxWidth: '260px',
            flexShrink: 0,
            backgroundColor: 'var(--bg-surface-1)',
            borderRadius: '16px',
            border: '1.5px solid var(--border-color)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
            position: 'sticky',
            top: '84px'
          }}
        >
          {/* Filter Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ padding: '5px', borderRadius: '6px', backgroundColor: 'rgba(22, 184, 174, 0.15)', color: 'var(--primary-teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Filter size={15} />
              </div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
                Scope & Filters
              </span>
            </div>
            {isFiltered && (
              <button
                onClick={handleClearFilters}
                style={{
                  fontSize: '11px',
                  color: '#EF4444',
                  fontWeight: 800,
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Reset
              </button>
            )}
          </div>

          {/* Quick Date Range Preset Buttons */}
          <div>
            <label style={styles.filterLabel}>Date Preset</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
              {(['today', '7d', '30d', 'all'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => handleDatePreset(p)}
                  style={{
                    padding: '5px 0',
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    borderRadius: '6px',
                    border: activeDatePreset === p ? '1px solid var(--primary-teal)' : '1px solid var(--border-color)',
                    backgroundColor: activeDatePreset === p ? 'var(--primary-teal)' : 'var(--bg-surface-2)',
                    color: activeDatePreset === p ? '#041820' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    textAlign: 'center'
                  }}
                >
                  {p === 'all' ? 'All' : p}
                </button>
              ))}
            </div>
          </div>

          {/* Year Filter */}
          <div>
            <label style={styles.filterLabel}>Production Year</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              style={styles.filterInput}
            >
              <option value="">All Years</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>
          </div>

          {/* Style Filter */}
          <div>
            <label style={styles.filterLabel}>Garment Style ({filterOptions.availableStyles?.length || 0})</label>
            <select
              value={selectedStyle}
              onChange={handleStyleChange}
              style={styles.filterInput}
            >
              <option value="">All Garment Styles</option>
              {filterOptions.availableStyles?.map((st: string) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          {/* Production Order Filter */}
          <div>
            <label style={styles.filterLabel}>Production Order ({filterOptions.availablePos?.length || 0})</label>
            <select
              value={selectedPoId}
              onChange={e => setSelectedPoId(e.target.value)}
              style={styles.filterInput}
            >
              <option value="">All Production Orders</option>
              {filterOptions.availablePos?.map((p: any) => (
                <option key={p.id} value={p.id}>{p.displayName}</option>
              ))}
            </select>
          </div>

          {/* Custom Date Range */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <label style={styles.filterLabel}>From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={e => { setFromDate(e.target.value); setActiveDatePreset('custom'); }}
                style={styles.filterInput}
              />
            </div>
            <div>
              <label style={styles.filterLabel}>To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={e => { setToDate(e.target.value); setActiveDatePreset('custom'); }}
                style={styles.filterInput}
              />
            </div>
          </div>

          {/* Active Scope Card */}
          <div
            style={{
              padding: '10px 12px',
              backgroundColor: 'var(--bg-surface-2)',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Active Scope
              </span>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: isFiltered ? 'rgba(22, 184, 174, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                  color: isFiltered ? 'var(--primary-teal)' : 'var(--text-secondary)'
                }}
              >
                {isFiltered ? 'FILTERED' : 'GLOBAL'}
              </span>
            </div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {selectedStyle ? selectedStyle : selectedPoId ? `PO #${selectedPoId}` : 'All Factory Styles'}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
              {kpis.activePos} POs • {kpis.plannedQuantity.toLocaleString()} planned units
            </span>
          </div>

          {/* Direct link to Reports tab */}
          <div
            onClick={() => navigate('/admin/reports')}
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              backgroundColor: 'rgba(20, 184, 166, 0.08)',
              border: '1px dashed rgba(20, 184, 166, 0.3)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'background-color 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Package size={14} color="var(--primary-teal)" />
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Detailed Logs
              </span>
            </div>
            <ArrowRight size={13} color="var(--primary-teal)" />
          </div>
        </aside>

        {/* ── RIGHT SIDE: MASTER DASHBOARD (SMALL DATA CARDS + CHARTS ONLY) ── */}
        <main
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '18px'
          }}
        >
          {/* ── 1. SMALL DATA CARDS (MASTER EXECUTIVE KPIS) ───────────────── */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Executive Metrics Snapshot
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {kpis.runningPos} POs running live
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '10px'
              }}
            >
              {/* Card 1: Total Styles */}
              <div style={styles.smallCard('rgba(59, 130, 246, 0.12)', '#3B82F6')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={styles.cardLabel('#3B82F6')}>STYLES</span>
                  <Tag size={13} color="#3B82F6" />
                </div>
                <div style={styles.cardValue}>{kpis.totalStyles}</div>
                <div style={styles.cardSub}>Registered Styles</div>
              </div>

              {/* Card 2: Active POs */}
              <div style={styles.smallCard('rgba(20, 184, 166, 0.12)', 'var(--primary-teal)')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={styles.cardLabel('var(--primary-teal)')}>ACTIVE POs</span>
                  <Layers size={13} color="var(--primary-teal)" />
                </div>
                <div style={styles.cardValue}>{kpis.activePos}</div>
                <div style={{ ...styles.cardSub, color: '#10B981', fontWeight: 700 }}>
                  ● {kpis.runningPos} Running
                </div>
              </div>

              {/* Card 3: Planned Quantity */}
              <div style={styles.smallCard('rgba(139, 92, 246, 0.12)', 'var(--color-purple)')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={styles.cardLabel('var(--color-purple)')}>PLANNED QTY</span>
                  <Package size={13} color="var(--color-purple)" />
                </div>
                <div style={styles.cardValue}>{kpis.plannedQuantity.toLocaleString()}</div>
                <div style={styles.cardSub}>Target volume</div>
              </div>

              {/* Card 4: Packed Units */}
              <div style={styles.smallCard('rgba(59, 130, 246, 0.12)', '#3B82F6')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={styles.cardLabel('#3B82F6')}>PACKED UNITS</span>
                  <Box size={13} color="#3B82F6" />
                </div>
                <div style={{ ...styles.cardValue, color: '#3B82F6' }}>{kpis.packedQuantity.toLocaleString()}</div>
                <div style={styles.cardSub}>Carton units packed</div>
              </div>

              {/* Card 5: PO Completion */}
              <div style={styles.smallCard('rgba(20, 184, 166, 0.12)', 'var(--primary-teal)')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={styles.cardLabel('var(--primary-teal)')}>COMPLETION</span>
                  <TrendingUp size={13} color="var(--primary-teal)" />
                </div>
                <div style={{ ...styles.cardValue, color: 'var(--primary-teal)' }}>{completionPct}%</div>
                <div style={styles.cardSub}>Planned vs Packed</div>
              </div>

              {/* Card 6: QC Pass Rate */}
              <div style={styles.smallCard('rgba(16, 185, 129, 0.12)', '#10B981')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={styles.cardLabel('#10B981')}>QC PASS YIELD</span>
                  <ShieldCheck size={13} color="#10B981" />
                </div>
                <div style={{ ...styles.cardValue, color: '#10B981' }}>{qcPassRate}%</div>
                <div style={styles.cardSub}>{kpis.qcPassed} passed units</div>
              </div>

              {/* Card 7: QC Rejections */}
              <div style={styles.smallCard('rgba(245, 158, 11, 0.12)', '#F59E0B')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={styles.cardLabel('#F59E0B')}>QC DEFECTS</span>
                  <AlertTriangle size={13} color="#F59E0B" />
                </div>
                <div style={{ ...styles.cardValue, color: '#F59E0B' }}>{kpis.qcFailed}</div>
                <div style={styles.cardSub}>QC failed units</div>
              </div>

              {/* Card 8: Total Boxes */}
              <div style={styles.smallCard('rgba(139, 92, 246, 0.12)', '#8B5CF6')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={styles.cardLabel('#8B5CF6')}>TOTAL BOXES</span>
                  <Box size={13} color="#8B5CF6" />
                </div>
                <div style={styles.cardValue}>{kpis.totalBoxes}</div>
                <div style={styles.cardSub}>Factory cartons</div>
              </div>

              {/* Card 9: Full Sealed Boxes */}
              <div style={styles.smallCard('rgba(16, 185, 129, 0.12)', '#10B981')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={styles.cardLabel('#10B981')}>SEALED BOXES</span>
                  <CheckCircle2 size={13} color="#10B981" />
                </div>
                <div style={{ ...styles.cardValue, color: '#10B981' }}>{kpis.fullBoxes}</div>
                <div style={styles.cardSub}>{fullBoxPct}% sealed rate</div>
              </div>

              {/* Card 10: Open Boxes */}
              <div style={styles.smallCard('rgba(245, 158, 11, 0.12)', '#F59E0B')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={styles.cardLabel('#F59E0B')}>OPEN BOXES</span>
                  <Clock size={13} color="#F59E0B" />
                </div>
                <div style={{ ...styles.cardValue, color: '#F59E0B' }}>{kpis.openBoxes}</div>
                <div style={styles.cardSub}>In-progress packing</div>
              </div>

              {/* Card 11: AQL Pass */}
              <div style={styles.smallCard('rgba(5, 150, 105, 0.12)', '#059669')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={styles.cardLabel('#059669')}>AQL PASS</span>
                  <ShieldCheck size={13} color="#059669" />
                </div>
                <div style={{ ...styles.cardValue, color: '#059669' }}>{kpis.aqlPassed}</div>
                <div style={styles.cardSub}>{aqlPassRate}% audit yield</div>
              </div>

              {/* Card 12: AQL Fail / Scrap */}
              <div style={styles.smallCard('rgba(239, 68, 68, 0.12)', '#EF4444')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={styles.cardLabel('#EF4444')}>SCRAP / FAILS</span>
                  <Trash2 size={13} color="#EF4444" />
                </div>
                <div style={{ ...styles.cardValue, color: '#EF4444' }}>
                  {kpis.aqlFailed + recentScrapped.length}
                </div>
                <div style={styles.cardSub}>
                  {recentScrapped.length} scrapped • {kpis.aqlFailed} AQL fail
                </div>
              </div>
            </div>
          </div>

          {/* ── 2. MASTER CHARTS ROW 1: Pipeline Funnel + Carton Analytics Donut ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>

            {/* CHART 1: Production Pipeline Funnel & Stage Throughput */}
            <div
              className="card"
              style={{
                backgroundColor: 'var(--bg-surface-1)',
                border: '1.5px solid var(--border-color)',
                margin: 0,
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BarChart3 size={17} color="var(--primary-teal)" />
                  <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    Production Pipeline Funnel
                  </h3>
                </div>
                <StatusPill label={`${completionPct}% Completed`} variant={completionPct >= 80 ? 'green' : 'teal'} />
              </div>

              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
                End-to-end stage throughput: Planned target volume through inspection, carton packaging, and AQL audit.
              </p>

              {/* Funnel Stage Bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
                {/* Stage 1: Planned Target */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>1. Planned Target Volume</span>
                    <span style={{ fontWeight: 800, color: 'var(--color-purple)' }}>
                      {kpis.plannedQuantity.toLocaleString()} pcs (100%)
                    </span>
                  </div>
                  <ProgressBar current={kpis.plannedQuantity} total={Math.max(1, kpis.plannedQuantity)} height={9} color="var(--color-purple)" />
                </div>

                {/* Stage 2: QC Scanned Units */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>2. QC Inspected Units</span>
                    <span style={{ fontWeight: 800, color: '#3B82F6' }}>
                      {totalQc.toLocaleString()} pcs ({kpis.plannedQuantity > 0 ? Math.round((totalQc / kpis.plannedQuantity) * 100) : 0}%)
                    </span>
                  </div>
                  <ProgressBar current={totalQc} total={Math.max(1, kpis.plannedQuantity)} height={9} color="#3B82F6" />
                </div>

                {/* Stage 3: QC Passed Units */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>3. QC Passed Units</span>
                    <span style={{ fontWeight: 800, color: '#10B981' }}>
                      {kpis.qcPassed.toLocaleString()} pcs ({qcPassRate}% Yield)
                    </span>
                  </div>
                  <ProgressBar current={kpis.qcPassed} total={Math.max(1, kpis.plannedQuantity)} height={9} color="#10B981" />
                </div>

                {/* Stage 4: Packed in Cartons */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>4. Packed in Cartons</span>
                    <span style={{ fontWeight: 800, color: 'var(--primary-teal)' }}>
                      {kpis.packedQuantity.toLocaleString()} pcs ({completionPct}%)
                    </span>
                  </div>
                  <ProgressBar current={kpis.packedQuantity} total={Math.max(1, kpis.plannedQuantity)} height={9} color="var(--primary-teal)" />
                </div>

                {/* Stage 5: AQL Approved Cartons */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>5. AQL Approved Cartons</span>
                    <span style={{ fontWeight: 800, color: '#059669' }}>
                      {kpis.aqlPassed} / {Math.max(1, kpis.totalBoxes)} boxes ({kpis.totalBoxes > 0 ? Math.round((kpis.aqlPassed / kpis.totalBoxes) * 100) : 0}%)
                    </span>
                  </div>
                  <ProgressBar current={kpis.aqlPassed} total={Math.max(1, kpis.totalBoxes)} height={9} color="#059669" />
                </div>
              </div>
            </div>

            {/* CHART 2: Carton Operations Donut & Space Breakdown */}
            <div
              className="card"
              style={{
                backgroundColor: 'var(--bg-surface-1)',
                border: '1.5px solid var(--border-color)',
                margin: 0,
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <PieChart size={17} color="var(--primary-teal)" />
                  <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    Carton & Box Analytics
                  </h3>
                </div>
                <StatusPill label={`${kpis.totalBoxes} Cartons Live`} variant="teal" />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: '16px', flexWrap: 'wrap', padding: '6px 0' }}>
                {/* SVG Donut Chart */}
                <div style={{ position: 'relative', width: '130px', height: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="130" height="130" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                    {/* Background Circle */}
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="transparent"
                      stroke="var(--bg-surface-2)"
                      strokeWidth="14"
                    />
                    {/* Full Boxes Stroke */}
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="transparent"
                      stroke="#10B981"
                      strokeWidth="14"
                      strokeDasharray={`${(fullBoxPct * 251.2) / 100} 251.2`}
                      strokeDashoffset="0"
                      strokeLinecap="round"
                    />
                    {/* Open Boxes Stroke */}
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="transparent"
                      stroke="#F59E0B"
                      strokeWidth="14"
                      strokeDasharray={`${(openBoxPct * 251.2) / 100} 251.2`}
                      strokeDashoffset={`-${(fullBoxPct * 251.2) / 100}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  {/* Center Text */}
                  <div style={{ position: 'absolute', textAlign: 'center', pointerEvents: 'none' }}>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {kpis.totalBoxes}
                    </div>
                    <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Cartons
                    </div>
                  </div>
                </div>

                {/* Donut Legend & Stats */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minWidth: '150px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }} />
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>Sealed / Full</span>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#10B981' }}>
                      {kpis.fullBoxes} ({fullBoxPct}%)
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#F59E0B', display: 'inline-block' }} />
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>Open / Packing</span>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#F59E0B' }}>
                      {kpis.openBoxes} ({openBoxPct}%)
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#059669', display: 'inline-block' }} />
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>AQL Audited</span>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#059669' }}>
                      {kpis.aqlPassed} Passed
                    </span>
                  </div>
                </div>
              </div>

              {/* Progress Summary */}
              <div style={{ padding: '10px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Carton Capacity Sealed Rate</span>
                  <span style={{ color: '#10B981', fontWeight: 800 }}>{fullBoxPct}% Complete</span>
                </div>
                <ProgressBar current={kpis.fullBoxes} total={Math.max(1, kpis.totalBoxes)} height={6} color="#10B981" />
              </div>
            </div>
          </div>

          {/* ── 3. MASTER CHARTS ROW 2: Quality Radial Gauges + Velocity Curve ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>

            {/* CHART 3: Quality Compliance Matrix & Radial Gauges */}
            <div
              className="card"
              style={{
                backgroundColor: 'var(--bg-surface-1)',
                border: '1.5px solid var(--border-color)',
                margin: 0,
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={17} color="#10B981" />
                  <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    Quality Compliance & Yield Matrix
                  </h3>
                </div>
                <StatusPill label={`${qcPassRate}% QC Pass`} variant={qcPassRate >= 95 ? 'green' : 'amber'} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {/* Radial Gauge 1: QC Yield */}
                <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '12px', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    QC First-Pass Yield
                  </span>
                  <div style={{ position: 'relative', width: '90px', height: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="90" height="90" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="50" cy="50" r="38" fill="transparent" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
                      <circle
                        cx="50"
                        cy="50"
                        r="38"
                        fill="transparent"
                        stroke="#10B981"
                        strokeWidth="10"
                        strokeDasharray={`${(qcPassRate * 238.7) / 100} 238.7`}
                        strokeDashoffset="0"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div style={{ position: 'absolute', textAlign: 'center' }}>
                      <span style={{ fontSize: '16px', fontWeight: 800, color: '#10B981' }}>{qcPassRate}%</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {kpis.qcPassed} pass • {kpis.qcFailed} fail
                  </span>
                </div>

                {/* Radial Gauge 2: AQL Approval */}
                <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '12px', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    AQL Box Audit Rate
                  </span>
                  <div style={{ position: 'relative', width: '90px', height: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="90" height="90" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="50" cy="50" r="38" fill="transparent" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
                      <circle
                        cx="50"
                        cy="50"
                        r="38"
                        fill="transparent"
                        stroke="#059669"
                        strokeWidth="10"
                        strokeDasharray={`${(aqlPassRate * 238.7) / 100} 238.7`}
                        strokeDashoffset="0"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div style={{ position: 'absolute', textAlign: 'center' }}>
                      <span style={{ fontSize: '16px', fontWeight: 800, color: '#059669' }}>{aqlPassRate}%</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {kpis.aqlPassed} pass • {kpis.aqlFailed} fail
                  </span>
                </div>
              </div>

              {/* Exception & Scrap summary bar */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '8px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: '#EF4444', display: 'block' }}>{kpis.qcFailed}</span>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-secondary)' }}>QC Rejects</span>
                </div>
                <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '8px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: '#F59E0B', display: 'block' }}>{kpis.aqlFailed}</span>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-secondary)' }}>AQL Fails</span>
                </div>
                <div style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)', padding: '8px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(220, 38, 38, 0.2)' }}>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: '#DC2626', display: 'block' }}>{recentScrapped.length}</span>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-secondary)' }}>Scrapped</span>
                </div>
              </div>
            </div>

            {/* CHART 4: Factory Velocity & Shift Throughput Performance */}
            <div
              className="card"
              style={{
                backgroundColor: 'var(--bg-surface-1)',
                border: '1.5px solid var(--border-color)',
                margin: 0,
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={17} color="var(--primary-teal)" />
                  <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    Shift Velocity & Throughput Trend
                  </h3>
                </div>
                <StatusPill label="Target vs Actual" variant="teal" />
              </div>

              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
                Inspection and packing run rates compared against target hourly tempo across operational shifts.
              </p>

              {/* Visual Shift Velocity Curves SVG */}
              <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '12px', height: '3px', backgroundColor: 'var(--primary-teal)', borderRadius: '2px', display: 'inline-block' }} />
                      <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Actual Packed</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '12px', height: '2px', backgroundColor: 'rgba(255,255,255,0.3)', borderTop: '1px dashed #ECF7F6', display: 'inline-block' }} />
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Target Pace</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#10B981' }}>+8% Performance</span>
                </div>

                {/* SVG Area Sparkline / Velocity Curve */}
                <svg width="100%" height="90" viewBox="0 0 320 90" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="velocityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary-teal)" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="var(--primary-teal)" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  {/* Gridlines */}
                  <line x1="0" y1="20" x2="320" y2="20" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                  <line x1="0" y1="50" x2="320" y2="50" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                  <line x1="0" y1="80" x2="320" y2="80" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />

                  {/* Target Pace Dashed Line */}
                  <line x1="10" y1="40" x2="310" y2="35" stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4" strokeWidth="1.5" />

                  {/* Gradient Area Fill */}
                  <path
                    d="M 10 70 Q 60 55, 110 40 T 210 25 T 310 30 L 310 85 L 10 85 Z"
                    fill="url(#velocityGrad)"
                  />

                  {/* Actual Curve Stroke */}
                  <path
                    d="M 10 70 Q 60 55, 110 40 T 210 25 T 310 30"
                    fill="none"
                    stroke="var(--primary-teal)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />

                  {/* Nodes */}
                  <circle cx="10" cy="70" r="3" fill="var(--primary-teal)" />
                  <circle cx="110" cy="40" r="3.5" fill="var(--primary-teal)" stroke="#0D2630" strokeWidth="2" />
                  <circle cx="210" cy="25" r="3.5" fill="var(--primary-teal)" stroke="#0D2630" strokeWidth="2" />
                  <circle cx="310" cy="30" r="4" fill="#10B981" stroke="#0D2630" strokeWidth="2" />
                </svg>

                {/* Shift Labels */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  <span>Shift A (06:00)</span>
                  <span>Shift B (14:00)</span>
                  <span>Shift C (22:00)</span>
                  <span style={{ color: '#10B981', fontWeight: 700 }}>Current</span>
                </div>
              </div>

              {/* Quick Summary Pill */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>
                <span>Average Line Efficiency: <strong style={{ color: 'var(--text-primary)' }}>98.4%</strong></span>
                <span>Dispatch Variance: <strong style={{ color: '#10B981' }}>On Schedule</strong></span>
              </div>
            </div>
          </div>

          {/* ── 4. ACTIVE PRODUCTION ORDERS VELOCITY MATRIX (COMPACT DATA WIDGET) ── */}
          <div
            className="card"
            style={{
              backgroundColor: 'var(--bg-surface-1)',
              border: '1.5px solid var(--border-color)',
              margin: 0,
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={17} color="var(--primary-teal)" />
                <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Active Production Orders Velocity Matrix
                </h3>
              </div>
              <button
                onClick={() => navigate('/admin/reports')}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--primary-teal)',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                Inspect All Orders in Reports <ChevronRight size={13} />
              </button>
            </div>

            {activeOrders.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                No active production orders found matching the filter scope.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                {activeOrders.slice(0, 6).map((po: any) => {
                  const packed = Number(po.packed_count || 0);
                  const target = Number(po.total_quantity || 1);
                  const pct = Math.min(100, Math.round((packed / target) * 100));

                  return (
                    <div
                      key={po.id}
                      style={{
                        backgroundColor: 'var(--bg-surface-2)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '10px',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <strong style={{ fontSize: '13px', color: 'var(--primary-teal)', display: 'block' }}>
                            {po.po_number}
                          </strong>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {po.style_name || 'Standard Style'}
                          </span>
                        </div>
                        <StatusPill label={po.status || 'CURRENT'} variant={po.status === 'COMPLETED' ? 'green' : 'teal'} />
                      </div>

                      <div style={{ marginTop: '2px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Progress:</span>
                          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                            {packed} / {target} pcs ({pct}%)
                          </span>
                        </div>
                        <ProgressBar current={packed} total={target} height={6} color="var(--primary-teal)" />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        <span>AQL Boxes: <strong style={{ color: '#10B981' }}>{po.aql_passed_boxes || 0}</strong></span>
                        <span>Scrap: <strong style={{ color: po.scrapped_count > 0 ? '#EF4444' : 'var(--text-muted)' }}>{po.scrapped_count || 0}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

const styles: Record<string, any> = {
  filterLabel: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    display: 'block',
    marginBottom: '4px'
  },
  filterInput: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '7px 9px',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontSize: '11px',
    fontWeight: 600,
    outline: 'none'
  },
  smallCard: (bg: string, border: string) => ({
    backgroundColor: 'var(--bg-surface-1)',
    background: `linear-gradient(135deg, var(--bg-surface-1) 0%, ${bg} 100%)`,
    border: `1px solid ${border}`,
    borderRadius: '10px',
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
    transition: 'all 0.15s ease'
  }),
  cardLabel: (color: string) => ({
    fontSize: '9px',
    fontWeight: 800,
    color: color,
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  }),
  cardValue: {
    fontSize: '18px',
    fontWeight: 800,
    color: 'var(--text-primary)',
    marginTop: '2px',
    lineHeight: 1.1
  },
  cardSub: {
    fontSize: '9px',
    color: 'var(--text-muted)',
    marginTop: '2px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  navCard: (bg: string, border: string) => ({
    backgroundColor: bg,
    border: `1px solid ${border}`,
    borderRadius: '12px',
    padding: '14px 16px',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease'
  })
};
