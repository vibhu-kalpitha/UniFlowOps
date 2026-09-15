import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { BarChart, TrendingUp, AlertTriangle, ShieldCheck, Users, Package, FileText, Settings } from 'lucide-react';
import '../../styles/tokens.css';

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useApp();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Admin Header */}
      <div>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Good Morning,</span>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
          Factory Control Admin 🏢
        </h2>
        <span style={{ fontSize: '12px', color: 'var(--primary-teal)', fontWeight: 600 }}>
          Live All-Factory Overview • UniFlow Ops
        </span>
      </div>

      {/* 4 KPI Cards */}
      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}>
          <span style={styles.kpiVal}>12</span>
          <span style={styles.kpiLbl}>Current POs</span>
        </div>
        <div style={styles.kpiCard}>
          <span style={{ ...styles.kpiVal, color: 'var(--color-blue)' }}>37</span>
          <span style={styles.kpiLbl}>Sales Orders</span>
        </div>
        <div style={styles.kpiCard}>
          <span style={{ ...styles.kpiVal, color: 'var(--color-green)' }}>8,426</span>
          <span style={styles.kpiLbl}>Items Processed</span>
        </div>
        <div style={styles.kpiCard}>
          <span style={{ ...styles.kpiVal, color: 'var(--color-purple)' }}>7,954</span>
          <span style={styles.kpiLbl}>Packed Units</span>
        </div>
      </div>

      {/* Quality Rates Card */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 style={{ fontSize: '15px', fontWeight: 700 }}>Quality Rates</h4>
          <span style={{ fontSize: '11px', color: 'var(--color-green)', fontWeight: 700 }}>● Operational High</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
              <span>QC Inspection Pass Rate</span>
              <span style={{ fontWeight: 800, color: 'var(--color-green)' }}>98.4%</span>
            </div>
            <ProgressBar current={984} total={1000} height={8} color="var(--color-green)" />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
              <span>Function Test Pass Rate</span>
              <span style={{ fontWeight: 800, color: 'var(--color-blue)' }}>97.9%</span>
            </div>
            <ProgressBar current={979} total={1000} height={8} color="var(--color-blue)" />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
              <span>AQL Audit Pass Rate</span>
              <span style={{ fontWeight: 800, color: 'var(--color-purple)' }}>99.1%</span>
            </div>
            <ProgressBar current={991} total={1000} height={8} color="var(--color-purple)" />
          </div>
        </div>
      </div>

      {/* Exceptions Breakdown Card */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'rgba(239, 92, 92, 0.3)', margin: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <AlertTriangle size={18} color="var(--color-red)" />
          <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-red)' }}>Exceptions & Pending</h4>
        </div>

        <div style={styles.excGrid}>
          <div style={styles.excItem}>
            <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-red)' }}>24</span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>QC Failed</span>
          </div>
          <div style={styles.excItem}>
            <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-amber)' }}>17</span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Test Failed</span>
          </div>
          <div style={styles.excItem}>
            <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-purple)' }}>6</span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>AQL Failed</span>
          </div>
          <div style={styles.excItem}>
            <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-blue)' }}>472</span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Pending Pack</span>
          </div>
        </div>
      </div>

      {/* Attention Required List */}
      <div>
        <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '10px' }}>Attention Required</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={styles.attRow}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Line 01 Production Velocity Low (-12%)
            </span>
            <button style={styles.viewBtn} onClick={() => navigate('/admin/reports')}>
              Inspect
            </button>
          </div>
          <div style={styles.attRow}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Bluetooth Scanner #04 Disconnected Twice
            </span>
            <button style={styles.viewBtn} onClick={() => navigate('/admin/more')}>
              Devices
            </button>
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
