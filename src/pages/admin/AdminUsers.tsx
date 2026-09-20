import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { Plus, User, Shield, X } from 'lucide-react';
import '../../styles/tokens.css';

interface UserRecord {
  id: string;
  name: string;
  username: string;
  role: 'Operator' | 'Supervisor' | 'Admin';
  lineId: string;
  status: 'Active' | 'Inactive';
}

export const AdminUsers: React.FC = () => {
  const { showToast } = useApp();

  const [users, setUsers] = useState<UserRecord[]>([
    { id: 'usr-001', name: 'Chamika Silva', username: 'chamika', role: 'Operator', lineId: 'Line 04', status: 'Active' },
    { id: 'usr-002', name: 'Nimal Perera', username: 'nimal', role: 'Supervisor', lineId: 'Line 04 & 02', status: 'Active' },
    { id: 'usr-003', name: 'Factory Admin', username: 'admin', role: 'Admin', lineId: 'All Lines', status: 'Active' },
    { id: 'usr-004', name: 'Kavindu Perera', username: 'kavindu', role: 'Operator', lineId: 'Line 04', status: 'Active' },
    { id: 'usr-005', name: 'Sunil Bandara', username: 'sunil', role: 'Supervisor', lineId: 'Line 03', status: 'Inactive' }
  ]);

  const [roleFilter, setRoleFilter] = useState<'All' | 'Operator' | 'Supervisor' | 'Admin'>('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedResetUser, setSelectedResetUser] = useState<UserRecord | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Form State
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'Operator' | 'Supervisor' | 'Admin'>('Operator');
  const [lineId, setLineId] = useState('Line 04');

  const filteredUsers = users.filter(u => {
    if (roleFilter === 'All') return true;
    return u.role === roleFilter;
  });

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !username.trim()) {
      showToast('Please enter name and username', 'warning');
      return;
    }

    const newUser: UserRecord = {
      id: `usr-00${users.length + 1}`,
      name,
      username,
      role,
      lineId,
      status: 'Active'
    };

    setUsers([...users, newUser]);
    setShowAddModal(false);
    showToast(`Added new user ${name} (${role})`, 'success');
    setName('');
    setUsername('');
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResetUser || !newPassword.trim()) {
      showToast('Please enter a new password', 'warning');
      return;
    }
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedResetUser.id, newPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.message || 'Password reset failed', 'error');
        return;
      }
      showToast(`Password reset successfully for @${selectedResetUser.username}`, 'success');
      setShowResetModal(false);
      setSelectedResetUser(null);
      setNewPassword('');
    } catch (err: any) {
      showToast(err.message || 'Password reset failed', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>User Management</h2>
        <button
          className="btn-primary"
          style={{ height: '36px', padding: '0 12px', fontSize: '12px', gap: '4px', width: 'auto' }}
          onClick={() => setShowAddModal(true)}
        >
          <Plus size={16} /> Add User
        </button>
      </div>

      {/* Role Filter Tabs */}
      <div style={styles.tabBar}>
        {(['All', 'Operator', 'Supervisor', 'Admin'] as const).map(tab => (
          <button
            key={tab}
            style={roleFilter === tab ? styles.tabActive : styles.tabBtn}
            onClick={() => setRoleFilter(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* User Cards Grid */}
      <div className="desktop-grid-3" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filteredUsers.map(u => (
          <div key={u.id} className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={styles.avatarMini}>
                  {u.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{u.name}</h4>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>@{u.username} • {u.lineId}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <StatusPill label={u.role} variant={u.role === 'Admin' ? 'purple' : u.role === 'Supervisor' ? 'blue' : 'teal'} />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedResetUser(u);
                    setNewPassword('');
                    setShowResetModal(true);
                  }}
                  style={{ fontSize: '11px', color: 'var(--primary-teal)', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                >
                  Reset Password
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Add New User</h3>
              <button style={{ background: 'none', border: 'none' }} onClick={() => setShowAddModal(false)}>
                <X size={20} color="var(--text-secondary)" />
              </button>
            </div>

            <form onSubmit={handleAddUser} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={styles.label}>Full Name</label>
                <input type="text" className="input-field" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div>
                <label style={styles.label}>Username</label>
                <input type="text" className="input-field" value={username} onChange={e => setUsername(e.target.value)} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={styles.label}>Role</label>
                  <select className="input-field select-field" value={role} onChange={e => setRole(e.target.value as any)}>
                    <option value="Operator">Operator</option>
                    <option value="Supervisor">Supervisor</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label style={styles.label}>Line Assignment</label>
                  <select className="input-field select-field" value={lineId} onChange={e => setLineId(e.target.value)}>
                    <option value="Line 01">Line 01</option>
                    <option value="Line 02">Line 02</option>
                    <option value="Line 03">Line 03</option>
                    <option value="Line 04">Line 04</option>
                    <option value="All Lines">All Lines</option>
                  </select>
                </div>
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: '10px' }}>
                Save User
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && selectedResetUser && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Reset Password</h3>
              <button style={{ background: 'none', border: 'none' }} onClick={() => setShowResetModal(false)}>
                <X size={20} color="var(--text-secondary)" />
              </button>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Setting new password for user <strong>@{selectedResetUser.username}</strong> ({selectedResetUser.name}).
            </p>

            <form onSubmit={handleResetPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={styles.label}>New Password</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Minimum 6 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: '10px' }}>
                Confirm Password Reset
              </button>
            </form>
          </div>
        </div>
      )}
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
  avatarMini: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--primary-teal)',
    color: 'var(--primary-teal)',
    fontWeight: 800,
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
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
