import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { CheckCircle2, Package, Search, ArrowLeftRight, ArrowRight, ShieldCheck, Lock } from 'lucide-react';
import '../../styles/tokens.css';

export const OperatorHome: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, activeJob, qcPassedCountToday, packedCountToday } = useApp();

  const po = activeJob?.productionOrder;
  const so = activeJob?.salesOrder;

  const isJobSelected = !!activeJob;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Greeting Header */}
      <div style={styles.greetingRow}>
        <div>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Good Morning,</span>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {currentUser.name} 👷
          </h2>
          <span style={{ fontSize: '12px', color: 'var(--primary-teal)', fontWeight: 600 }}>
            {currentUser.role.toUpperCase()} • {currentUser.lineId}
          </span>
        </div>
      </div>

      {/* Job Selection Status Pill */}
      <div
        style={{
          ...styles.statusBanner,
          backgroundColor: isJobSelected ? 'rgba(24, 184, 121, 0.12)' : 'rgba(239, 92, 92, 0.12)',
          borderColor: isJobSelected ? 'var(--color-green)' : 'var(--color-red)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} color={isJobSelected ? 'var(--color-green)' : 'var(--color-red)'} />
          <span style={{ fontSize: '13px', fontWeight: 700, color: isJobSelected ? 'var(--color-green)' : 'var(--color-red)' }}>
            {isJobSelected ? 'Job selected — scanning is enabled' : 'No job selected — scanning disabled'}
          </span>
        </div>
        <button
          style={styles.changeBtn}
          onClick={() => navigate('/operator/assignments')}
        >
          Change
        </button>
      </div>

      {/* Current Production Order Card */}
      {po && so ? (
        <div className="card" style={styles.poCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={styles.cardSubTitle}>CURRENT PRODUCTION ORDER</span>
              <h3 style={styles.poNumber}>{po.id}</h3>
            </div>
            <StatusPill label={po.status} variant="teal" />
          </div>

          <div style={{ marginTop: '10px' }}>
            <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {po.customer} — {so.product}
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              <span>SO: {so.id} ({so.colour})</span>
              <span>Line: {so.lineId.replace('Line ', '')}</span>
            </div>
          </div>

          <div style={{ marginTop: '14px' }}>
            <ProgressBar current={so.progress.packed} total={so.quantity} height={10} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '6px', color: 'var(--text-secondary)' }}>
              <span>Packed: {so.progress.packed} / {so.quantity}</span>
              <span style={{ color: 'var(--primary-teal)', fontWeight: 700 }}>
                {Math.round((so.progress.packed / so.quantity) * 100)}% Complete
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '24px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No active production order selected</p>
          <button className="btn-primary" onClick={() => navigate('/operator/assignments')} style={{ marginTop: '12px' }}>
            Select Job Now
          </button>
        </div>
      )}

      {/* 4 Operation Action Tiles */}
      <div>
        <h4 style={styles.sectionHeader}>Operations</h4>
        <div style={styles.opsGrid}>
          {/* QC Test */}
          <button
            style={styles.opTileGreen}
            disabled={!isJobSelected}
            onClick={() => navigate('/operator/qc')}
          >
            <div style={styles.opIconGreen}>
              <CheckCircle2 size={26} color="var(--color-green)" />
            </div>
            <span style={styles.opTitle}>QC Test</span>
          </button>

          {/* Packing */}
          <button
            style={styles.opTileBlue}
            disabled={!isJobSelected}
            onClick={() => navigate('/operator/packing')}
          >
            <div style={styles.opIconBlue}>
              <Package size={26} color="var(--color-blue)" />
            </div>
            <span style={styles.opTitle}>Packing</span>
          </button>

          {/* AQL Checker */}
          <button
            style={styles.opTilePurple}
            disabled={!isJobSelected}
            onClick={() => navigate('/operator/aql/box')}
          >
            <div style={styles.opIconPurple}>
              <Search size={26} color="var(--color-purple)" />
            </div>
            <span style={styles.opTitle}>AQL Checker</span>
          </button>

          {/* Box Transfer */}
          <button
            style={styles.opTileOrange}
            disabled={!isJobSelected}
            onClick={() => navigate('/operator/transfer')}
          >
            <div style={styles.opIconOrange}>
              <ArrowLeftRight size={26} color="var(--color-orange)" />
            </div>
            <span style={styles.opTitle}>Box Transfer</span>
          </button>
        </div>
      </div>

      {/* Today's Progress Card */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 style={{ fontSize: '15px', fontWeight: 700 }}>Today's Progress</h4>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Real-time</span>
        </div>
        <div style={styles.progressRow}>
          <div style={styles.statCol}>
            <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-green)' }}>{qcPassedCountToday}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>QC Passed</span>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.statCol}>
            <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-blue)' }}>{packedCountToday}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Packed</span>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.statCol}>
            <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-red)' }}>6</span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Pending</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  greetingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  statusBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderRadius: '12px',
    border: '1px solid'
  },
  changeBtn: {
    padding: '4px 12px',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--text-primary)'
  },
  poCard: {
    backgroundColor: 'var(--bg-surface-2)',
    borderColor: 'var(--border-light)'
  },
  cardSubTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--primary-teal)',
    letterSpacing: '0.05em'
  },
  poNumber: {
    fontSize: '22px',
    fontWeight: 800,
    color: 'var(--text-primary)',
    marginTop: '2px'
  },
  sectionHeader: {
    fontSize: '15px',
    fontWeight: 700,
    marginBottom: '10px',
    color: 'var(--text-primary)'
  },
  opsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px'
  },
  opTileGreen: {
    height: '110px',
    borderRadius: '18px',
    backgroundColor: 'rgba(24, 184, 121, 0.08)',
    border: '1px solid rgba(24, 184, 121, 0.25)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px'
  },
  opIconGreen: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: 'rgba(24, 184, 121, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  opTileBlue: {
    height: '110px',
    borderRadius: '18px',
    backgroundColor: 'rgba(67, 133, 245, 0.08)',
    border: '1px solid rgba(67, 133, 245, 0.25)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px'
  },
  opIconBlue: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: 'rgba(67, 133, 245, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  opTilePurple: {
    height: '110px',
    borderRadius: '18px',
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    border: '1px solid rgba(139, 92, 246, 0.25)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px'
  },
  opIconPurple: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  opTileOrange: {
    height: '110px',
    borderRadius: '18px',
    backgroundColor: 'rgba(245, 158, 66, 0.08)',
    border: '1px solid rgba(245, 158, 66, 0.25)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px'
  },
  opIconOrange: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: 'rgba(245, 158, 66, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  opTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--text-primary)'
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: '8px 0'
  },
  statCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  statDivider: {
    width: '1px',
    height: '36px',
    backgroundColor: 'var(--border-color)'
  }
};
