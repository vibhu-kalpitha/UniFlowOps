import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { UserRole } from '../../types';
import { Building, Layers, Shirt, Package, Wifi, Lock, Settings, Shield, LogOut, ChevronRight, X } from 'lucide-react';
import '../../styles/tokens.css';

export const AdminMore: React.FC = () => {
  const navigate = useNavigate();
  const { setRole, showToast } = useApp();

  const [activeModal, setActiveModal] = useState<string | null>(null);
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

  const settingsItems = [
    { id: 'company', title: 'Company Details', desc: 'Innovus Garments (Pvt) Ltd • Factory #04', icon: Building, color: 'var(--primary-teal)' },
    { id: 'lines', title: 'Production Lines', desc: '4 active assembly lines (Line 01 - 04)', icon: Layers, color: 'var(--color-blue)' },
    { id: 'styles', title: 'Products & Styles', desc: 'Catalog of 18 garment style codes', icon: Shirt, color: 'var(--color-purple)' },
    { id: 'box', title: 'Box Settings', desc: 'Default box capacity: 12 units', icon: Package, color: 'var(--color-amber)' },
    { id: 'scanners', title: 'Scanner Devices', desc: '14 paired Bluetooth barcode scanners', icon: Wifi, color: 'var(--color-green)' },
    { id: 'test-scanner', title: 'Test Scanner Diagnostic', desc: 'Inspect raw keystrokes, timing & terminators', icon: Wifi, color: 'var(--primary-teal)' },
    { id: 'roles', title: 'Roles & Permissions', desc: 'Access policy configuration per role', icon: Lock, color: 'var(--color-red)' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 800 }}>System Settings & More</h2>

      {/* Settings Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {settingsItems.map(item => {
          const IconComp = item.icon;
          return (
            <div
              key={item.id}
              className="card"
              style={{ ...styles.menuCard, cursor: 'pointer' }}
              onClick={() => {
                if (item.id === 'test-scanner') {
                  navigate('/test-scanner');
                } else {
                  setActiveModal(item.id);
                  showToast(`Opened ${item.title} configuration`, 'info');
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                <div style={styles.iconCircle}>
                  <IconComp size={18} color={item.color} />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={styles.menuTitle}>{item.title}</span>
                  <span style={styles.menuDesc}>{item.desc}</span>
                </div>
                <ChevronRight size={18} color="var(--text-secondary)" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Switch Demo Role */}
      <div
        className="card"
        style={{ ...styles.menuCard, cursor: 'pointer' }}
        onClick={() => setShowRoleModal(true)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          <div style={styles.iconCircle}>
            <Shield size={18} color="var(--primary-teal)" />
          </div>
          <div style={{ flex: 1 }}>
            <span style={styles.menuTitle}>Switch Demo Role Mode</span>
            <span style={styles.menuDesc}>Switch view to Operator or Supervisor</span>
          </div>
          <ChevronRight size={18} color="var(--text-secondary)" />
        </div>
      </div>

      {/* Logout Action */}
      <button className="btn-danger" onClick={handleLogout} style={{ marginTop: 'auto' }}>
        <LogOut size={18} style={{ marginRight: '8px' }} /> Log Out
      </button>

      {/* Settings Modal */}
      {activeModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>
                {settingsItems.find(i => i.id === activeModal)?.title}
              </h3>
              <button style={{ background: 'none', border: 'none' }} onClick={() => setActiveModal(null)}>
                <X size={20} color="var(--text-secondary)" />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {settingsItems.find(i => i.id === activeModal)?.desc}. All settings operate in real-time mode.
            </p>

            <button className="btn-primary" onClick={() => setActiveModal(null)}>
              Save Settings
            </button>
          </div>
        </div>
      )}

      {/* Switch Role Modal */}
      {showRoleModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '12px' }}>Switch Role Mode</h3>
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
