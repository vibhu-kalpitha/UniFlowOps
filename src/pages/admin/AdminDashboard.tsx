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
  CheckCircle2,
  Clock,
  Filter,
  Layers,
  ListFilter,
  Package,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Trash2,
  TrendingUp,
  Users,
  X,
  Zap
} from 'lucide-react';
import { apiFetch } from '../../services/api';
import '../../styles/tokens.css';

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useApp();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'orders' | 'boxes' | 'quality' | 'scrapped' | 'audit'>('orders');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Dropdown & Date filter states
  const [selectedStyle, setSelectedStyle] = useState<string>('');
  const [selectedPoId, setSelectedPoId] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [selectedBoxModal, setSelectedBoxModal] = useState<any>(null);

  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async (styleFilter = selectedStyle, poFilter = selectedPoId, yrFilter = selectedYear, fromD = fromDate, toD = toDate) => {
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
    setSearchTerm('');
  };

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
  const adminBoxes: any[] = data?.adminBoxes || [];
  const recentAuditLogs: any[] = data?.recentAuditLogs || [];
  const recentScrapped: any[] = data?.recentScrapped || [];

  const totalQc = kpis.qcPassed + kpis.qcFailed;
  const qcPassRate = totalQc > 0 ? Math.round((kpis.qcPassed / totalQc) * 100) : 100;
  const totalAql = kpis.aqlPassed + kpis.aqlFailed;
  const aqlPassRate = totalAql > 0 ? Math.round((kpis.aqlPassed / totalAql) * 100) : 100;
  const testPassRate = 100;

  const qualityRates = {
    qcPassRate,
    testPassRate,
    aqlPassRate,
    totalQc,
    passQc: kpis.qcPassed,
    totalAql,
    passAql: kpis.aqlPassed
  };

  const exceptions = {
    qcFailed: kpis.qcFailed,
    testFailed: 0,
    aqlFailed: kpis.aqlFailed,
    pendingPack: Math.max(0, kpis.qcPassed - kpis.packedQuantity)
  };

  const filteredOrders = activeOrders.filter(po => 
    (po.po_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (po.style_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (po.po_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredBoxes = adminBoxes.filter(bx =>
    (bx.boxCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (bx.poNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (bx.styleName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isFiltered = Boolean(selectedStyle || selectedPoId || selectedYear || fromDate || toDate);

  return (
    <div className="desktop-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── Top Header & Executive Control Bar ─────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '16px 20px',
        backgroundColor: 'var(--bg-surface-1)',
        borderRadius: '16px',
        border: '1px solid var(--border-color)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#10B981',
              boxShadow: '0 0 10px #10B981',
              display: 'inline-block'
            }} />
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-teal)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              FACTORY REAL-TIME CONTROL DASHBOARD
            </span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
            Executive Operations Command 🏢
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Welcome back, <strong>{currentUser?.name || currentUser?.username || 'Admin'}</strong> • Live Database Stream
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
            onClick={() => navigate('/supervisor/production-orders/new/style')}
            className="btn btn-primary"
            style={{ padding: '8px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '10px' }}
          >
            <Zap size={14} /> + New Production Order
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '14px 18px',
          backgroundColor: 'rgba(239, 68, 68, 0.12)',
          border: '1.5px solid rgba(239, 68, 68, 0.4)',
          borderRadius: '14px',
          color: '#EF4444',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <AlertTriangle size={20} />
          <span style={{ fontWeight: 700, fontSize: '13px' }}>
            Failed to load admin dashboard live data: {error}
          </span>
        </div>
      )}

      {/* ── RIGHT-SIDE FILTER PANEL & KPI SUMMARY ───────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '16px' }}>
        {/* Left Side: 13 Executive KPI Cards Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '10px'
          }}>
            {/* KPI 1: Total Styles */}
            <div style={styles.kpiCardGradient('rgba(59, 130, 246, 0.12)', '#3B82F6')}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#3B82F6', textTransform: 'uppercase' }}>TOTAL STYLES</span>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>{kpis.totalStyles}</div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Registered Styles</span>
            </div>

            {/* KPI 2: Active POs */}
            <div style={styles.kpiCardGradient('rgba(20, 184, 166, 0.12)', 'var(--color-teal)')}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-teal)', textTransform: 'uppercase' }}>ACTIVE POs</span>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>{kpis.activePos}</div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Current / Draft</span>
            </div>

            {/* KPI 3: Running POs */}
            <div style={styles.kpiCardGradient('rgba(16, 185, 129, 0.12)', '#10B981')}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#10B981', textTransform: 'uppercase' }}>RUNNING POs</span>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>{kpis.runningPos}</div>
              <span style={{ fontSize: '10px', color: '#10B981', fontWeight: 600 }}>● In Progress</span>
            </div>

            {/* KPI 4: Planned Quantity */}
            <div style={styles.kpiCardGradient('rgba(139, 92, 246, 0.12)', 'var(--color-purple)')}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-purple)', textTransform: 'uppercase' }}>PLANNED QTY</span>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>{kpis.plannedQuantity}</div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Configured units</span>
            </div>

            {/* KPI 5: QC Pass */}
            <div style={styles.kpiCardGradient('rgba(16, 185, 129, 0.12)', '#10B981')}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#10B981', textTransform: 'uppercase' }}>QC PASS</span>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#10B981', marginTop: '4px' }}>{kpis.qcPassed}</div>
              <span style={{ fontSize: '10px', color: '#10B981' }}>✓ Quality Passed</span>
            </div>

            {/* KPI 6: QC Fail */}
            <div style={styles.kpiCardGradient('rgba(245, 158, 11, 0.12)', '#F59E0B')}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#F59E0B', textTransform: 'uppercase' }}>QC FAIL</span>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#F59E0B', marginTop: '4px' }}>{kpis.qcFailed}</div>
              <span style={{ fontSize: '10px', color: '#F59E0B' }}>⚠️ QC Rejections</span>
            </div>

            {/* KPI 7: Packed Quantity */}
            <div style={styles.kpiCardGradient('rgba(59, 130, 246, 0.12)', '#3B82F6')}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#3B82F6', textTransform: 'uppercase' }}>PACKED QTY</span>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>{kpis.packedQuantity}</div>
              <span style={{ fontSize: '10px', color: '#3B82F6' }}>📦 Active In Boxes</span>
            </div>

            {/* KPI 8: AQL Pass */}
            <div style={styles.kpiCardGradient('rgba(5, 150, 105, 0.12)', '#059669')}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#059669', textTransform: 'uppercase' }}>AQL PASS</span>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#059669', marginTop: '4px' }}>{kpis.aqlPassed}</div>
              <span style={{ fontSize: '10px', color: '#059669' }}>Audited Boxes</span>
            </div>

            {/* KPI 9: AQL Fail */}
            <div style={styles.kpiCardGradient('rgba(239, 68, 68, 0.12)', '#EF4444')}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#EF4444', textTransform: 'uppercase' }}>AQL FAIL</span>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#EF4444', marginTop: '4px' }}>{kpis.aqlFailed}</div>
              <span style={{ fontSize: '10px', color: '#EF4444' }}>Box Audit Rejections</span>
            </div>

            {/* KPI 10: Total Boxes */}
            <div style={styles.kpiCardGradient('rgba(139, 92, 246, 0.12)', '#8B5CF6')}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#8B5CF6', textTransform: 'uppercase' }}>TOTAL BOXES</span>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>{kpis.totalBoxes}</div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Created Cartons</span>
            </div>

            {/* KPI 11: Open Boxes */}
            <div style={styles.kpiCardGradient('rgba(245, 158, 11, 0.12)', '#F59E0B')}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#F59E0B', textTransform: 'uppercase' }}>OPEN BOXES</span>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#F59E0B', marginTop: '4px' }}>{kpis.openBoxes}</div>
              <span style={{ fontSize: '10px', color: '#F59E0B' }}>Packing In Progress</span>
            </div>

            {/* KPI 12: Full Boxes */}
            <div style={styles.kpiCardGradient('rgba(16, 185, 129, 0.12)', '#10B981')}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#10B981', textTransform: 'uppercase' }}>FULL BOXES</span>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#10B981', marginTop: '4px' }}>{kpis.fullBoxes}</div>
              <span style={{ fontSize: '10px', color: '#10B981' }}>Sealed Cartons</span>
            </div>

            {/* KPI 13: Overall PO Completion % */}
            <div style={styles.kpiCardGradient('rgba(20, 184, 166, 0.12)', 'var(--primary-teal)')}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--primary-teal)', textTransform: 'uppercase' }}>PO COMPLETION %</span>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--primary-teal)', marginTop: '4px' }}>{kpis.overallPoCompletion}%</div>
              <span style={{ fontSize: '10px', color: 'var(--primary-teal)' }}>Planned vs Packed</span>
            </div>
          </div>
        </div>

        {/* Right Side Filter Panel */}
        <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1.5px solid var(--border-color)', margin: 0, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Filter size={16} color="var(--primary-teal)" />
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>Dashboard Filters</span>
            </div>
            {isFiltered && (
              <button
                onClick={handleClearFilters}
                style={{ fontSize: '11px', color: '#EF4444', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Clear All
              </button>
            )}
          </div>

          {/* Year Filter */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Year</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              style={styles.filterInput}
            >
              <option value="">All Years</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
            </select>
          </div>

          {/* Style Filter */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Garment Style</label>
            <select
              value={selectedStyle}
              onChange={handleStyleChange}
              style={styles.filterInput}
            >
              <option value="">All Styles</option>
              {filterOptions.availableStyles?.map((st: string) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          {/* PO Filter */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Production Order</label>
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

          {/* Date Range */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              style={styles.filterInput}
            />
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              style={styles.filterInput}
            />
          </div>
        </div>
      </div>

      {/* ── Main Interactive Tabs Section ─────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Navigation Tabs Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '8px'
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setActiveTab('orders')}
              style={styles.tabBtn(activeTab === 'orders')}
            >
              <Box size={15} /> Production Orders ({activeOrders.length})
            </button>
            <button
              onClick={() => setActiveTab('boxes')}
              style={styles.tabBtn(activeTab === 'boxes')}
            >
              <Package size={15} /> Box Overview ({adminBoxes.length})
            </button>
            <button
              onClick={() => setActiveTab('quality')}
              style={styles.tabBtn(activeTab === 'quality')}
            >
              <BarChart3 size={15} /> Quality & Pass Rates
            </button>
            <button
              onClick={() => setActiveTab('scrapped')}
              style={styles.tabBtn(activeTab === 'scrapped')}
            >
              <Trash2 size={15} /> Scrapped Items Log ({recentScrapped.length})
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              style={styles.tabBtn(activeTab === 'audit')}
            >
              <Activity size={15} /> Real-Time Audit Feed
            </button>
          </div>

          {activeTab === 'orders' && (
            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search PO number / style..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px 6px 30px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  backgroundColor: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)'
                }}
              />
            </div>
          )}
        </div>

        {/* TAB 1: PRODUCTION ORDERS MONITOR */}
        {activeTab === 'orders' && (
          <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0, padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Production Orders Live Progress</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Monitor target vs packed quantities, AQL box approvals, and scrapped units in real-time.
                </p>
              </div>
              <button
                onClick={() => navigate('/admin/orders')}
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                Manage All Orders →
              </button>
            </div>

            {filteredOrders.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No active production orders found for the selected filter.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>PO NUMBER</th>
                      <th style={styles.th}>STYLE NAME</th>
                      <th style={styles.th}>TARGET QTY</th>
                      <th style={styles.th}>PACKED QTY</th>
                      <th style={styles.th}>PROGRESS</th>
                      <th style={styles.th}>AQL PASSED BOXES</th>
                      <th style={styles.th}>SCRAPPED</th>
                      <th style={styles.th}>STATUS</th>
                      <th style={styles.th}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((po: any) => {
                      const packed = Number(po.packed_count || 0);
                      const target = Number(po.total_quantity || 1);
                      const percent = Math.min(100, Math.round((packed / target) * 100));

                      return (
                        <tr key={po.id} style={styles.tr}>
                          <td style={styles.td}>
                            <strong style={{ color: 'var(--color-teal)' }}>{po.po_number}</strong>
                          </td>
                          <td style={styles.td}>{po.style_name || 'Standard Style'}</td>
                          <td style={styles.td}>
                            <strong>{po.total_quantity}</strong> pcs
                          </td>
                          <td style={styles.td}>
                            <span style={{ color: 'var(--color-purple)', fontWeight: 800 }}>{packed}</span> pcs
                          </td>
                          <td style={{ ...styles.td, minWidth: '130px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <ProgressBar current={packed} total={target} height={6} color="var(--color-purple)" />
                              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>{percent}%</span>
                            </div>
                          </td>
                          <td style={styles.td}>
                            <StatusPill label={`${po.aql_passed_boxes || 0} Boxes`} variant={po.aql_passed_boxes > 0 ? 'green' : 'muted'} />
                          </td>
                          <td style={styles.td}>
                            {po.scrapped_count > 0 ? (
                              <span style={{ color: '#EF4444', fontWeight: 800 }}>⚠️ {po.scrapped_count}</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>0</span>
                            )}
                          </td>
                          <td style={styles.td}>
                            <StatusPill label={po.status || 'CURRENT'} variant={po.status === 'COMPLETED' ? 'green' : 'teal'} />
                          </td>
                          <td style={styles.td}>
                            <button
                              onClick={() => navigate('/admin/reports')}
                              style={{
                                padding: '4px 10px',
                                borderRadius: '6px',
                                backgroundColor: 'var(--bg-surface-2)',
                                border: '1px solid var(--border-color)',
                                color: 'var(--color-teal)',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              Inspect Details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB: BOX OVERVIEW */}
        {activeTab === 'boxes' && (
          <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0, padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Factory Box Overview & Item Tracking</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Monitor capacity (X/Y), filled/remaining space, AQL audit status, and item QR contents.
                </p>
              </div>
              <StatusPill label={`${filteredBoxes.length} Boxes Total`} variant="teal" />
            </div>

            {filteredBoxes.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No boxes registered for the selected filter.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>BOX NUMBER</th>
                      <th style={styles.th}>PO NUMBER</th>
                      <th style={styles.th}>STYLE NAME</th>
                      <th style={styles.th}>CAPACITY (X/Y)</th>
                      <th style={styles.th}>STATUS</th>
                      <th style={styles.th}>AQL AUDIT</th>
                      <th style={styles.th}>TRANSFER STATUS</th>
                      <th style={styles.th}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBoxes.map((bx: any) => (
                      <tr key={bx.id} style={styles.tr}>
                        <td style={styles.td}>
                          <strong style={{ color: 'var(--color-purple)' }}>{bx.boxCode || bx.boxNumber}</strong>
                        </td>
                        <td style={styles.td}>{bx.poNumber}</td>
                        <td style={styles.td}>{bx.styleName}</td>
                        <td style={styles.td}>
                          <strong style={{ color: 'var(--color-teal)' }}>{bx.activeFilledCount}</strong> / {bx.capacity} pcs
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>
                            ({bx.remainingCapacity} space left)
                          </span>
                        </td>
                        <td style={styles.td}>
                          <StatusPill label={bx.status} variant={bx.status === 'COMPLETED' ? 'green' : 'amber'} />
                        </td>
                        <td style={styles.td}>
                          <StatusPill label={bx.aqlStatus} variant={bx.aqlStatus === 'PASS' ? 'green' : bx.aqlStatus === 'FAIL' ? 'red' : 'muted'} />
                        </td>
                        <td style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{bx.transferStatus || 'NONE'}</span>
                        </td>
                        <td style={styles.td}>
                          <button
                            onClick={() => setSelectedBoxModal(bx)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(139, 92, 246, 0.15)',
                              border: '1px solid var(--color-purple)',
                              color: 'var(--color-purple)',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            View Active QRs ({bx.productQrs?.length || 0})
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

        {/* TAB 2: QUALITY & PASS RATES */}
        {activeTab === 'quality' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            {/* Pass Rates Visual Breakdown */}
            <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0, padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Stage Quality Pass Rates</h3>
                <StatusPill label="Live Analytics" variant="green" />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* QC Inspection */}
                <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '12px 14px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700 }}>1. QC Inspection Pass Rate</span>
                    <span style={{ fontWeight: 800, color: '#10B981' }}>{qualityRates.qcPassRate}%</span>
                  </div>
                  <ProgressBar current={Math.round(qualityRates.qcPassRate * 10)} total={1000} height={10} color="#10B981" />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    <span>Total Scanned: {qualityRates.totalQc}</span>
                    <span>Passed: {qualityRates.passQc}</span>
                  </div>
                </div>

                {/* Function Test */}
                <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '12px 14px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700 }}>2. Function Test Pass Rate</span>
                    <span style={{ fontWeight: 800, color: '#3B82F6' }}>{qualityRates.testPassRate}%</span>
                  </div>
                  <ProgressBar current={Math.round(qualityRates.testPassRate * 10)} total={1000} height={10} color="#3B82F6" />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    <span>Functional Validation Stage</span>
                    <span>Pass: {qualityRates.testPassRate}%</span>
                  </div>
                </div>

                {/* AQL Audit */}
                <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '12px 14px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700 }}>3. AQL Audit Box Approval</span>
                    <span style={{ fontWeight: 800, color: '#8B5CF6' }}>{qualityRates.aqlPassRate}%</span>
                  </div>
                  <ProgressBar current={Math.round(qualityRates.aqlPassRate * 10)} total={1000} height={10} color="#8B5CF6" />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    <span>Total Audits: {qualityRates.totalAql}</span>
                    <span>Passed: {qualityRates.passAql}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Exceptions & Defect Log Summary */}
            <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0, padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <AlertTriangle size={18} color="#EF4444" />
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#EF4444' }}>Defect & Exception Counts</h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '14px', borderRadius: '12px', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <span style={{ fontSize: '24px', fontWeight: 800, color: '#EF4444', display: 'block' }}>{exceptions.qcFailed}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>QC Failed Items</span>
                </div>

                <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '14px', borderRadius: '12px', textAlign: 'center', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                  <span style={{ fontSize: '24px', fontWeight: 800, color: '#F59E0B', display: 'block' }}>{exceptions.testFailed}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>Test Failures</span>
                </div>

                <div style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', padding: '14px', borderRadius: '12px', textAlign: 'center', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                  <span style={{ fontSize: '24px', fontWeight: 800, color: '#8B5CF6', display: 'block' }}>{exceptions.aqlFailed}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>AQL Failed Boxes</span>
                </div>

                <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: '14px', borderRadius: '12px', textAlign: 'center', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                  <span style={{ fontSize: '24px', fontWeight: 800, color: '#3B82F6', display: 'block' }}>{exceptions.pendingPack}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>Pending Packing</span>
                </div>
              </div>

              <div style={{ marginTop: '16px', padding: '12px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block' }}>💡 Quality Control Note</span>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Failed items selected for <strong>Re-use (Rework)</strong> return to operator queues, while <strong>Permanently Removed</strong> items are immediately deactivated and logged in the scrap table.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SCRAPPED ITEMS ARCHIVE */}
        {activeTab === 'scrapped' && (
          <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0, padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#EF4444' }}>Permanently Removed Garments (Scrap Archive)</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Audit log of garments scrapped during AQL or QC inspections.
                </p>
              </div>
              <StatusPill label={`${recentScrapped.length} Items Logged`} variant="red" />
            </div>

            {recentScrapped.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No permanently removed garments logged in database for this filter.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>ITEM QR BARCODE</th>
                      <th style={styles.th}>BOX NUMBER</th>
                      <th style={styles.th}>ACTION TYPE</th>
                      <th style={styles.th}>REASON FOR SCRAP</th>
                      <th style={styles.th}>REMOVED BY</th>
                      <th style={styles.th}>TIMESTAMP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentScrapped.map((item: any) => (
                      <tr key={item.id} style={styles.tr}>
                        <td style={styles.td}>
                          <strong style={{ color: '#EF4444' }}>{item.item_qr}</strong>
                        </td>
                        <td style={styles.td}>{item.box_id || 'N/A'}</td>
                        <td style={styles.td}>
                          <StatusPill label={item.action_type || 'PERMANENTLY_REMOVE'} variant="red" />
                        </td>
                        <td style={styles.td}>{item.reason || 'Irreparable Damaged Garment'}</td>
                        <td style={styles.td}>{item.operator_name || item.removed_by || 'Operator'}</td>
                        <td style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {item.removed_at ? new Date(item.removed_at).toLocaleString() : 'Recent'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: REAL-TIME AUDIT FEED */}
        {activeTab === 'audit' && (
          <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0, padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Real-Time System Audit Stream</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Live security & operations event stream recorded in MySQL `audit_log`.
                </p>
              </div>
              <button
                onClick={() => navigate('/admin/sessions')}
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                User Sessions →
              </button>
            </div>

            {recentAuditLogs.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No audit events logged yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {recentAuditLogs.map((log: any) => (
                  <div
                    key={log.id}
                    style={{
                      backgroundColor: 'var(--bg-surface-2)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        padding: '8px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(20, 184, 166, 0.15)',
                        color: 'var(--color-teal)'
                      }}>
                        <Activity size={16} />
                      </div>
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'block' }}>
                          {log.action}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          Target: {log.target_table} • User: <strong>{log.user_name || log.user_id || 'System'}</strong> ({log.user_role || 'ADMIN'})
                        </span>
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'Just now'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Admin Navigation Footer Bar ──────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px',
        marginTop: '10px'
      }}>
        <button
          onClick={() => navigate('/admin/sessions')}
          style={styles.navCard('#0F2942', '#1E4650')}
        >
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#3B82F6' }}>🔐 User Sessions & Activity</span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Inspect login history</span>
        </button>

        <button
          onClick={() => navigate('/admin/users')}
          style={styles.navCard('#1A1C38', '#2D3055')}
        >
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#8B5CF6' }}>👥 Shift Members & Operators</span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Manage operator allocations</span>
        </button>

        <button
          onClick={() => navigate('/admin/reports')}
          style={styles.navCard('#0B2D27', '#174E45')}
        >
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#10B981' }}>📊 Production Reports</span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Export PDF/Excel stats</span>
        </button>

        <button
          onClick={() => navigate('/admin/orders')}
          style={styles.navCard('#2D1A25', '#4A2A3B')}
        >
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#EC4899' }}>📦 Production Orders Config</span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Configure PO QR ranges</span>
        </button>
      </div>

      {/* ── Box Detail Modal ───────────────────────────── */}
      {selectedBoxModal && (
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
            maxWidth: '560px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-teal)', letterSpacing: '0.08em' }}>BOX CONTENT DETAIL</span>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Box {selectedBoxModal.boxCode || selectedBoxModal.boxNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedBoxModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', backgroundColor: 'var(--bg-surface-2)', padding: '12px', borderRadius: '12px' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>PO Number:</span>
                <span style={{ fontSize: '12px', fontWeight: 700, display: 'block', color: 'var(--text-primary)' }}>{selectedBoxModal.poNumber}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Garment Style:</span>
                <span style={{ fontSize: '12px', fontWeight: 700, display: 'block', color: 'var(--text-primary)' }}>{selectedBoxModal.styleName}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Capacity:</span>
                <span style={{ fontSize: '12px', fontWeight: 700, display: 'block', color: 'var(--color-purple)' }}>
                  {selectedBoxModal.activeFilledCount} / {selectedBoxModal.capacity} pcs
                </span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>AQL Inspection:</span>
                <StatusPill label={selectedBoxModal.aqlStatus} variant={selectedBoxModal.aqlStatus === 'PASS' ? 'green' : selectedBoxModal.aqlStatus === 'FAIL' ? 'red' : 'muted'} />
              </div>
            </div>

            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>
                Active Scanned Garment QRs ({selectedBoxModal.productQrs?.length || 0}):
              </h4>
              <div style={{
                maxHeight: '180px',
                overflowY: 'auto',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                backgroundColor: 'var(--bg-surface-2)',
                padding: '10px',
                borderRadius: '10px'
              }}>
                {selectedBoxModal.productQrs && selectedBoxModal.productQrs.length > 0 ? (
                  selectedBoxModal.productQrs.map((qr: string, idx: number) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        backgroundColor: 'rgba(20, 184, 166, 0.15)',
                        color: 'var(--color-teal)',
                        border: '1px solid rgba(20, 184, 166, 0.3)',
                        padding: '4px 8px',
                        borderRadius: '6px'
                      }}
                    >
                      {qr}
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No items packed in this box yet.</span>
                )}
              </div>
            </div>

            <button
              onClick={() => setSelectedBoxModal(null)}
              className="btn btn-secondary"
              style={{ marginTop: '8px' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, any> = {
  kpiCardGradient: (bg: string, border: string) => ({
    backgroundColor: 'var(--bg-surface-1)',
    background: `linear-gradient(135deg, var(--bg-surface-1) 0%, ${bg} 100%)`,
    border: `1px solid ${border}`,
    borderRadius: '16px',
    padding: '16px',
    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.15)',
    transition: 'all 0.2s ease-in-out'
  }),
  tabBtn: (active: boolean) => ({
    padding: '8px 14px',
    borderRadius: '10px',
    fontSize: '12px',
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: active ? 'var(--color-teal)' : 'var(--bg-surface-1)',
    color: active ? '#000000' : 'var(--text-secondary)',
    border: active ? '1px solid var(--color-teal)' : '1px solid var(--border-color)',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  }),
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
  }),
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
    textAlign: 'left'
  },
  th: {
    padding: '10px 12px',
    borderBottom: '2px solid var(--border-color)',
    color: 'var(--text-muted)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.05em'
  },
  tr: {
    borderBottom: '1px solid var(--border-color)'
  },
  td: {
    padding: '12px',
    color: 'var(--text-primary)',
    fontSize: '12px'
  }
};
