import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { CheckCircle2, Package, Search, ArrowLeftRight, Wifi, WifiOff } from 'lucide-react';
import { ScannerStatus } from '../../components/ScannerStatus';
import '../../styles/tokens.css';

export const ScanCenter: React.FC = () => {
  const navigate = useNavigate();
  const { scannerConnected, setScannerConnected } = useApp();

  return (
    <div style={styles.container}>
      <div style={styles.headerArea}>
        <h2 style={styles.title}>Scan Center</h2>
        <p style={styles.subtitle}>Choose operation to start scanning</p>
      </div>

      {/* 4 Operations Grid */}
      <div style={styles.grid}>
        {/* QC Test */}
        <button style={styles.tile} onClick={() => navigate('/operator/qc')}>
          <div style={{ ...styles.iconWrap, backgroundColor: 'rgba(24, 184, 121, 0.15)' }}>
            <CheckCircle2 size={28} color="var(--color-green)" />
          </div>
          <span style={styles.tileTitle}>QC Test</span>
          <span style={styles.tileDesc}>Scan item and record QC & Test result</span>
        </button>

        {/* Packing */}
        <button style={styles.tile} onClick={() => navigate('/operator/packing')}>
          <div style={{ ...styles.iconWrap, backgroundColor: 'rgba(67, 133, 245, 0.15)' }}>
            <Package size={28} color="var(--color-blue)" />
          </div>
          <span style={styles.tileTitle}>Packing</span>
          <span style={styles.tileDesc}>Scan box and pack items</span>
        </button>

        {/* AQL Checker */}
        <button style={styles.tile} onClick={() => navigate('/operator/aql/box')}>
          <div style={{ ...styles.iconWrap, backgroundColor: 'rgba(139, 92, 246, 0.15)' }}>
            <Search size={28} color="var(--color-purple)" />
          </div>
          <span style={styles.tileTitle}>AQL Checker</span>
          <span style={styles.tileDesc}>Scan box and sample items</span>
        </button>

        {/* Box Transfer */}
        <button style={styles.tile} onClick={() => navigate('/operator/transfer')}>
          <div style={{ ...styles.iconWrap, backgroundColor: 'rgba(245, 158, 66, 0.15)' }}>
            <ArrowLeftRight size={28} color="var(--color-orange)" />
          </div>
          <span style={styles.tileTitle}>Box Transfer</span>
          <span style={styles.tileDesc}>Move items between boxes</span>
        </button>
      </div>

      {/* Scanner Status Bar */}
      <ScannerStatus showConnectButton={true} style={{ marginTop: '12px' }} />

      {/* Cancel Button */}
      <button className="btn-secondary" onClick={() => navigate(-1)} style={{ marginTop: 'auto' }}>
        Cancel
      </button>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    paddingBottom: '10px'
  },
  headerArea: {
    textAlign: 'center',
    marginTop: '10px'
  },
  title: {
    fontSize: '24px',
    fontWeight: 800,
    color: 'var(--text-primary)'
  },
  subtitle: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    marginTop: '4px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '14px'
  },
  tile: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '20px',
    padding: '20px 14px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center'
  },
  iconWrap: {
    width: '52px',
    height: '52px',
    borderRadius: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '12px'
  },
  tileTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: '4px'
  },
  tileDesc: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    lineHeight: '1.3'
  },
  statusBox: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '14px',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    cursor: 'pointer'
  }
};
