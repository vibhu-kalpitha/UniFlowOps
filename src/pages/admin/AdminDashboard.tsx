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
  const [activeTab, setActiveTab] = useState<'orders' | 'quality' | 'scrapped' | 'audit'>('orders');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Dropdown filter states
  const [selectedStyle, setSelectedStyle] = useState<string>('');
  const [selectedPoId, setSelectedPoId] = useState<string>('');

  const fetchDashboardData = async (styleFilter = selectedStyle, poFilter = selectedPoId) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (styleFilter) params.set('styleName', styleFilter);
      if (poFilter) params.set('poId', poFilter);

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const res = await apiFetch(`/api/dashboard/admin${queryString}`);
      setData(res);
    } catch (err) {
      console.error('Failed to load admin dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData(selectedStyle, selectedPoId);
  }, [selectedStyle, selectedPoId]);

  const filterOptions = data?.filter || { availableStyles: [], availablePos: [] };

  const handleStyleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const styleVal = e.target.value;
    setSelectedStyle(styleVal);
    // Reset PO selection if changing style
    setSelectedPoId('');
  };

  const handlePoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const poVal = e.target.value;
    setSelectedPoId(poVal);
  };

  const handleClearFilters = () => {
    setSelectedStyle('');
    setSelectedPoId('');
    setSearchTerm('');
  };

  const kpis = data?.kpis || {
    currentPos: 0,
    totalPos: 0,
    salesOrders: 0,
    itemsProcessed: 0,
    packedUnits: 0,
    totalBoxes: 0,
    boxTransfers: 0,
    scrappedUnits: 0,
    activeOperators: 0,
    overallQualityIndex: 100
  };

  const qualityRates = data?.qualityRates || {
    qcPassRate: 100,
    testPassRate: 100,
    aqlPassRate: 100,
    totalQc: 0,
    totalAql: 0,
    passQc: 0,
    passAql: 0
  };

  const exceptions = data?.exceptions || {
    qcFailed: 0,
    testFailed: 0,
    aqlFailed: 0,
    pendingPack: 0,
    scrappedCount: 0
  };

  const activeOrders: any[] = data?.activeProductionOrders || [];
  const recentScrapped: any[] = data?.recentScrapped || [];
  const recentAuditLogs: any[] = data?.recentAuditLogs || [];

  const filteredOrders = activeOrders.filter(po => 
    (po.po_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (po.style_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isFiltered = Boolean(selectedStyle || selectedPoId);

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
            Welcome back, <strong>{currentUser?.name || currentUser?.username || 'Admin'}</strong> • Live MySQL Factory Data Stream
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => fetchDashboardData(selectedStyle, selectedPoId)}
            className="btn btn-secondary"
            style={{ padding: '8px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '10px' }}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            {loading ? 'Refreshing...' : 'Refresh Live'}
          </button>
          <button
            onClick={() => navigate('/supervisor/create-po')}
            className="btn btn-primary"
            style={{ padding: '8px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '10px' }}
          >
            <Zap size={14} /> + New Production Order
          </button>
        </div>
      </div>

      {/* ── STYLE & PO FILTER BAR ─────────────────────────────── */}
      <div style={{
        backgroundColor: 'var(--bg-surface-1)',
        border: '1px solid var(--border-color)',
        borderRadius: '14px',
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Filter size={16} color="var(--color-teal)" />
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Data Filters:
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-start' }}>
          {/* Style Filter Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Tag size={14} color="var(--text-muted)" />
            <select
              value={selectedStyle}
              onChange={handleStyleChange}
              style={{
                backgroundColor: 'var(--bg-surface-2)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                outline: 'none',
                minWidth: '160px'
              }}
            >
              <option value="">All Garment Styles</option>
              {filterOptions.availableStyles?.map((style: string) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </div>

          {/* Production Order Filter Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Box size={14} color="var(--text-muted)" />
            <select
              value={selectedPoId}
              onChange={handlePoChange}
              style={{
                backgroundColor: 'var(--bg-surface-2)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                outline: 'none',
                minWidth: '200px'
              }}
            >
              <option value="">All Production Orders (POs)</option>
              {filterOptions.availablePos?.map((po: any) => (
                <option key={po.id} value={po.id}>
                  {po.po_number} ({po.style_name || 'Style'})
                </option>
              ))}
            </select>
          </div>

          {isFiltered && (
            <button
              onClick={handleClearFilters}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 10px',
                borderRadius: '6px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#EF4444',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <X size={12} /> Clear Filter
            </button>
          )}
        </div>

        {isFiltered && (
          <StatusPill
            label={`Filtered: ${selectedStyle ? `Style "${selectedStyle}"` : ''} ${selectedPoId ? `PO ID "${selectedPoId}"` : ''}`}
            variant="teal"
          />
        )}
      </div>

      {/* ── 6 Primary Executive KPI Cards ─────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '14px'
      }}>
        {/* Card 1: Active POs */}
        <div style={styles.kpiCardGradient('rgba(20, 184, 166, 0.12)', 'var(--color-teal)')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-teal)', letterSpacing: '0.05em' }}>
              ACTIVE POs
            </span>
            <Layers size={18} color="var(--color-teal)" />
          </div>
          <div style={{ marginTop: '10px' }}>
            <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)' }}>
              {kpis.currentPos}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>
              / {kpis.totalPos} total
            </span>
          </div>
          <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--color-teal)', fontWeight: 600 }}>
            ● {kpis.salesOrders} Sales Orders
          </div>
        </div>

        {/* Card 2: Items Processed */}
        <div style={styles.kpiCardGradient('rgba(16, 185, 129, 0.12)', '#10B981')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#10B981', letterSpacing: '0.05em' }}>
              ITEMS PROCESSED
            </span>
            <CheckCircle2 size={18} color="#10B981" />
          </div>
          <div style={{ marginTop: '10px' }}>
            <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)' }}>
              {kpis.itemsProcessed}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>
              units
            </span>
          </div>
          <div style={{ marginTop: '6px', fontSize: '11px', color: '#10B981', fontWeight: 600 }}>
            ✓ Passed Quality Stage
          </div>
        </div>

        {/* Card 3: Packed Units & Boxes */}
        <div style={styles.kpiCardGradient('rgba(139, 92, 246, 0.12)', 'var(--color-purple)')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-purple)', letterSpacing: '0.05em' }}>
              PACKED BOXES
            </span>
            <Package size={18} color="var(--color-purple)" />
          </div>
          <div style={{ marginTop: '10px' }}>
            <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)' }}>
              {kpis.totalBoxes}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>
              ({kpis.packedUnits} pcs)
            </span>
          </div>
          <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--color-purple)', fontWeight: 600 }}>
            📦 {kpis.boxTransfers} Box Transfers
          </div>
        </div>

        {/* Card 4: Scrapped / Removed Items */}
        <div style={styles.kpiCardGradient('rgba(239, 68, 68, 0.12)', '#EF4444')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#EF4444', letterSpacing: '0.05em' }}>
              PERMANENTLY SCRAPPED
            </span>
            <Trash2 size={18} color="#EF4444" />
          </div>
          <div style={{ marginTop: '10px' }}>
            <span style={{ fontSize: '26px', fontWeight: 800, color: '#EF4444' }}>
              {kpis.scrappedUnits}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>
              garments
            </span>
          </div>
          <div style={{ marginTop: '6px', fontSize: '11px', color: '#EF4444', fontWeight: 600 }}>
            ⚠️ Archived in database
          </div>
        </div>

        {/* Card 5: Quality Index */}
        <div style={styles.kpiCardGradient('rgba(59, 130, 246, 0.12)', '#3B82F6')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#3B82F6', letterSpacing: '0.05em' }}>
              FACTORY QUALITY INDEX
            </span>
            <ShieldCheck size={18} color="#3B82F6" />
          </div>
          <div style={{ marginTop: '10px' }}>
            <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)' }}>
              {kpis.overallQualityIndex}%
            </span>
          </div>
          <div style={{ marginTop: '6px', fontSize: '11px', color: '#3B82F6', fontWeight: 600 }}>
            ★ Combined QC/AQL Index
          </div>
        </div>

        {/* Card 6: Active Operators */}
        <div style={styles.kpiCardGradient('rgba(245, 158, 11, 0.12)', '#F59E0B')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#F59E0B', letterSpacing: '0.05em' }}>
              ACTIVE OPERATORS
            </span>
            <Users size={18} color="#F59E0B" />
          </div>
          <div style={{ marginTop: '10px' }}>
            <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)' }}>
              {kpis.activeOperators}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>
              assigned
            </span>
          </div>
          <div style={{ marginTop: '6px', fontSize: '11px', color: '#F59E0B', fontWeight: 600 }}>
            ⚡ Live Shift Assignments
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
