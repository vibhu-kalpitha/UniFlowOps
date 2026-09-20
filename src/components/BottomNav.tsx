import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Home, ClipboardList, ScanLine, Bell, User, BarChart, Package, Menu } from 'lucide-react';
import '../styles/tokens.css';

export const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentRole, alerts } = useApp();

  const unreadAlerts = alerts.filter(a => !a.read).length;

  if (location.pathname === '/login') return null;

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  if (currentRole === 'operator') {
    return (
      <nav className="bottom-nav-bar" style={styles.navBar}>
        <button
          style={isActive('/operator/home') ? styles.navItemActive : styles.navItem}
          onClick={() => navigate('/operator/home')}
        >
          <Home size={20} />
          <span>Home</span>
        </button>

        <button
          style={isActive('/operator/orders') ? styles.navItemActive : styles.navItem}
          onClick={() => navigate('/operator/orders')}
        >
          <ClipboardList size={20} />
          <span>Orders</span>
        </button>

        {/* Raised Center Scan Action */}
        <button style={styles.scanCenterBtn} onClick={() => navigate('/operator/scan')} aria-label="Scan Center">
          <div style={styles.scanIconCircle} className="scan-pulse">
            <ScanLine size={24} color="#041820" />
          </div>
        </button>

        <button
          style={isActive('/operator/alerts') ? styles.navItemActive : styles.navItem}
          onClick={() => navigate('/operator/alerts')}
        >
          <div style={{ position: 'relative' }}>
            <Bell size={20} />
            {unreadAlerts > 0 && <span style={styles.miniBadge}>{unreadAlerts}</span>}
          </div>
          <span>Alerts</span>
        </button>

        <button
          style={isActive('/operator/profile') ? styles.navItemActive : styles.navItem}
          onClick={() => navigate('/operator/profile')}
        >
          <User size={20} />
          <span>Profile</span>
        </button>
      </nav>
    );
  }

  if (currentRole === 'supervisor') {
    // Supervisor has exactly 4 items and NO Scan button
    return (
      <nav className="bottom-nav-bar" style={styles.navBar}>
        <button
          style={isActive('/supervisor/home') ? styles.navItemActive : styles.navItem}
          onClick={() => navigate('/supervisor/home')}
        >
          <Home size={20} />
          <span>Home</span>
        </button>

        <button
          style={isActive('/supervisor/orders') ? styles.navItemActive : styles.navItem}
          onClick={() => navigate('/supervisor/orders')}
        >
          <ClipboardList size={20} />
          <span>Orders</span>
        </button>

        <button
          style={isActive('/supervisor/alerts') ? styles.navItemActive : styles.navItem}
          onClick={() => navigate('/supervisor/alerts')}
        >
          <div style={{ position: 'relative' }}>
            <Bell size={20} />
            {unreadAlerts > 0 && <span style={styles.miniBadge}>{unreadAlerts}</span>}
          </div>
          <span>Alerts</span>
        </button>

        <button
          style={isActive('/supervisor/profile') ? styles.navItemActive : styles.navItem}
          onClick={() => navigate('/supervisor/profile')}
        >
          <User size={20} />
          <span>Profile</span>
        </button>
      </nav>
    );
  }

  // Admin Navigation (5 items)
  return (
    <nav className="bottom-nav-bar" style={styles.navBar}>
      <button
        style={isActive('/admin/dashboard') ? styles.navItemActive : styles.navItem}
        onClick={() => navigate('/admin/dashboard')}
      >
        <BarChart size={20} />
        <span>Dashboard</span>
      </button>

      <button
        style={isActive('/admin/orders') ? styles.navItemActive : styles.navItem}
        onClick={() => navigate('/admin/orders')}
      >
        <ClipboardList size={20} />
        <span>Orders</span>
      </button>

      <button
        style={isActive('/admin/reports') ? styles.navItemActive : styles.navItem}
        onClick={() => navigate('/admin/reports')}
      >
        <Package size={20} />
        <span>Reports</span>
      </button>

      <button
        style={isActive('/admin/alerts') ? styles.navItemActive : styles.navItem}
        onClick={() => navigate('/admin/alerts')}
      >
        <div style={{ position: 'relative' }}>
          <Bell size={20} />
          {unreadAlerts > 0 && <span style={styles.miniBadge}>{unreadAlerts}</span>}
        </div>
        <span>Alerts</span>
      </button>

      <button
        style={isActive('/admin/more') ? styles.navItemActive : styles.navItem}
        onClick={() => navigate('/admin/more')}
      >
        <Menu size={20} />
        <span>More</span>
      </button>
    </nav>
  );
};

const styles: Record<string, React.CSSProperties> = {
  navBar: {
    height: 'var(--bottom-nav-height)',
    backgroundColor: 'var(--bg-nav)',
    borderTop: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: '0 8px',
    position: 'relative',
    zIndex: 100,
    flexShrink: 0
  },
  navItem: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    color: 'var(--text-secondary)',
    fontSize: '11px',
    fontWeight: 500
  },
  navItemActive: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    color: 'var(--primary-teal)',
    fontSize: '11px',
    fontWeight: 700
  },
  scanCenterBtn: {
    width: '56px',
    height: '56px',
    marginTop: '-24px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    zIndex: 110
  },
  scanIconCircle: {
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-light) 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 16px var(--primary-teal-glow)'
  },
  miniBadge: {
    position: 'absolute',
    top: '-4px',
    right: '-6px',
    minWidth: '14px',
    height: '14px',
    borderRadius: '7px',
    backgroundColor: 'var(--color-red)',
    color: '#fff',
    fontSize: '9px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 3px'
  }
};
