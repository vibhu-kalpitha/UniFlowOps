import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Download, FileSpreadsheet, Printer, Filter, RefreshCw, CheckCircle2, AlertTriangle, Package, Layers, ArrowLeftRight, FileText } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import '../../styles/tokens.css';

export const AdminReports: React.FC = () => {
  const { showToast } = useApp();
  const [timeRange, setTimeRange] = useState<'Today' | 'Week' | 'Month' | 'All'>('Today');
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedStyleFilter, setSelectedStyleFilter] = useState<string>('');
  const [selectedPoFilter, setSelectedPoFilter] = useState<string>('');

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/reports/production?range=${timeRange.toLowerCase()}`);
      setReportData(res);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch production reports', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [timeRange]);

  const rawPoBreakdown: any[] = reportData?.poBreakdown || [];
  const availableStyles: string[] = Array.from(new Set(rawPoBreakdown.map(p => p.styleName).filter(Boolean)));
  const availablePos: string[] = Array.from(new Set(rawPoBreakdown.map(p => p.poNumber).filter(Boolean)));

  const filteredOrders = rawPoBreakdown.filter(p => {
    if (selectedStyleFilter && p.styleName !== selectedStyleFilter) return false;
    if (selectedPoFilter && p.poNumber !== selectedPoFilter && p.poId !== selectedPoFilter) return false;
    return true;
  });

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
            Executive Operations & Production Reports 📊
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Descriptive Style & PO analysis covering Quality Inspection (QC), Carton Packing, AQL Sample Audits, and Box Transfers.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} className="no-print">
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
          <div style={{ overflowX: 'auto' }}>
            <table className="responsive-table" style={styles.table}>
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
                {filteredOrders.map((p: any) => (
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
          </div>
        )}
      </div>
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
    borderCollapse: 'collapse',
    fontSize: '12px',
    textAlign: 'left'
  },
  th: {
    padding: '10px 10px',
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
    padding: '10px 10px',
    color: 'var(--text-primary)',
    fontSize: '12px'
  }
};
