import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Download,
  FileSpreadsheet,
  Printer,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Package,
  Layers,
  ArrowLeftRight,
  FileText,
  Box,
  Trash2,
  Activity,
  Search,
  X
} from 'lucide-react';
import { apiFetch } from '../../services/api';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import '../../styles/tokens.css';

export const AdminReports: React.FC = () => {
  const { showToast } = useApp();
  const [timeRange, setTimeRange] = useState<'Today' | 'Week' | 'Month' | 'All'>('Today');
  const [reportData, setReportData] = useState<any>(null);
  const [adminData, setAdminData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedStyleFilter, setSelectedStyleFilter] = useState<string>('');
  const [selectedPoFilter, setSelectedPoFilter] = useState<string>('');

  // Operational inspection tabs state (moved from dashboard)
  const [activeLogTab, setActiveLogTab] = useState<'orders' | 'boxes' | 'quality' | 'scrapped' | 'audit'>('orders');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedBoxModal, setSelectedBoxModal] = useState<any>(null);

  // Pagination / Row limit state (initial 10 rows with See More)
  const [showAllOrders, setShowAllOrders] = useState<boolean>(false);
  const [showAllBoxes, setShowAllBoxes] = useState<boolean>(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const qParams = new URLSearchParams();
      if (selectedStyleFilter) qParams.set('styleName', selectedStyleFilter);
      if (selectedPoFilter) qParams.set('poId', selectedPoFilter);
      const queryStr = qParams.toString() ? `?${qParams.toString()}` : '';

      const [repRes, admRes] = await Promise.all([
        apiFetch(`/api/reports/production?range=${timeRange.toLowerCase()}`),
        apiFetch(`/api/dashboard/admin${queryStr}`)
      ]);
      setReportData(repRes);
      setAdminData(admRes);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch production reports', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [timeRange, selectedStyleFilter, selectedPoFilter]);

  const rawPoBreakdown: any[] = reportData?.poBreakdown || [];
  const availableStyles: string[] = Array.from(new Set(rawPoBreakdown.map(p => p.styleName).filter(Boolean)));
  const availablePos: string[] = Array.from(new Set(rawPoBreakdown.map(p => p.poNumber).filter(Boolean)));

  const filteredOrders = rawPoBreakdown.filter(p => {
    if (selectedStyleFilter && p.styleName !== selectedStyleFilter) return false;
    if (selectedPoFilter && p.poNumber !== selectedPoFilter && p.poId !== selectedPoFilter) return false;
    return true;
  });

  // Operational logs data from admin API
  const activeOrders: any[] = adminData?.activeProductionOrders || [];
  const adminBoxes: any[] = adminData?.adminBoxes || [];
  const recentAuditLogs: any[] = adminData?.recentAuditLogs || [];
  const recentScrapped: any[] = adminData?.recentScrapped || [];
  const kpis = adminData?.kpis || {
    plannedQuantity: 0,
    qcPassed: 0,
    qcFailed: 0,
    packedQuantity: 0,
    aqlPassed: 0,
    aqlFailed: 0
  };

  const totalQc = kpis.qcPassed + kpis.qcFailed;
  const qcPassRate = totalQc > 0 ? Math.round((kpis.qcPassed / totalQc) * 100) : 100;
  const totalAql = kpis.aqlPassed + kpis.aqlFailed;
  const aqlPassRate = totalAql > 0 ? Math.round((kpis.aqlPassed / totalAql) * 100) : 100;
  const qualityRates = {
    qcPassRate,
    testPassRate: 100,
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

  const filteredActiveOrders = activeOrders.filter(po =>
    (po.po_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (po.style_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (po.po_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredBoxes = adminBoxes.filter(bx =>
    (bx.boxCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (bx.poNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (bx.styleName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Summary Metrics Calculation
  const totalPlanned = filteredOrders.reduce((sum, p) => sum + (p.targetQuantity || 0), 0);
  const totalQcPassed = filteredOrders.reduce((sum, p) => sum + (p.qcPassed || 0), 0);
  const totalQcFailed = filteredOrders.reduce((sum, p) => sum + (p.qcFailed || 0), 0);
  const totalPacked = filteredOrders.reduce((sum, p) => sum + (p.packedCount || 0), 0);
  const totalAqlPassed = filteredOrders.reduce((sum, p) => sum + (p.aqlPassed || 0), 0);
  const totalAqlFailed = filteredOrders.reduce((sum, p) => sum + (p.aqlFailed || 0), 0);
  const totalTransfers = filteredOrders.reduce((sum, p) => sum + (p.boxTransfers || 0), 0);
  const totalScrapped = filteredOrders.reduce((sum, p) => sum + (p.scrappedCount || 0), 0);

  const overallQcTotal = totalQcPassed + totalQcFailed;
  const overallQcPassRate = overallQcTotal > 0 ? Math.round((totalQcPassed / overallQcTotal) * 100) : 100;
  const overallCompletion = totalPlanned > 0 ? Math.min(100, Math.round((totalPacked / totalPlanned) * 100)) : 0;

  /* ── Export to Excel (CSV) Handler ───────────────────────── */
  const handleExportExcel = () => {
    if (filteredOrders.length === 0) {
      showToast('No data available to export', 'warning');
      return;
    }

    const headers = [
      'PO Number',
      'PO Name',
      'Style Name',
      'Customer',
      'Target Planned Qty',
      'QC Passed Qty',
      'QC Failed Qty',
      'QC Pass Rate',
      'Packed Qty',
      'AQL Passed Boxes',
      'AQL Failed Boxes',
      'Box Transfers',
      'Scrapped Garments',
      'Completion %',
      'Status'
    ];

    const rows = filteredOrders.map(p => [
      `"${p.poNumber}"`,
      `"${p.poName || ''}"`,
      `"${p.styleName}"`,
      `"${p.customer || 'Standard'}"`,
      p.targetQuantity,
      p.qcPassed,
      p.qcFailed,
      `"${p.qcPassRate}"`,
      p.packedCount,
      p.aqlPassed,
      p.aqlFailed,
      p.boxTransfers,
      p.scrappedCount,
      `"${p.completionPct}"`,
      `"${p.status}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `UniFlow_Production_Report_${timeRange}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`Exported production report (${filteredOrders.length} POs) to Excel CSV successfully`, 'success');
  };

  /* ── Export to PDF Handler ───────────────────────────────── */
  const handleExportPdf = () => {
    window.print();
    showToast('Print / Save PDF dialog opened', 'info');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Printable Header & Action Bar */}
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
            Executive Operations & Production Reports 📊
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Descriptive Style & PO analysis covering Quality Inspection (QC), Carton Packing, AQL Sample Audits, and Box Transfers.
          </p>
        </div>

        <div className="admin-page-header-actions no-print" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={fetchReports}
            className="btn-secondary"
            style={{ height: '36px', padding: '0 12px', fontSize: '12px', gap: '6px', width: 'auto' }}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button
            onClick={handleExportExcel}
            className="btn-primary"
            style={{ height: '36px', padding: '0 14px', fontSize: '12px', gap: '6px', width: 'auto', backgroundColor: '#059669', borderColor: '#059669' }}
          >
            <FileSpreadsheet size={16} /> Export Excel (CSV)
          </button>
          <button
            onClick={handleExportPdf}
            className="btn-secondary"
            style={{ height: '36px', padding: '0 14px', fontSize: '12px', gap: '6px', width: 'auto' }}
          >
            <Printer size={16} color="var(--primary-teal)" /> Print / Save PDF
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card no-print" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0, padding: '14px', display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', border: '1.5px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Filter size={16} color="var(--primary-teal)" />
          <span style={{ fontSize: '13px', fontWeight: 800 }}>Report Filters:</span>
        </div>

        {/* Time Range Selector */}
        <div style={styles.tabBar}>
          {(['Today', 'Week', 'Month', 'All'] as const).map(tab => (
            <button
              key={tab}
              style={timeRange === tab ? styles.tabActive : styles.tabBtn}
              onClick={() => setTimeRange(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Style Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Style:</label>
          <select
            value={selectedStyleFilter}
            onChange={e => setSelectedStyleFilter(e.target.value)}
            style={styles.selectFilter}
          >
            <option value="">All Styles ({availableStyles.length})</option>
            {availableStyles.map(st => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>

        {/* PO Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>PO Number:</label>
          <select
            value={selectedPoFilter}
            onChange={e => setSelectedPoFilter(e.target.value)}
            style={styles.selectFilter}
          >
            <option value="">All Production Orders ({availablePos.length})</option>
            {availablePos.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {(selectedStyleFilter || selectedPoFilter) && (
          <button
            onClick={() => { setSelectedStyleFilter(''); setSelectedPoFilter(''); }}
            style={{ fontSize: '12px', color: '#EF4444', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* ── Descriptive Analytical Summary Narrative ──────────── */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1.5px solid var(--primary-teal)', margin: 0, padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <FileText size={18} color="var(--primary-teal)" />
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-teal)' }}>
            Executive Performance Narrative & Summary Analysis ({timeRange})
          </h3>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>
          For the selected period (<strong>{timeRange}</strong>), the factory monitored <strong>{filteredOrders.length} Production Order(s)</strong> across active styles.
          Total configured target volume stands at <strong>{totalPlanned.toLocaleString()} units</strong>, with <strong>{totalPacked.toLocaleString()} units packed</strong> into cartons ({overallCompletion}% overall completion rate).
          Quality Control (QC) inspection processed <strong>{(totalQcPassed + totalQcFailed).toLocaleString()} units</strong> with a <strong>{overallQcPassRate}% first-pass yield</strong> ({totalQcPassed} passed, {totalQcFailed} rejected).
          AQL sample box audits completed <strong>{totalAqlPassed} box approvals</strong> and <strong>{totalAqlFailed} box rejections</strong>.
          A total of <strong>{totalTransfers} box transfer(s)</strong> were dispatched to warehouse inventory, while <strong>{totalScrapped} item(s)</strong> were permanently scrapped.
        </p>

        {/* 4 Summary Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginTop: '14px' }}>
          <div style={styles.statBox('rgba(20, 184, 166, 0.12)', 'var(--primary-teal)')}>
            <span style={styles.statVal}>{totalPlanned.toLocaleString()}</span>
            <span style={styles.statLbl}>Planned Units</span>
          </div>
          <div style={styles.statBox('rgba(16, 185, 129, 0.12)', '#10B981')}>
            <span style={{ ...styles.statVal, color: '#10B981' }}>{totalQcPassed.toLocaleString()}</span>
            <span style={styles.statLbl}>QC Passed ({overallQcPassRate}%)</span>
          </div>
          <div style={styles.statBox('rgba(59, 130, 246, 0.12)', '#3B82F6')}>
            <span style={{ ...styles.statVal, color: '#3B82F6' }}>{totalPacked.toLocaleString()}</span>
            <span style={styles.statLbl}>Packed Units ({overallCompletion}%)</span>
          </div>
          <div style={styles.statBox('rgba(139, 92, 246, 0.12)', '#8B5CF6')}>
            <span style={{ ...styles.statVal, color: '#8B5CF6' }}>{totalAqlPassed} / {totalAqlPassed + totalAqlFailed}</span>
            <span style={styles.statLbl}>AQL Passed Boxes</span>
          </div>
          <div style={styles.statBox('rgba(245, 158, 11, 0.12)', '#F59E0B')}>
            <span style={{ ...styles.statVal, color: '#F59E0B' }}>{totalTransfers}</span>
            <span style={styles.statLbl}>Box Transfers</span>
          </div>
          <div style={styles.statBox('rgba(239, 68, 68, 0.12)', '#EF4444')}>
            <span style={{ ...styles.statVal, color: '#EF4444' }}>{totalScrapped}</span>
            <span style={styles.statLbl}>Scrapped Garments</span>
          </div>
        </div>
      </div>

      {/* ── Comprehensive Production Order Breakdown Table ──────── */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-color)', margin: 0, padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Production Order & Operation Detailed Audit Table</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Complete breakdown per Production Order & Style covering target, QC, Packing, AQL, transfers, and scrap.
            </p>
          </div>
          <StatusPill label={`${filteredOrders.length} Orders`} variant="teal" />
        </div>

        {filteredOrders.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No production orders found matching the selected report filters.
          </div>
        ) : (
          <div className="table-responsive-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
            <table className="responsive-table" style={{ ...styles.table, minWidth: '1100px' }}>
              <thead>
                <tr>
                  <th style={styles.th}>PO NUMBER</th>
                  <th style={styles.th}>STYLE NAME</th>
                  <th style={styles.th}>CUSTOMER</th>
                  <th style={styles.th}>PLANNED</th>
                  <th style={styles.th}>QC PASS</th>
                  <th style={styles.th}>QC FAIL</th>
                  <th style={styles.th}>PACKED</th>
                  <th style={styles.th}>AQL PASS BOXES</th>
                  <th style={styles.th}>AQL FAIL BOXES</th>
                  <th style={styles.th}>TRANSFERS</th>
                  <th style={styles.th}>SCRAP</th>
                  <th style={styles.th}>COMPLETION %</th>
                  <th style={styles.th}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {(showAllOrders ? filteredOrders : filteredOrders.slice(0, 10)).map((p: any) => (
                  <tr key={p.poId} style={styles.tr}>
                    <td data-label="PO NUMBER" style={styles.td}>
                      <strong style={{ color: 'var(--primary-teal)' }}>{p.poNumber}</strong>
                      {p.poName && p.poName !== 'N/A' && (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>{p.poName}</span>
                      )}
                    </td>
                    <td data-label="STYLE NAME" style={styles.td}>{p.styleName}</td>
                    <td data-label="CUSTOMER" style={styles.td}>{p.customer}</td>
                    <td data-label="PLANNED" style={styles.td}><strong>{p.targetQuantity.toLocaleString()}</strong></td>
                    <td data-label="QC PASS" style={styles.td}><span style={{ color: '#10B981', fontWeight: 800 }}>{p.qcPassed}</span></td>
                    <td data-label="QC FAIL" style={styles.td}>
                      {p.qcFailed > 0 ? (
                        <span style={{ color: '#F59E0B', fontWeight: 800 }}>⚠️ {p.qcFailed}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>0</span>
                      )}
                    </td>
                    <td data-label="PACKED" style={styles.td}><span style={{ color: '#3B82F6', fontWeight: 800 }}>{p.packedCount}</span></td>
                    <td data-label="AQL PASS BOXES" style={styles.td}>
                      <StatusPill label={`${p.aqlPassed} Boxes`} variant={p.aqlPassed > 0 ? 'green' : 'muted'} />
                    </td>
                    <td data-label="AQL FAIL BOXES" style={styles.td}>
                      {p.aqlFailed > 0 ? (
                        <StatusPill label={`${p.aqlFailed} Fail`} variant="red" />
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>0</span>
                      )}
                    </td>
                    <td data-label="TRANSFERS" style={styles.td}>
                      <span style={{ color: '#8B5CF6', fontWeight: 800 }}>{p.boxTransfers}</span>
                    </td>
                    <td data-label="SCRAP" style={styles.td}>
                      {p.scrappedCount > 0 ? (
                        <span style={{ color: '#EF4444', fontWeight: 800 }}>{p.scrappedCount}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>0</span>
                      )}
                    </td>
                    <td data-label="COMPLETION %" style={{ ...styles.td, minWidth: '110px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <ProgressBar current={p.packedCount} total={p.targetQuantity || 1} height={6} color="var(--primary-teal)" />
                        <span style={{ fontSize: '11px', fontWeight: 700 }}>{p.completionPct}</span>
                      </div>
                    </td>
                    <td data-label="STATUS" style={styles.td}>
                      <StatusPill label={p.status} variant={p.status === 'COMPLETED' ? 'green' : 'teal'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredOrders.length > 10 && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                <button
                  onClick={() => setShowAllOrders(!showAllOrders)}
                  className="btn btn-secondary"
                  style={{
                    padding: '8px 20px',
                    fontSize: '12px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: '1px solid var(--primary-teal)',
                    color: 'var(--primary-teal)',
                    cursor: 'pointer'
                  }}
                >
                  {showAllOrders
                    ? '▲ Show Less (First 10 Orders)'
                    : `▼ See More (${filteredOrders.length - 10} more orders)`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section: Factory Operational Logs & Deep Inspection (From Dashboard) ── */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1.5px solid var(--border-color)', margin: 0, padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: 'var(--primary-teal)',
              boxShadow: '0 0 8px var(--primary-teal)',
              display: 'inline-block'
            }} />
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              FACTORY OPERATIONAL DEEP INSPECTION LOGS
            </span>
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
            Operational Logs & Unit Records 📋
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Inspect live production orders, carton box contents & QR lists, defect rates, scrap logs, and system audit trails.
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '10px'
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button
              onClick={() => setActiveLogTab('orders')}
              style={styles.logTabBtn(activeLogTab === 'orders')}
            >
              <Package size={14} /> Production Orders ({activeOrders.length})
            </button>
            <button
              onClick={() => setActiveLogTab('boxes')}
              style={styles.logTabBtn(activeLogTab === 'boxes')}
            >
              <Box size={14} /> Box Overview ({adminBoxes.length})
            </button>
            <button
              onClick={() => setActiveLogTab('quality')}
              style={styles.logTabBtn(activeLogTab === 'quality')}
            >
              <CheckCircle2 size={14} /> Quality & Pass Rates
            </button>
            <button
              onClick={() => setActiveLogTab('scrapped')}
              style={styles.logTabBtn(activeLogTab === 'scrapped')}
            >
              <Trash2 size={14} /> Scrapped Items ({recentScrapped.length})
            </button>
            <button
              onClick={() => setActiveLogTab('audit')}
              style={styles.logTabBtn(activeLogTab === 'audit')}
            >
              <Activity size={14} /> Real-Time Audit Feed
            </button>
          </div>

          {(activeLogTab === 'orders' || activeLogTab === 'boxes') && (
            <div style={{ position: 'relative', width: '240px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder={activeLogTab === 'orders' ? 'Search PO / style...' : 'Search box / PO / style...'}
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

        {/* TAB 1: PRODUCTION ORDERS */}
        {activeLogTab === 'orders' && (
          <div>
            {filteredActiveOrders.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No active production orders found.
              </div>
            ) : (
              <div className="table-responsive-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
                <table className="responsive-table" style={{ ...styles.table, minWidth: '850px' }}>
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
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActiveOrders.map((po: any) => {
                      const packed = Number(po.packed_count || 0);
                      const target = Number(po.total_quantity || 1);
                      const percent = Math.min(100, Math.round((packed / target) * 100));

                      return (
                        <tr key={po.id} style={styles.tr}>
                          <td data-label="PO NUMBER" style={styles.td}>
                            <strong style={{ color: 'var(--primary-teal)' }}>{po.po_number}</strong>
                          </td>
                          <td data-label="STYLE" style={styles.td}>{po.style_name || 'Standard Style'}</td>
                          <td data-label="TARGET" style={styles.td}>
                            <strong>{po.total_quantity}</strong> pcs
                          </td>
                          <td data-label="PACKED" style={styles.td}>
                            <span style={{ color: 'var(--color-purple)', fontWeight: 800 }}>{packed}</span> pcs
                          </td>
                          <td data-label="PROGRESS" style={{ ...styles.td, minWidth: '130px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <ProgressBar current={packed} total={target} height={6} color="var(--color-purple)" />
                              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>{percent}%</span>
                            </div>
                          </td>
                          <td data-label="AQL PASSED BOXES" style={styles.td}>
                            <StatusPill label={`${po.aql_passed_boxes || 0} Boxes`} variant={po.aql_passed_boxes > 0 ? 'green' : 'muted'} />
                          </td>
                          <td data-label="SCRAPPED" style={styles.td}>
                            {po.scrapped_count > 0 ? (
                              <span style={{ color: '#EF4444', fontWeight: 800 }}>⚠️ {po.scrapped_count}</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>0</span>
                            )}
                          </td>
                          <td data-label="STATUS" style={styles.td}>
                            <StatusPill label={po.status || 'CURRENT'} variant={po.status === 'COMPLETED' ? 'green' : 'teal'} />
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

        {/* TAB 2: BOX OVERVIEW */}
        {activeLogTab === 'boxes' && (
          <div>
            {filteredBoxes.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No boxes registered for this filter.
              </div>
            ) : (
              <div className="table-responsive-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
                <table className="responsive-table" style={{ ...styles.table, minWidth: '850px' }}>
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
                    {(showAllBoxes ? filteredBoxes : filteredBoxes.slice(0, 10)).map((bx: any) => (
                      <tr key={bx.id} style={styles.tr}>
                        <td data-label="BOX NUMBER" style={styles.td}>
                          <strong style={{ color: 'var(--color-purple)' }}>{bx.boxCode || bx.boxNumber}</strong>
                        </td>
                        <td data-label="PO NUMBER" style={styles.td}>{bx.poNumber}</td>
                        <td data-label="STYLE NAME" style={styles.td}>{bx.styleName}</td>
                        <td data-label="CAPACITY (X/Y)" style={styles.td}>
                          <strong style={{ color: 'var(--primary-teal)' }}>{bx.activeFilledCount}</strong> / {bx.capacity} pcs
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>
                            ({bx.remainingCapacity} space left)
                          </span>
                        </td>
                        <td data-label="STATUS" style={styles.td}>
                          <StatusPill label={bx.status} variant={bx.status === 'COMPLETED' ? 'green' : 'amber'} />
                        </td>
                        <td data-label="AQL AUDIT" style={styles.td}>
                          <StatusPill label={bx.aqlStatus} variant={bx.aqlStatus === 'PASS' ? 'green' : bx.aqlStatus === 'FAIL' ? 'red' : 'muted'} />
                        </td>
                        <td data-label="TRANSFER STATUS" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{bx.transferStatus || 'NONE'}</span>
                        </td>
                        <td data-label="ACTION" style={styles.td}>
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

                {filteredBoxes.length > 10 && (
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                    <button
                      onClick={() => setShowAllBoxes(!showAllBoxes)}
                      className="btn btn-secondary"
                      style={{
                        padding: '8px 20px',
                        fontSize: '12px',
                        fontWeight: 700,
                        borderRadius: '8px',
                        border: '1px solid var(--color-purple)',
                        color: 'var(--color-purple)',
                        cursor: 'pointer'
                      }}
                    >
                      {showAllBoxes
                        ? '▲ Show Less (First 10 Boxes)'
                        : `▼ See More (${filteredBoxes.length - 10} more boxes)`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: QUALITY & PASS RATES */}
        {activeLogTab === 'quality' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '16px', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h4 style={{ fontSize: '15px', fontWeight: 800, margin: 0 }}>Stage Quality Pass Rates</h4>
                <StatusPill label="Inspection Analytics" variant="green" />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* QC Inspection */}
                <div style={{ backgroundColor: 'var(--bg-surface-1)', padding: '12px 14px', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700 }}>1. QC Inspection Pass Rate</span>
                    <span style={{ fontWeight: 800, color: '#10B981' }}>{qualityRates.qcPassRate}%</span>
                  </div>
                  <ProgressBar current={Math.round(qualityRates.qcPassRate * 10)} total={1000} height={8} color="#10B981" />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    <span>Total Scanned: {qualityRates.totalQc}</span>
                    <span>Passed: {qualityRates.passQc}</span>
                  </div>
                </div>

                {/* Function Test */}
                <div style={{ backgroundColor: 'var(--bg-surface-1)', padding: '12px 14px', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700 }}>2. Function Test Pass Rate</span>
                    <span style={{ fontWeight: 800, color: '#3B82F6' }}>{qualityRates.testPassRate}%</span>
                  </div>
                  <ProgressBar current={Math.round(qualityRates.testPassRate * 10)} total={1000} height={8} color="#3B82F6" />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    <span>Functional Validation Stage</span>
                    <span>Pass: {qualityRates.testPassRate}%</span>
                  </div>
                </div>

                {/* AQL Audit */}
                <div style={{ backgroundColor: 'var(--bg-surface-1)', padding: '12px 14px', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700 }}>3. AQL Audit Box Approval</span>
                    <span style={{ fontWeight: 800, color: '#8B5CF6' }}>{qualityRates.aqlPassRate}%</span>
                  </div>
                  <ProgressBar current={Math.round(qualityRates.aqlPassRate * 10)} total={1000} height={8} color="#8B5CF6" />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    <span>Total Audits: {qualityRates.totalAql}</span>
                    <span>Passed: {qualityRates.passAql}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Exceptions & Defect Log Summary */}
            <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '16px', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <AlertTriangle size={18} color="#EF4444" />
                <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#EF4444', margin: 0 }}>Defect & Exception Counts</h4>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '10px', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: '#EF4444', display: 'block' }}>{exceptions.qcFailed}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>QC Failed Items</span>
                </div>

                <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '12px', borderRadius: '10px', textAlign: 'center', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: '#F59E0B', display: 'block' }}>{exceptions.testFailed}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>Test Failures</span>
                </div>

                <div style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', padding: '12px', borderRadius: '10px', textAlign: 'center', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: '#8B5CF6', display: 'block' }}>{exceptions.aqlFailed}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>AQL Failed Boxes</span>
                </div>

                <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: '12px', borderRadius: '10px', textAlign: 'center', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                  <span style={{ fontSize: '22px', fontWeight: 800, color: '#3B82F6', display: 'block' }}>{exceptions.pendingPack}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>Pending Packing</span>
                </div>
              </div>

              <div style={{ marginTop: '14px', padding: '10px 12px', backgroundColor: 'var(--bg-surface-1)', borderRadius: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', display: 'block' }}>💡 Quality Control Note</span>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', margin: 0 }}>
                  Failed units flagged for <strong>Rework</strong> return to operator station queues; units flagged <strong>Permanently Removed</strong> are archived in the scrap registry.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SCRAPPED ITEMS */}
        {activeLogTab === 'scrapped' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#EF4444', margin: 0 }}>Permanently Removed Garments (Scrap Archive)</h4>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', margin: 0 }}>
                  Audit log of damaged garments scrapped during AQL or QC inspections.
                </p>
              </div>
              <StatusPill label={`${recentScrapped.length} Items Logged`} variant="red" />
            </div>

            {recentScrapped.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No permanently removed garments logged for this filter.
              </div>
            ) : (
              <div className="table-responsive-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
                <table className="responsive-table" style={{ ...styles.table, minWidth: '780px' }}>
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
                        <td data-label="ITEM QR BARCODE" style={styles.td}>
                          <strong style={{ color: '#EF4444' }}>{item.item_qr}</strong>
                        </td>
                        <td data-label="BOX NUMBER" style={styles.td}>{item.box_id || 'N/A'}</td>
                        <td data-label="ACTION TYPE" style={styles.td}>
                          <StatusPill label={item.action_type || 'PERMANENTLY_REMOVE'} variant="red" />
                        </td>
                        <td data-label="REASON FOR SCRAP" style={styles.td}>{item.reason || 'Irreparable Damaged Garment'}</td>
                        <td data-label="REMOVED BY" style={styles.td}>{item.operator_name || item.removed_by || 'Operator'}</td>
                        <td data-label="TIMESTAMP" style={styles.td}>
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

        {/* TAB 5: REAL-TIME AUDIT FEED */}
        {activeLogTab === 'audit' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 800, margin: 0 }}>Real-Time System Audit Stream</h4>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', margin: 0 }}>
                  Live security & operations event stream recorded in database audit log.
                </p>
              </div>
              <StatusPill label={`${recentAuditLogs.length} Events Live`} variant="teal" />
            </div>

            {recentAuditLogs.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No audit events logged yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recentAuditLogs.map((log: any) => (
                  <div
                    key={log.id}
                    style={{
                      backgroundColor: 'var(--bg-surface-2)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        padding: '6px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(20, 184, 166, 0.15)',
                        color: 'var(--primary-teal)'
                      }}>
                        <Activity size={15} />
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

      {/* ── Box Content Detail Modal ───────────────────────────── */}
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
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', letterSpacing: '0.08em' }}>BOX CONTENT DETAIL</span>
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
                        color: 'var(--primary-teal)',
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
  tabBar: {
    display: 'flex',
    backgroundColor: 'var(--bg-surface-2)',
    borderRadius: '10px',
    padding: '3px',
    border: '1px solid var(--border-color)'
  },
  tabBtn: {
    padding: '4px 10px',
    borderRadius: '8px',
    color: 'var(--text-secondary)',
    fontSize: '11px',
    fontWeight: 600,
    background: 'none',
    border: 'none',
    cursor: 'pointer'
  },
  tabActive: {
    padding: '4px 10px',
    borderRadius: '8px',
    backgroundColor: 'var(--primary-teal)',
    color: '#041820',
    fontSize: '11px',
    fontWeight: 800,
    border: 'none',
    cursor: 'pointer'
  },
  selectFilter: {
    padding: '6px 10px',
    borderRadius: '8px',
    fontSize: '12px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontWeight: 600,
    outline: 'none'
  },
  statBox: (bg: string, border: string) => ({
    backgroundColor: 'var(--bg-surface-2)',
    background: `linear-gradient(135deg, var(--bg-surface-2) 0%, ${bg} 100%)`,
    border: `1px solid ${border}`,
    borderRadius: '12px',
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center'
  }),
  statVal: {
    fontSize: '20px',
    fontWeight: 800,
    color: 'var(--primary-teal)'
  },
  statLbl: {
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    marginTop: '2px',
    textAlign: 'center'
  },
  table: {
    width: '100%',
    minWidth: '850px',
    borderCollapse: 'collapse',
    fontSize: '12px',
    textAlign: 'left',
    whiteSpace: 'nowrap'
  },
  th: {
    padding: '10px 12px',
    borderBottom: '2px solid var(--border-color)',
    color: 'var(--text-muted)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap'
  },
  tr: {
    borderBottom: '1px solid var(--border-color)'
  },
  td: {
    padding: '10px 12px',
    color: 'var(--text-primary)',
    fontSize: '12px',
    whiteSpace: 'nowrap'
  },
  logTabBtn: (active: boolean) => ({
    padding: '7px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: active ? 'var(--primary-teal)' : 'var(--bg-surface-2)',
    color: active ? '#041820' : 'var(--text-secondary)',
    border: active ? '1px solid var(--primary-teal)' : '1px solid var(--border-color)',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  })
};
