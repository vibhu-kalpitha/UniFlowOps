import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { BarChart, TrendingUp, AlertTriangle, ShieldCheck, Users, Package, FileText, Settings } from 'lucide-react';
import { apiFetch } from '../../services/api';
import '../../styles/tokens.css';

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useApp();

  const [data, setData] = useState<any>(null);

  useEffect(() => {
    apiFetch('/api/dashboard/admin')
      .then(res => setData(res))
      .catch(() => {});
  }, []);

  const kpis = data?.kpis || { currentPos: 0, salesOrders: 0, itemsProcessed: 0, packedUnits: 0 };
  const qualityRates = data?.qualityRates || { qcPassRate: 100, testPassRate: 100, aqlPassRate: 100 };
  const exceptions = data?.exceptions || { qcFailed: 0, testFailed: 0, aqlFailed: 0, pendingPack: 0 };

  return (
    <div className="desktop-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Admin Header */}
      <div>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Good Morning,</span>
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>
          Factory Control Admin 🏢
        </h2>
        <span style={{ fontSize: '12px', color: 'var(--primary-teal)', fontWeight: 600 }}>
          Live Database Overview • UniFlow Ops Enterprise
        </span>
      </div>

      {/* 4 Top KPI Cards */}
      <div className="admin-kpi-4col" style={styles.kpiGrid}>
        <div style={styles.kpiCard}>
          <span style={styles.kpiVal}>{kpis.currentPos}</span>
          <span style={styles.kpiLbl}>Current POs</span>
        </div>
        <div style={styles.kpiCard}>
          <span style={{ ...styles.kpiVal, color: 'var(--color-blue)' }}>{kpis.salesOrders}</span>
          <span style={styles.kpiLbl}>Sales Orders</span>
        </div>
        <div style={styles.kpiCard}>
          <span style={{ ...styles.kpiVal, color: 'var(--color-green)' }}>{kpis.itemsProcessed}</span>
          <span style={styles.kpiLbl}>Items Processed</span>
        </div>
        <div style={styles.kpiCard}>
          <span style={{ ...styles.kpiVal, color: 'var(--color-purple)' }}>{kpis.packedUnits}</span>
          <span style={styles.kpiLbl}>Packed Units</span>
        </div>
      </div>

      {/* 12-Column Desktop Grid Layout */}
      <div className="desktop-grid-12">
        {/* Main Section (8 Cols on Desktop) */}
        <div className="desktop-col-8" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Quality Rates Card */}
          <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h4 style={{ fontSize: '16px', fontWeight: 800 }}>Factory Quality Pass Rates</h4>
              <span style={{ fontSize: '11px', color: 'var(--color-green)', fontWeight: 700 }}>● Live DB Metrics</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>QC Inspection Pass Rate</span>
                  <span style={{ fontWeight: 800, color: 'var(--color-green)' }}>{qualityRates.qcPassRate}%</span>
                </div>
                <ProgressBar current={Math.round(qualityRates.qcPassRate * 10)} total={1000} height={8} color="var(--color-green)" />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>Function Test Pass Rate</span>
                  <span style={{ fontWeight: 800, color: 'var(--color-blue)' }}>{qualityRates.testPassRate}%</span>
                </div>
                <ProgressBar current={Math.round(qualityRates.testPassRate * 10)} total={1000} height={8} color="var(--color-blue)" />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>AQL Audit Pass Rate</span>
                  <span style={{ fontWeight: 800, color: 'var(--color-purple)' }}>{qualityRates.aqlPassRate}%</span>
                </div>
                <ProgressBar current={Math.round(qualityRates.aqlPassRate * 10)} total={1000} height={8} color="var(--color-purple)" />
              </div>
            </div>
          </div>

          {/* Attention Required List */}
          <div>
            <h4 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '12px' }}>Attention Required</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={styles.attRow}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Line 01 Production Velocity Low (-12%)
                </span>
                <button style={styles.viewBtn} onClick={() => navigate('/admin/reports')}>
                  Inspect Report
                </button>
              </div>
              <div style={styles.attRow}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Bluetooth Scanner #04 Disconnected Twice
                </span>
                <button style={styles.viewBtn} onClick={() => navigate('/admin/more')}>
                  Device Settings
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Section (4 Cols on Desktop) */}
        <div className="desktop-col-4" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Exceptions Breakdown Card */}
          <div className="card" style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'rgba(239, 92, 92, 0.3)', margin: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <AlertTriangle size={18} color="var(--color-red)" />
              <h4 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-red)' }}>Exceptions & Pending</h4>
            </div>

            <div style={styles.excGrid}>
              <div style={styles.excItem}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-red)' }}>{exceptions.qcFailed}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>QC Failed</span>
              </div>
              <div style={styles.excItem}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-amber)' }}>{exceptions.testFailed}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Test Failed</span>
              </div>
              <div style={styles.excItem}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-purple)' }}>{exceptions.aqlFailed}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>AQL Failed</span>
              </div>
              <div style={styles.excItem}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-blue)' }}>{exceptions.pendingPack}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Pending Pack</span>
              </div>
            </div>
          </div>

          {/* Admin Management Shortcuts */}
          <div className="card" style={{ backgroundColor: '#0B242D', border: '1px solid #1E4650' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-teal)', letterSpacing: '0.05em' }}>
              ADMIN CONTROLS
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
              <button
                onClick={() => navigate('/admin/users')}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', backgroundColor: '#102F39', border: '1px solid #1E4650', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 700, textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span>👥 Shift Members & Operators</span>
                <span>→</span>
              </button>
              <button
                onClick={() => navigate('/admin/reports')}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', backgroundColor: '#102F39', border: '1px solid #1E4650', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 700, textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span>📊 Production & Quality Reports</span>
                <span>→</span>
              </button>
              <button
                onClick={() => navigate('/admin/orders')}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', backgroundColor: '#102F39', border: '1px solid #1E4650', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 700, textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span>📦 Manage Production Orders</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px'
  },
  kpiCard: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '14px',
    padding: '12px',
    textAlign: 'center'
  },
  kpiVal: {
    fontSize: '22px',
    fontWeight: 800,
    color: 'var(--primary-teal)',
    display: 'block'
  },
  kpiLbl: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    marginTop: '2px',
    display: 'block'
  },
  excGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 1fr',
    gap: '6px',
    textAlign: 'center'
  },
  excItem: {
    backgroundColor: 'var(--bg-surface-1)',
    borderRadius: '10px',
    padding: '8px 4px'
  },
  attRow: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '10px 14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  viewBtn: {
    padding: '4px 10px',
    borderRadius: '6px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    color: 'var(--primary-teal)',
    fontSize: '12px',
    fontWeight: 700
  }
};
