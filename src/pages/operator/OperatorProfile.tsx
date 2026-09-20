import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { UserRole } from '../../types';
import { User, Globe, Info, LogOut, Shield, ChevronRight } from 'lucide-react';
import { StatusPill } from '../../components/StatusPill';
import '../../styles/tokens.css';

export const OperatorProfile: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, currentRole, setRole, showToast } = useApp();

  const [language, setLanguage] = useState('English');
  const [showRoleModal, setShowRoleModal] = useState(false);

  const handleLogout = () => {
    showToast('Logged out of UniFlow Ops', 'info');
    navigate('/login');
  };

  const handleSwitchRole = (role: UserRole) => {
    setRole(role);
    setShowRoleModal(false);
    showToast(`Switched role to ${role.toUpperCase()}`, 'success');
    if (role === 'operator') navigate('/operator/home');
    else if (role === 'supervisor') navigate('/supervisor/home');
    else navigate('/admin/dashboard');
  };

  return (
    <div className="profile-desktop-grid">
      {/* Left Column: Hero Identity Card */}
      <div style={styles.profileHero}>
        <div style={styles.avatarBig}>
          <span>{currentUser.avatarInitials}</span>
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 800, marginTop: '12px' }}>
          {currentUser.name}
        </h2>
        <div style={{ marginTop: '6px' }}>
          <StatusPill label={`${currentUser.role.toUpperCase()} • ${currentUser.lineId || 'Line 04'}`} variant="teal" />
        </div>

        <div style={{ marginTop: '20px', width: '100%', textAlign: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
          <span style={styles.menuDesc}>ID: {currentUser.id} • Username: @{currentUser.username}</span>
        </div>

        {/* Logout Action */}
        <button className="btn-danger" onClick={handleLogout} style={{ marginTop: '24px', width: '100%' }}>
          <LogOut size={18} style={{ marginRight: '8px' }} /> Log Out
        </button>
      </div>

      {/* Right Column: Options & Diagnostic Tools */}
      <div className="profile-options-grid" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* My Details */}
        <div className="card" style={styles.menuCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={styles.iconCircle}>
              <User size={18} color="var(--primary-teal)" />
            </div>
            <div>
              <span style={styles.menuTitle}>My Account Details</span>
              <span style={styles.menuDesc}>ID: {currentUser.id} • Username: @{currentUser.username}</span>
            </div>
          </div>
        </div>

        {/* Language */}
        <div className="card" style={styles.menuCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={styles.iconCircle}>
              <Globe size={18} color="var(--color-blue)" />
            </div>
            <div style={{ flex: 1 }}>
              <span style={styles.menuTitle}>Language Preference</span>
              <span style={styles.menuDesc}>Select display language</span>
            </div>
            <select
              style={styles.langSelect}
              value={language}
              onChange={e => {
                setLanguage(e.target.value);
                showToast(`Language set to ${e.target.value}`, 'info');
              }}
            >
              <option value="English">English</option>
              <option value="Sinhala">Sinhala (සිංහල)</option>
              <option value="Tamil">Tamil (தமிழ்)</option>
            </select>
          </div>
        </div>

        {/* Test Scanner Diagnostic */}
        <div className="card" style={{ ...styles.menuCard, cursor: 'pointer' }} onClick={() => navigate('/test-scanner')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
            <div style={styles.iconCircle}>
              <Globe size={18} color="var(--primary-teal)" />
            </div>
            <div style={{ flex: 1 }}>
              <span style={styles.menuTitle}>Test Scanner Diagnostic</span>
              <span style={styles.menuDesc}>Inspect raw keystrokes & timing</span>
            </div>
            <ChevronRight size={18} color="var(--text-secondary)" />
          </div>
        </div>

        {/* Demo Role Switcher */}
        <div className="card" style={{ ...styles.menuCard, cursor: 'pointer' }} onClick={() => setShowRoleModal(true)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
            <div style={styles.iconCircle}>
              <Shield size={18} color="var(--color-purple)" />
            </div>
            <div style={{ flex: 1 }}>
              <span style={styles.menuTitle}>Switch Demo Role</span>
              <span style={styles.menuDesc}>Current active: {currentRole.toUpperCase()}</span>
            </div>
            <ChevronRight size={18} color="var(--text-secondary)" />
          </div>
        </div>

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

      {/* Switch Role Modal */}
      {showRoleModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '12px' }}>Switch Role Mode</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Select role to test workflow views:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button className="btn-secondary" onClick={() => handleSwitchRole('operator')}>
                Operator (Chamika Silva)
              </button>
              <button className="btn-secondary" onClick={() => handleSwitchRole('supervisor')}>
                Supervisor (Nimal Perera)
              </button>
              <button className="btn-secondary" onClick={() => handleSwitchRole('admin')}>
                Admin (Factory Administrator)
              </button>
              <button className="btn-primary" onClick={() => setShowRoleModal(false)} style={{ marginTop: '6px' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
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
