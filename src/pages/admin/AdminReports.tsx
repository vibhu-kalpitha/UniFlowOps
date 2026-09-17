import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Download, BarChart2, TrendingUp, Filter } from 'lucide-react';
import { apiFetch } from '../../services/api';
import '../../styles/tokens.css';

export const AdminReports: React.FC = () => {
  const { showToast } = useApp();
  const [timeRange, setTimeRange] = useState<'Today' | 'Week' | 'Month'>('Today');
  const [reportData, setReportData] = useState<any>(null);

  useEffect(() => {
    apiFetch(`/api/reports/production?range=${timeRange.toLowerCase()}`)
      .then(res => setReportData(res))
      .catch(() => {});
  }, [timeRange]);

  const handleExport = () => {
    showToast(`Exported production report (${timeRange}) as CSV.`, 'success');
  };

  const lineBreakdown = reportData?.lineBreakdown || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Production Reports</h2>
        <button
          className="btn-secondary"
          style={{ height: '36px', padding: '0 12px', fontSize: '12px', gap: '6px', width: 'auto' }}
          onClick={handleExport}
        >
          <Download size={16} color="var(--primary-teal)" /> Export
        </button>
      </div>

      {/* Time Range Selector */}
      <div style={styles.tabBar}>
        {(['Today', 'Week', 'Month'] as const).map(tab => (
          <button
            key={tab}
            style={timeRange === tab ? styles.tabActive : styles.tabBtn}
            onClick={() => setTimeRange(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Velocity Visualizer */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 style={{ fontSize: '15px', fontWeight: 700 }}>Production Velocity ({timeRange})</h4>
          <span style={{ fontSize: '12px', color: 'var(--primary-teal)', fontWeight: 700 }}>
            {reportData?.velocityVariance || 'Live Database Metric'}
          </span>
        </div>

        {/* Bar chart representation */}
        <div style={styles.barChartRow}>
          <div style={styles.barCol}>
            <div style={{ ...styles.barFill, height: '65%' }} />
            <span style={styles.barLabel}>08:00</span>
          </div>
          <div style={styles.barCol}>
            <div style={{ ...styles.barFill, height: '85%' }} />
            <span style={styles.barLabel}>10:00</span>
          </div>
          <div style={styles.barCol}>
            <div style={{ ...styles.barFill, height: '95%', backgroundColor: 'var(--primary-teal-light)' }} />
            <span style={styles.barLabel}>12:00</span>
          </div>
          <div style={styles.barCol}>
            <div style={{ ...styles.barFill, height: '70%' }} />
            <span style={styles.barLabel}>14:00</span>
          </div>
          <div style={styles.barCol}>
            <div style={{ ...styles.barFill, height: '90%' }} />
            <span style={styles.barLabel}>16:00</span>
          </div>
          <div style={styles.barCol}>
            <div style={{ ...styles.barFill, height: '40%' }} />
            <span style={styles.barLabel}>18:00</span>
          </div>
        </div>
      </div>

      {/* Line Performance Table */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0 }}>
        <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '10px' }}>Line Performance Breakdown</h4>

        <table style={styles.table}>
          <thead>
            <tr style={styles.thRow}>
              <th style={styles.th}>Line ID</th>
              <th style={styles.th}>Packed</th>
              <th style={styles.th}>QC Pass</th>
              <th style={styles.th}>Efficiency</th>
            </tr>
          </thead>
          <tbody>
            {lineBreakdown.length === 0 ? (
              <tr style={styles.tr}>
                <td colSpan={4} style={{ ...styles.td, textAlign: 'center', color: 'var(--text-muted)' }}>
                  No production line records found in database.
                </td>
              </tr>
            ) : (
              lineBreakdown.map((lb: any, idx: number) => (
                <tr key={idx} style={styles.tr}>
                  <td style={styles.td}>{lb.lineId}</td>
                  <td style={styles.td}>{lb.packed}</td>
                  <td style={styles.td}>{lb.qcPassRate}</td>
                  <td style={{ ...styles.td, color: 'var(--color-green)', fontWeight: 700 }}>{lb.efficiency}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  tabBar: {
    display: 'flex',
    backgroundColor: 'var(--bg-surface-1)',
    borderRadius: '12px',
    padding: '4px',
    border: '1px solid var(--border-color)'
  },
  tabBtn: {
    flex: 1,
    height: '34px',
    borderRadius: '8px',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: 600
  },
  tabActive: {
    flex: 1,
    height: '34px',
    borderRadius: '8px',
    backgroundColor: 'var(--primary-teal)',
    color: '#041820',
    fontSize: '12px',
    fontWeight: 700
  },
  barChartRow: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: '140px',
    paddingTop: '16px',
    borderBottom: '1px solid var(--border-color)'
  },
  barCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
    width: '32px'
  },
  barFill: {
    width: '18px',
    backgroundColor: 'var(--primary-teal)',
    borderRadius: '4px 4px 0 0',
    transition: 'height 0.4s ease-out'
  },
  barLabel: {
    fontSize: '10px',
    color: 'var(--text-secondary)',
    marginTop: '6px'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  thRow: {
    borderBottom: '1px solid var(--border-color)'
  },
  th: {
    textAlign: 'left',
    padding: '8px 4px',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-muted)'
  },
  tr: {
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
  },
  td: {
    padding: '10px 4px',
    fontSize: '13px',
    color: 'var(--text-primary)'
  }
};
