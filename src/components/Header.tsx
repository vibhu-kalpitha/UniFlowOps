import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ArrowLeft, Bell } from 'lucide-react';
import '../styles/tokens.css';

export const Header: React.FC<{ title?: string }> = ({ title }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentRole, currentUser, alerts } = useApp();

  const unreadAlertsCount = alerts.filter(a => !a.read).length;

  const isRootPage = [
    '/operator/home',
    '/supervisor/home',
    '/admin/dashboard',
    '/login'
  ].includes(location.pathname);

  if (location.pathname === '/login') return null;

  const handleAlertClick = () => {
    if (currentRole === 'operator') navigate('/operator/alerts');
    else if (currentRole === 'supervisor') navigate('/supervisor/alerts');
    else navigate('/admin/alerts');
  };

  return (
    <header style={styles.header}>
      <div style={styles.leftGroup}>
        {!isRootPage && location.pathname !== '/login' && (
          <button style={styles.iconBtn} onClick={() => navigate(-1)} aria-label="Go Back">
            <ArrowLeft size={20} color="var(--text-primary)" />
          </button>
        )}
        <div style={styles.brandTitle}>
          {title ? (
            <span style={styles.pageTitle}>{title}</span>
          ) : (
            <div style={styles.brandGroup}>
              <div style={styles.logoBadge}>
                <span style={styles.logoIcon}>⚡</span>
              </div>
              <span style={styles.brandText}>UniFlow <span style={{ color: 'var(--primary-teal)' }}>Ops</span></span>
            </div>
          )}
        </div>
      </div>

      <div style={styles.rightGroup}>
        <button style={styles.bellBtn} onClick={handleAlertClick} aria-label="Notifications">
          <Bell size={20} color="var(--text-primary)" />
          {unreadAlertsCount > 0 && <span style={styles.badge}>{unreadAlertsCount}</span>}
        </button>

        <div style={styles.avatar}>
          <span>{currentUser.avatarInitials}</span>
        </div>
      </div>
    </header>
  );
};

const styles: Record<string, React.CSSProperties> = {
  header: {
    height: 'var(--header-height)',
    backgroundColor: 'var(--bg-header)',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    zIndex: 100,
    flexShrink: 0
  },
  leftGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  rightGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  iconBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  brandTitle: {
    display: 'flex',
    alignItems: 'center'
  },
  brandGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  logoBadge: {
    width: '26px',
    height: '26px',
    borderRadius: '6px',
    background: 'linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-dark) 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px'
  },
  logoIcon: {
    fontSize: '12px'
  },
  brandText: {
    fontSize: '17px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: 'var(--text-primary)'
  },
  pageTitle: {
    fontSize: '17px',
    fontWeight: 700,
    color: 'var(--text-primary)'
  },
  bellBtn: {
    position: 'relative',
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  badge: {
    position: 'absolute',
    top: '2px',
    right: '2px',
    minWidth: '16px',
    height: '16px',
    borderRadius: '8px',
    backgroundColor: 'var(--color-red)',
    color: '#fff',
    fontSize: '10px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px'
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1.5px solid var(--primary-teal)',
    color: 'var(--primary-teal)',
    fontWeight: 700,
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
};
