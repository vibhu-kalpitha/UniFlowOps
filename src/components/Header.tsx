import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ArrowLeft, Bell, Home, ClipboardList, ScanLine, User, BarChart, Package, Menu } from 'lucide-react';
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

  const getNavItems = () => {
    if (currentRole === 'operator') {
      return [
        { label: 'Home', path: '/operator/home', icon: Home },
        { label: 'Orders', path: '/operator/orders', icon: ClipboardList },
        { label: 'Scan', path: '/operator/scan', icon: ScanLine },
        { label: 'Alerts', path: '/operator/alerts', icon: Bell, badge: unreadAlertsCount },
        { label: 'Profile', path: '/operator/profile', icon: User }
      ];
    } else if (currentRole === 'supervisor') {
      return [
        { label: 'Home', path: '/supervisor/home', icon: Home },
        { label: 'Orders', path: '/supervisor/orders', icon: ClipboardList },
        { label: 'Alerts', path: '/supervisor/alerts', icon: Bell, badge: unreadAlertsCount },
        { label: 'Profile', path: '/supervisor/profile', icon: User }
      ];
    } else {
      return [
        { label: 'Dashboard', path: '/admin/dashboard', icon: BarChart },
        { label: 'Orders', path: '/admin/orders', icon: ClipboardList },
        { label: 'Reports', path: '/admin/reports', icon: Package },
        { label: 'Alerts', path: '/admin/alerts', icon: Bell, badge: unreadAlertsCount },
        { label: 'More', path: '/admin/more', icon: Menu }
      ];
    }
  };

  const navItems = getNavItems();

  return (
    <header className="app-header-container" style={styles.header}>
      <div style={styles.leftGroup}>
        {!isRootPage && location.pathname !== '/login' && (
          <button style={styles.iconBtn} onClick={() => navigate(-1)} aria-label="Go Back">
            <ArrowLeft size={20} color="var(--text-primary)" />
          </button>
        )}
        <div style={styles.brandTitle}>
          <div style={{ ...styles.brandGroup, cursor: 'pointer' }} onClick={() => navigate(navItems[0].path)}>
            <div style={styles.logoBadge}>
              <span style={styles.logoIcon}>⚡</span>
            </div>
            <span style={styles.brandText}>UniFlow <span style={{ color: 'var(--primary-teal)' }}>Ops</span></span>
          </div>
          {title && (
            <span style={styles.titleDivider}>
              / <span style={styles.pageTitle}>{title}</span>
            </span>
          )}
        </div>
      </div>

      <nav className="desktop-top-nav" style={styles.topNav}>
        {navItems.map(item => {
          const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              style={active ? styles.topNavItemActive : styles.topNavItem}
            >
              <Icon size={16} />
              <span>{item.label}</span>
              {item.badge ? item.badge > 0 && <span style={styles.topNavBadge}>{item.badge}</span> : null}
            </button>
          );
        })}
      </nav>

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
  },
  topNav: {
    alignItems: 'center',
    gap: '8px',
    margin: '0 24px'
  },
  topNavItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    borderRadius: '8px',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    fontWeight: 600,
    transition: 'all 0.2s ease',
    backgroundColor: 'transparent'
  },
  topNavItemActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    borderRadius: '8px',
    color: 'var(--primary-teal)',
    backgroundColor: 'rgba(22, 184, 174, 0.12)',
    fontSize: '13px',
    fontWeight: 700
  },
  topNavBadge: {
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
    padding: '0 4px',
    marginLeft: '2px'
  },
  titleDivider: {
    color: 'var(--text-muted)',
    margin: '0 8px',
    fontSize: '15px'
  }
};
