import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle2, Package, ScanLine, AlertTriangle, Bell, Check } from 'lucide-react';
import '../../styles/tokens.css';

export const AlertsPage: React.FC = () => {
  const { alerts, markAlertRead } = useApp();
  const [activeTab, setActiveTab] = useState<'all' | 'work' | 'quality' | 'system'>('all');

  const filteredAlerts = alerts.filter(alert => {
    if (activeTab === 'all') return true;
    return alert.type === activeTab;
  });

  const getAlertIcon = (iconName: string) => {
    switch (iconName) {
      case 'CircleCheck':
        return <CheckCircle2 size={20} color="var(--color-green)" />;
      case 'Package':
        return <Package size={20} color="var(--color-blue)" />;
      case 'ScanLine':
        return <ScanLine size={20} color="var(--color-purple)" />;
      case 'TriangleAlert':
        return <AlertTriangle size={20} color="var(--color-amber)" />;
      default:
        return <Bell size={20} color="var(--primary-teal)" />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Factory Alerts</h2>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {alerts.filter(a => !a.read).length} unread
        </span>
      </div>

      {/* Filter Tabs */}
      <div style={styles.tabBar}>
        {(['all', 'work', 'quality', 'system'] as const).map(tab => (
          <button
            key={tab}
            style={activeTab === tab ? styles.tabActive : styles.tabBtn}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Alert List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filteredAlerts.length === 0 ? (
          <div style={styles.emptyState}>
            <Bell size={32} color="var(--text-muted)" />
            <p style={{ marginTop: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>No alerts found</p>
          </div>
        ) : (
          filteredAlerts.map(alert => (
            <div
              key={alert.id}
              style={{
                ...styles.alertCard,
                backgroundColor: alert.read ? 'var(--bg-surface-1)' : 'var(--bg-surface-2)',
                borderLeft: `4px solid ${
                  alert.type === 'quality'
                    ? 'var(--color-amber)'
                    : alert.type === 'work'
                    ? 'var(--color-blue)'
                    : 'var(--primary-teal)'
                }`
              }}
              onClick={() => markAlertRead(alert.id)}
            >
              <div style={styles.iconCircle}>
                {getAlertIcon(alert.iconName)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={styles.cardHeader}>
                  <span style={styles.alertTitle}>{alert.title}</span>
                  <span style={styles.alertTime}>{alert.time}</span>
                </div>
                <p style={styles.alertMessage}>{alert.message}</p>
              </div>
              {!alert.read && <div style={styles.unreadDot} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  tabBar: {
    display: 'flex',
    backgroundColor: 'var(--bg-surface-1)',
    borderRadius: '12px',
    padding: '4px',
    border: '1px solid var(--border-color)'
  },
  tabBtn: {
    flex: 1,
    height: '34px',
    borderRadius: '8px',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: 600
  },
  tabActive: {
    flex: 1,
    height: '34px',
    borderRadius: '8px',
    backgroundColor: 'var(--primary-teal)',
    color: '#041820',
    fontSize: '12px',
    fontWeight: 700
  },
  alertCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '14px',
    borderRadius: '14px',
    border: '1px solid var(--border-color)',
    cursor: 'pointer'
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
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '4px'
  },
  alertTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--text-primary)'
  },
  alertTime: {
    fontSize: '11px',
    color: 'var(--text-muted)'
  },
  alertMessage: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    lineHeight: '1.3'
  },
  unreadDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'var(--primary-teal)',
    alignSelf: 'center'
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 16px',
    backgroundColor: 'var(--bg-surface-1)',
    borderRadius: '16px',
    border: '1px dashed var(--border-color)'
  }
};
