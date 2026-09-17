import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { PlusCircle, Clock, AlertTriangle, ChevronRight, CheckCircle2, FileText, Users } from 'lucide-react';
import '../../styles/tokens.css';

export const SupervisorHome: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, productionOrders } = useApp();

  const currentPos = productionOrders.filter(p => p.status === 'Current');
  const totalSos = currentPos.reduce((sum, p) => sum + p.salesOrders.length, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Supervisor Header */}
      <div style={styles.headerRow}>
        <div>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Welcome, Supervisor</span>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
            {currentUser.name} 👨‍💼
          </h2>
          <span style={{ fontSize: '12px', color: 'var(--primary-teal)', fontWeight: 600 }}>
            Assigned: Line 04 & Line 02
          </span>
        </div>
      </div>

      {/* Quick Stats Banner */}
      <div className="grid-4-desktop" style={styles.statsGrid}>
        <div style={styles.statCard}>
          <span style={styles.statNum}>{currentPos.length}</span>
          <span style={styles.statLabel}>Active POs</span>
        </div>
        <div style={styles.statCard}>
          <span style={{ ...styles.statNum, color: 'var(--color-blue)' }}>{totalSos}</span>
          <span style={styles.statLabel}>Sales Orders</span>
        </div>
        <div style={styles.statCard}>
          <span style={{ ...styles.statNum, color: 'var(--color-green)' }}>3,120</span>
          <span style={styles.statLabel}>Processed Today</span>
        </div>
        <div style={styles.statCard}>
          <span style={{ ...styles.statNum, color: 'var(--color-purple)' }}>76%</span>
          <span style={styles.statLabel}>Target Progress</span>
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div>
        <h4 style={styles.sectionTitle}>Supervisor Actions</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <button
            style={styles.actionBtnPrimary}
            onClick={() => navigate('/supervisor/production-orders/new/style')}
          >
            <PlusCircle size={22} color="#041820" />
            <span>Create Style</span>
          </button>

          <button
            style={styles.actionBtnSecondary}
            onClick={() => navigate('/supervisor/shifts')}
          >
            <Clock size={22} color="var(--primary-teal)" />
            <span>Manage Shifts</span>
          </button>
        </div>
      </div>

      {/* Needs Attention Card */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'rgba(243, 168, 51, 0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <AlertTriangle size={18} color="var(--color-amber)" />
          <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-amber)' }}>Needs Attention</h4>
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <p>• Line 04 Shift Handover due at 18:00 (Chamika Silva → Kavindu Perera)</p>
          <p>• SO-77201 Box BX-000218 requires final AQL review</p>
        </div>
      </div>

      {/* Current Orders Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h4 style={styles.sectionTitle}>Current Production Orders</h4>
          <button
            style={{ fontSize: '12px', color: 'var(--primary-teal)', fontWeight: 700 }}
            onClick={() => navigate('/supervisor/orders')}
          >
            View All
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {currentPos.map(po => {
            const totalQty = po.salesOrders.reduce((sum, s) => sum + s.quantity, 0);
            const packedQty = po.salesOrders.reduce((sum, s) => sum + s.progress.packed, 0);

            return (
              <div
                key={po.id}
                className="card"
                style={{ backgroundColor: 'var(--bg-surface-1)', cursor: 'pointer', margin: 0 }}
                onClick={() => navigate('/supervisor/orders')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {po.id}
                  </span>
                  <StatusPill label={po.customer} variant="teal" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  <span>Map PO: {po.mapPo}</span>
                  <span>{po.salesOrders.length} Sales Orders</span>
                </div>
                <div style={{ marginTop: '10px' }}>
                  <ProgressBar current={packedQty} total={totalQty} height={6} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px'
  },
  statCard: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '14px',
    padding: '12px',
    textAlign: 'center'
  },
  statNum: {
    fontSize: '22px',
    fontWeight: 800,
    color: 'var(--primary-teal)',
    display: 'block'
  },
  statLabel: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    marginTop: '2px',
    display: 'block'
  },
  sectionTitle: {
    fontSize: '15px',
    fontWeight: 700,
    marginBottom: '10px',
    color: 'var(--text-primary)'
  },
  actionBtnPrimary: {
    height: '52px',
    borderRadius: '14px',
    background: 'linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-light) 100%)',
    color: '#041820',
    fontWeight: 800,
    fontSize: '15px',
    gap: '8px'
  },
  actionBtnSecondary: {
    height: '52px',
    borderRadius: '14px',
    backgroundColor: 'var(--bg-surface-1)',
    border: '1.5px solid var(--primary-teal)',
    color: 'var(--text-primary)',
    fontWeight: 700,
    fontSize: '15px',
    gap: '8px'
  }
};
