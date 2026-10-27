import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Info, LogOut } from 'lucide-react';
import { StatusPill } from '../../components/StatusPill';
import '../../styles/tokens.css';

export const OperatorProfile: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, logoutUser, showToast } = useApp();

  const handleLogout = async () => {
    await logoutUser();
    showToast('Logged out of UniFlow Ops', 'info');
    navigate('/login');
  };

  return (
    <div className="profile-desktop-grid">
      {/* Left Column: Hero Identity Card */}
      <div style={styles.profileHero}>
        <div style={styles.avatarBig}>
          <span>{currentUser?.avatarInitials || 'OP'}</span>
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 800, marginTop: '12px' }}>
          {currentUser?.name || 'Operator'}
        </h2>
        <div style={{ marginTop: '6px' }}>
          <StatusPill label={`${(currentUser?.role || 'operator').toUpperCase()} • ${currentUser?.lineId || 'Line 04'}`} variant="teal" />
        </div>

        <div style={{ marginTop: '20px', width: '100%', textAlign: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
          <span style={styles.menuDesc}>ID: {currentUser?.id || 'op-001'} • Username: @{currentUser?.username || 'operator'}</span>
        </div>

        {/* Logout Action */}
        <button className="btn-danger" onClick={handleLogout} style={{ marginTop: '24px', width: '100%' }}>
          <LogOut size={18} style={{ marginRight: '8px' }} /> Log Out
        </button>
      </div>

      {/* Right Column: Information */}
      <div className="profile-options-grid" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* About UniFlow Ops */}
        <div className="card" style={styles.menuCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={styles.iconCircle}>
              <Info size={18} color="var(--color-green)" />
            </div>
            <div>
              <span style={styles.menuTitle}>About UniFlow Ops</span>
              <span style={styles.menuDesc}>Version 5.0 • Software developed by Innovus</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  profileHero: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '20px',
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center'
  },
  avatarBig: {
    width: '68px',
    height: '68px',
    borderRadius: '50%',
    backgroundColor: 'var(--bg-surface-2)',
    border: '2px solid var(--primary-teal)',
    color: 'var(--primary-teal)',
    fontWeight: 800,
    fontSize: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  menuCard: {
    backgroundColor: 'var(--bg-surface-1)',
    margin: 0,
    padding: '14px'
  },
  iconCircle: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    backgroundColor: 'var(--bg-app)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  menuTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    display: 'block'
  },
  menuDesc: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    display: 'block',
    marginTop: '2px'
  },
  langSelect: {
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '12px',
    padding: '4px 8px',
    outline: 'none'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '16px'
  },
  modalContent: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '24px',
    padding: '20px',
    width: '100%',
    maxWidth: '340px'
  }
};
