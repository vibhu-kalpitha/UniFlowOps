import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../services/api';
import { Shield, RefreshCw, Slash, CheckCircle2, Clock, XCircle, Smartphone, Laptop } from 'lucide-react';
import '../../styles/tokens.css';

interface UserSessionItem {
  id: string;
  userId: string;
  username: string;
  role: string;
  fullName: string;
  ipAddress: string;
  userAgent: string;
  loginAt: string;
  lastSeenAt: string;
  logoutAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  active: boolean;
  status: 'ACTIVE' | 'REVOKED' | 'LOGGED_OUT' | 'EXPIRED';
}

export const AdminSessions: React.FC = () => {
  const { showToast } = useApp();
  const [sessions, setSessions] = useState<UserSessionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<UserSessionItem[]>('/api/admin/sessions');
      setSessions(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch user session logs', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleRevoke = async (sessionId: string, username: string) => {
    if (!confirm(`Are you sure you want to revoke session for user '${username}'? They will be logged out immediately on their next request.`)) {
      return;
    }
    setRevokingId(sessionId);
    try {
      await apiFetch(`/api/admin/sessions/${sessionId}/revoke`, { method: 'POST' });
      showToast(`Session for ${username} revoked successfully`, 'success');
      fetchSessions();
    } catch (err: any) {
      showToast(err.message || 'Failed to revoke session', 'error');
    } finally {
      setRevokingId(null);
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', backgroundColor: 'rgba(34, 211, 197, 0.15)', color: 'var(--primary-teal)', fontSize: '11px', fontWeight: 800 }}>
            <CheckCircle2 size={13} /> Active
          </span>
        );
      case 'REVOKED':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', backgroundColor: 'rgba(239, 92, 92, 0.15)', color: 'var(--color-red)', fontSize: '11px', fontWeight: 800 }}>
            <XCircle size={13} /> Revoked
          </span>
        );
      case 'LOGGED_OUT':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', backgroundColor: 'rgba(142, 171, 176, 0.15)', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 700 }}>
            <Clock size={13} /> Logged Out
          </span>
        );
      default:
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: 'var(--color-amber)', fontSize: '11px', fontWeight: 700 }}>
            <Clock size={13} /> Expired
          </span>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>User Sessions & Login Activity</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Database-backed audit log of authenticated sessions across mobile devices and browsers.
          </p>
        </div>
        <button
          className="btn-secondary"
          onClick={fetchSessions}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', width: 'auto', padding: '8px 14px' }}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading user session records from MySQL...
        </div>
      ) : sessions.length === 0 ? (
        <div className="card" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No session activity recorded yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sessions.map(s => (
            <div key={s.id} className="card" style={{ backgroundColor: 'var(--bg-surface-1)', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {s.userAgent.toLowerCase().includes('mobile') || s.userAgent.toLowerCase().includes('android') ? (
                      <Smartphone size={18} color="var(--primary-teal)" />
                    ) : (
                      <Laptop size={18} color="var(--color-blue)" />
                    )}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>{s.username}</span>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 6px', borderRadius: '6px', backgroundColor: 'var(--bg-surface-2)', color: 'var(--primary-teal)', textTransform: 'uppercase' }}>
                        {s.role}
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{s.fullName} • IP: <code>{s.ipAddress}</code></span>
                  </div>
                </div>
                <div>{renderStatusBadge(s.status)}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-color)', fontSize: '12px' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Login Time: </span>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{new Date(s.loginAt).toLocaleString()}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Last Activity: </span>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{new Date(s.lastSeenAt).toLocaleString()}</span>
                </div>
                {s.logoutAt && (
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Logout Time: </span>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{new Date(s.logoutAt).toLocaleString()}</span>
                  </div>
                )}
                {s.revokedAt && (
                  <div>
                    <span style={{ color: 'var(--color-red)' }}>Revoked At: </span>
                    <span style={{ color: 'var(--color-red)', fontWeight: 600 }}>{new Date(s.revokedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                User Agent: {s.userAgent}
              </div>

              {s.status === 'ACTIVE' && (
                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => handleRevoke(s.id, s.username)}
                    disabled={revokingId === s.id}
                    style={{ padding: '6px 14px', fontSize: '12px', width: 'auto' }}
                  >
                    <Slash size={14} style={{ marginRight: '4px' }} /> Revoke Session
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
