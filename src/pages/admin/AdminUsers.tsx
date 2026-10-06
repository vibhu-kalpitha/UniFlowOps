import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { Plus, User, Shield, X, RefreshCw, Search, KeyRound, CheckCircle2, UserCheck, UserX, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../../services/api';
import '../../styles/tokens.css';

interface UserRecord {
  id: string;
  name: string;
  username: string;
  employeeNo?: string;
  role: 'Operator' | 'Supervisor' | 'Admin';
  lineId: string;
  status: 'Active' | 'Inactive';
}

export const AdminUsers: React.FC = () => {
  const { showToast, currentRole } = useApp();
  const isSupervisorUser = currentRole === 'supervisor';

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [roleFilter, setRoleFilter] = useState<'All' | 'Operator' | 'Supervisor' | 'Admin'>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedResetUser, setSelectedResetUser] = useState<UserRecord | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Form State
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'Operator' | 'Supervisor' | 'Admin'>('Operator');
  const [lineId, setLineId] = useState('Line 04');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<any[]>('/api/admin/users');
      if (Array.isArray(data)) {
        const formatted: UserRecord[] = data.map((u: any) => {
          const rawRole = (u.role || '').toUpperCase();
          const normalizedRole: 'Operator' | 'Supervisor' | 'Admin' = 
            rawRole === 'ADMIN' ? 'Admin' : rawRole === 'SUPERVISOR' ? 'Supervisor' : 'Operator';
          
          return {
            id: u.id,
            name: u.full_name || u.name || u.username,
            username: u.username,
            employeeNo: u.employeeNo || u.employee_no || u.id,
            role: normalizedRole,
            lineId: u.lineId || (u.shift_name ? `Shift: ${u.shift_name}` : normalizedRole === 'Operator' ? 'Line 04' : normalizedRole === 'Supervisor' ? 'Line 04 & 02' : 'All Lines'),
            status: (u.active === 0 || u.is_active === 0 || u.status === 'Inactive') ? 'Inactive' : 'Active'
          };
        });
        setUsers(formatted);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch users', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Filtered Users List
  const filteredUsers = users.filter(u => {
    const matchesRole = roleFilter === 'All' || u.role.toLowerCase() === roleFilter.toLowerCase();
    const matchesSearch = !searchTerm.trim() || 
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.employeeNo && u.employeeNo.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesRole && matchesSearch;
  });

  // Role Stats
  const totalCount = users.length;
  const operatorCount = users.filter(u => u.role === 'Operator').length;
  const supervisorCount = users.filter(u => u.role === 'Supervisor').length;
  const adminCount = users.filter(u => u.role === 'Admin').length;

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !username.trim() || !password.trim()) {
      showToast('Please enter name, username and password', 'warning');
      return;
    }

    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          fullName: name,
          username,
          password,
          role: role.toUpperCase()
        })
      });

      showToast(`Added new user ${name} (${role})`, 'success');
      setShowAddModal(false);
      setName('');
      setUsername('');
      setPassword('');
      fetchUsers();
    } catch (err: any) {
      showToast(err.message || 'Failed to add user', 'error');
    }
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
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ userId: selectedResetUser.id, newPassword })
      });
      showToast(`Password reset successfully for @${selectedResetUser.username}`, 'success');
      setShowResetModal(false);
      setSelectedResetUser(null);
      setNewPassword('');
    } catch (err: any) {
      showToast(err.message || 'Password reset failed', 'error');
    }
  };

  const handleToggleUserStatus = async (user: UserRecord) => {
    const nextActive = user.status === 'Inactive';
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: nextActive })
      });
      showToast(`User @${user.username} is now ${nextActive ? 'Active' : 'Inactive'}`, 'success');
      fetchUsers();
    } catch (err: any) {
      showToast(err.message || 'Failed to update user status', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>User Management</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Manage system access, roles, line assignments, and user credentials.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            className="btn-secondary"
            onClick={fetchUsers}
            disabled={loading}
            style={{ padding: '8px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button
            className="btn-primary"
            style={{ padding: '8px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={16} /> Add New User
          </button>
        </div>
      </div>

      {/* KPI Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
        <div style={styles.kpiCard}>
          <span style={styles.kpiLabel}>TOTAL USERS</span>
          <div style={styles.kpiVal}>{totalCount}</div>
          <span style={styles.kpiSub}>Registered Accounts</span>
        </div>
        <div style={styles.kpiCardTeal}>
          <span style={styles.kpiLabelTeal}>OPERATORS</span>
          <div style={styles.kpiValTeal}>{operatorCount}</div>
          <span style={styles.kpiSubTeal}>Line Scanning Staff</span>
        </div>
        <div style={styles.kpiCardBlue}>
          <span style={styles.kpiLabelBlue}>SUPERVISORS</span>
          <div style={styles.kpiValBlue}>{supervisorCount}</div>
          <span style={styles.kpiSubBlue}>Line & Shift Leads</span>
        </div>
        <div style={styles.kpiCardPurple}>
          <span style={styles.kpiLabelPurple}>ADMINISTRATORS</span>
          <div style={styles.kpiValPurple}>{adminCount}</div>
          <span style={styles.kpiSubPurple}>System Admins</span>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', backgroundColor: 'var(--bg-surface-1)', padding: '12px 16px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
        {/* Role Filter Tabs */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            style={roleFilter === 'All' ? styles.tabActive : styles.tabBtn}
            onClick={() => setRoleFilter('All')}
          >
            All ({totalCount})
          </button>
          <button
            style={roleFilter === 'Operator' ? styles.tabActiveTeal : styles.tabBtn}
            onClick={() => setRoleFilter('Operator')}
          >
            Operators ({operatorCount})
          </button>
          <button
            style={roleFilter === 'Supervisor' ? styles.tabActiveBlue : styles.tabBtn}
            onClick={() => setRoleFilter('Supervisor')}
          >
            Supervisors ({supervisorCount})
          </button>
          <button
            style={roleFilter === 'Admin' ? styles.tabActivePurple : styles.tabBtn}
            onClick={() => setRoleFilter('Admin')}
          >
            Admins ({adminCount})
          </button>
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', minWidth: '220px' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search name or username..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              borderRadius: '10px',
              backgroundColor: 'var(--bg-surface-2)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              outline: 'none'
            }}
          />
        </div>
      </div>

      {/* User Cards Grid */}
      {loading ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading users from database...
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No users match the selected role filter or search term.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
          {filteredUsers.map(u => {
            const initials = u.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
            const isActive = u.status === 'Active';

            return (
              <div
                key={u.id}
                className="card"
                style={{
                  backgroundColor: 'var(--bg-surface-1)',
                  border: `1.5px solid ${
                    u.role === 'Admin'
                      ? 'rgba(139, 92, 246, 0.35)'
                      : u.role === 'Supervisor'
                      ? 'rgba(59, 130, 246, 0.35)'
                      : 'rgba(22, 184, 174, 0.35)'
                  }`,
                  borderRadius: '16px',
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '12px',
                      backgroundColor: u.role === 'Admin' ? 'rgba(139, 92, 246, 0.2)' : u.role === 'Supervisor' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(22, 184, 174, 0.2)',
                      border: `1px solid ${u.role === 'Admin' ? '#8B5CF6' : u.role === 'Supervisor' ? '#3B82F6' : 'var(--primary-teal)'}`,
                      color: u.role === 'Admin' ? '#8B5CF6' : u.role === 'Supervisor' ? '#3B82F6' : 'var(--primary-teal)',
                      fontWeight: 800,
                      fontSize: '15px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {initials}
                    </div>
                    <div>
                      <h4 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>{u.name}</h4>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>@{u.username}</span>
                    </div>
                  </div>
                  <StatusPill label={u.role} variant={u.role === 'Admin' ? 'purple' : u.role === 'Supervisor' ? 'blue' : 'teal'} />
                </div>

                <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '10px 12px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <span><strong>Assignment:</strong> {u.lineId}</span>
                  <span style={{ color: isActive ? '#10B981' : '#EF4444', fontWeight: 700 }}>
                    {isActive ? '● Active' : '○ Inactive'}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: '1px dashed var(--border-color)' }}>
                  {isSupervisorUser && u.role !== 'Operator' ? (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, fontStyle: 'italic' }}>
                      Admin Managed Account
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleToggleUserStatus(u)}
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: isActive ? '#EF4444' : '#10B981',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                        {isActive ? 'Deactivate' : 'Activate'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedResetUser(u);
                          setNewPassword('');
                          setShowResetModal(true);
                        }}
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: 'var(--primary-teal)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <KeyRound size={14} /> Reset Password
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>
                {isSupervisorUser ? 'Add New Operator Account' : 'Add New User Account'}
              </h3>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setShowAddModal(false)}>
                <X size={20} color="var(--text-secondary)" />
              </button>
            </div>

            <form onSubmit={handleAddUser} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={styles.label}>Full Name</label>
                <input type="text" className="input-field" placeholder="e.g. Chamika Perera" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div>
                <label style={styles.label}>Username</label>
                <input type="text" className="input-field" placeholder="e.g. chamika" value={username} onChange={e => setUsername(e.target.value)} required />
              </div>
              <div>
                <label style={styles.label}>Initial Password</label>
                <input type="password" className="input-field" placeholder="At least 6 characters" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={styles.label}>Role</label>
                  <select
                    className="input-field select-field"
                    value={isSupervisorUser ? 'Operator' : role}
                    disabled={isSupervisorUser}
                    onChange={e => setRole(e.target.value as any)}
                  >
                    <option value="Operator">Operator</option>
                    {!isSupervisorUser && <option value="Supervisor">Supervisor</option>}
                    {!isSupervisorUser && <option value="Admin">Admin</option>}
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

              <button type="submit" className="btn-primary" style={{ marginTop: '10px', width: '100%' }}>
                {isSupervisorUser ? 'Create Operator Account' : 'Create User Account'}
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
              <button style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setShowResetModal(false)}>
                <X size={20} color="var(--text-secondary)" />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Setting new password for user <strong>@{selectedResetUser.username}</strong> ({selectedResetUser.name}).
            </p>

            <form onSubmit={handleResetPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={styles.label}>New Password</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Enter new password (min 6 chars)"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: '10px', width: '100%' }}>
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
  kpiCard: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '14px',
    padding: '12px 14px'
  },
  kpiLabel: { fontSize: '10px', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.05em' },
  kpiVal: { fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' },
  kpiSub: { fontSize: '11px', color: 'var(--text-muted)' },

  kpiCardTeal: {
    backgroundColor: 'rgba(22, 184, 174, 0.08)',
    border: '1px solid rgba(22, 184, 174, 0.3)',
    borderRadius: '14px',
    padding: '12px 14px'
  },
  kpiLabelTeal: { fontSize: '10px', fontWeight: 800, color: 'var(--primary-teal)', letterSpacing: '0.05em' },
  kpiValTeal: { fontSize: '22px', fontWeight: 800, color: 'var(--primary-teal)', marginTop: '2px' },
  kpiSubTeal: { fontSize: '11px', color: 'var(--primary-teal)' },

  kpiCardBlue: {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    borderRadius: '14px',
    padding: '12px 14px'
  },
  kpiLabelBlue: { fontSize: '10px', fontWeight: 800, color: '#3B82F6', letterSpacing: '0.05em' },
  kpiValBlue: { fontSize: '22px', fontWeight: 800, color: '#3B82F6', marginTop: '2px' },
  kpiSubBlue: { fontSize: '11px', color: '#3B82F6' },

  kpiCardPurple: {
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    border: '1px solid rgba(139, 92, 246, 0.3)',
    borderRadius: '14px',
    padding: '12px 14px'
  },
  kpiLabelPurple: { fontSize: '10px', fontWeight: 800, color: '#8B5CF6', letterSpacing: '0.05em' },
  kpiValPurple: { fontSize: '22px', fontWeight: 800, color: '#8B5CF6', marginTop: '2px' },
  kpiSubPurple: { fontSize: '11px', color: '#8B5CF6' },

  tabBtn: {
    padding: '8px 14px',
    borderRadius: '10px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer'
  },
  tabActive: {
    padding: '8px 14px',
    borderRadius: '10px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1.5px solid var(--text-primary)',
    color: 'var(--text-primary)',
    fontSize: '12px',
    fontWeight: 800,
    cursor: 'pointer'
  },
  tabActiveTeal: {
    padding: '8px 14px',
    borderRadius: '10px',
    backgroundColor: 'rgba(22, 184, 174, 0.15)',
    border: '1.5px solid var(--primary-teal)',
    color: 'var(--primary-teal)',
    fontSize: '12px',
    fontWeight: 800,
    cursor: 'pointer'
  },
  tabActiveBlue: {
    padding: '8px 14px',
    borderRadius: '10px',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    border: '1.5px solid #3B82F6',
    color: '#3B82F6',
    fontSize: '12px',
    fontWeight: 800,
    cursor: 'pointer'
  },
  tabActivePurple: {
    padding: '8px 14px',
    borderRadius: '10px',
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    border: '1.5px solid #8B5CF6',
    color: '#8B5CF6',
    fontSize: '12px',
    fontWeight: 800,
    cursor: 'pointer'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    zIndex: 1000
  },
  modalContent: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '20px',
    padding: '24px',
    width: '100%',
    maxWidth: '460px'
  },
  label: {
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    marginBottom: '4px',
    display: 'block'
  }
};
