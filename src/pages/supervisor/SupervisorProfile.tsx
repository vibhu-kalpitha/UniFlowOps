import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { UserRole } from '../../types';
import { User, Key, Globe, Info, LogOut, Shield, ChevronRight, X } from 'lucide-react';
import { StatusPill } from '../../components/StatusPill';
import '../../styles/tokens.css';

export const SupervisorProfile: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, logoutUser, showToast } = useApp();

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const handleLogout = async () => {
    await logoutUser();
    showToast('Logged out of UniFlow Ops', 'info');
    navigate('/login');
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) {
      showToast('Please fill all password fields', 'warning');
      return;
    }
    showToast('Password changed successfully!', 'success');
    setShowPasswordModal(false);
    setOldPassword('');
    setNewPassword('');
  };

  return (
    <div className="profile-desktop-grid">
      {/* Left Column: Hero */}
      <div style={styles.profileHero}>
        <div style={styles.avatarBig}>
          <span>{currentUser?.avatarInitials || 'SUP'}</span>
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 800, marginTop: '12px' }}>
          {currentUser?.name || 'Supervisor'}
        </h2>
        <div style={{ marginTop: '6px' }}>
          <StatusPill label="SUPERVISOR • LINE 04 & 02" variant="teal" />
        </div>

        <div style={{ marginTop: '20px', width: '100%', textAlign: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
          <span style={styles.menuDesc}>ID: {currentUser?.id || 'sup-001'} • Username: @{currentUser?.username || 'supervisor'}</span>
        </div>

        {/* Logout */}
        <button className="btn-danger" onClick={handleLogout} style={{ marginTop: '24px', width: '100%' }}>
          <LogOut size={18} style={{ marginRight: '8px' }} /> Log Out
        </button>
      </div>

      {/* Right Column: Options */}
      <div className="profile-options-grid" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Change Password (FOR SUPERVISOR) */}
        <div
          className="card"
          style={{ ...styles.menuCard, cursor: 'pointer' }}
          onClick={() => setShowPasswordModal(true)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
            <div style={styles.iconCircle}>
              <Key size={18} color="var(--primary-teal)" />
            </div>
            <div style={{ flex: 1 }}>
              <span style={styles.menuTitle}>Change Password</span>
              <span style={styles.menuDesc}>Update supervisor login security credentials</span>
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

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Change Password</h3>
              <button style={{ background: 'none', border: 'none' }} onClick={() => setShowPasswordModal(false)}>
                <X size={20} color="var(--text-secondary)" />
              </button>
            </div>

            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={styles.label}>Current Password</label>
                <input
                  type="password"
                  className="input-field"
                  value={oldPassword}
                  onChange={e => setOldPassword(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={styles.label}>New Password</label>
                <input
                  type="password"
                  className="input-field"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: '10px' }}>
                Update Password
              </button>
            </form>
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
  label: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    marginBottom: '4px',
    display: 'block'
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
