import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { UserRole } from '../../types';
import { User, Lock, CheckSquare, Square } from 'lucide-react';
import '../../styles/tokens.css';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { setRole, showToast } = useApp();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [selectedRole, setSelectedRole] = useState<UserRole>('operator');

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setPassword('');
    if (role === 'operator') {
      setUsername('chamika');
    } else if (role === 'supervisor') {
      setUsername('nimal');
    } else if (role === 'admin') {
      setUsername('admin');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      showToast('Please enter username and password', 'warning');
      return;
    }

    try {
      const { login } = await import('../../services/api');
      const data = await login(username, password);
      const roleFromBackend = data.user.role.toLowerCase() as UserRole;
      setRole(roleFromBackend);
      showToast(`Welcome back, ${data.user.full_name}! Logged in as ${roleFromBackend.toUpperCase()}`, 'success');

      if (roleFromBackend === 'operator') {
        navigate('/operator/home');
      } else if (roleFromBackend === 'supervisor') {
        navigate('/supervisor/home');
      } else {
        navigate('/admin/dashboard');
      }
    } catch (err: any) {
      showToast(err.message || 'Login failed. Check credentials.', 'error');
    }
  };

  return (
    <div className="login-desktop-wrapper">
      <div className="login-desktop-shell">
        <div className="login-form-inner">
          {/* Centralized Brand Logo & Header */}
          <div style={styles.brandSection}>
            <div style={styles.hangerIconWrap}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#22D3C5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 7a2 2 0 1 0-2-2" />
                <path d="M12 7v3" />
                <path d="M12 10L3.5 15.5a1.5 1.5 0 0 0 .7 2.8h15.6a1.5 1.5 0 0 0 .7-2.8L12 10z" />
              </svg>
            </div>
            <h1 style={styles.title}>UniFlow <span style={{ color: '#22D3C5' }}>Ops</span></h1>
            <p style={styles.subtitle}>UNIT FLOW OPERATOR</p>
          </div>

          {/* Demo Role Mode Box */}
          <div style={styles.roleBox}>
            <span style={styles.roleLabel}>DEMO ROLE MODE:</span>
            <div style={styles.roleButtons}>
              <button
                type="button"
                style={selectedRole === 'operator' ? styles.roleActive : styles.roleBtn}
                onClick={() => handleRoleSelect('operator')}
              >
                Operator
              </button>
              <button
                type="button"
                style={selectedRole === 'supervisor' ? styles.roleActive : styles.roleBtn}
                onClick={() => handleRoleSelect('supervisor')}
              >
                Supervisor
              </button>
              <button
                type="button"
                style={selectedRole === 'admin' ? styles.roleActive : styles.roleBtn}
                onClick={() => handleRoleSelect('admin')}
              >
                Admin
              </button>
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} style={styles.form}>
            <div style={styles.inputGroup}>
              <User size={18} color="#8EABB0" style={styles.fieldIcon} />
              <input
                type="text"
                style={styles.lightInput}
                placeholder="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
            </div>

            <div style={styles.inputGroup}>
              <Lock size={18} color="#8EABB0" style={styles.fieldIcon} />
              <input
                type="password"
                style={styles.lightInput}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            <div style={styles.rowBetween}>
              <button
                type="button"
                style={styles.checkboxBtn}
                onClick={() => setRememberMe(!rememberMe)}
              >
                {rememberMe ? (
                  <CheckSquare size={18} color="#22D3C5" />
                ) : (
                  <Square size={18} color="#8EABB0" />
                )}
                <span style={{ fontSize: '13px', color: '#ECF7F6', fontWeight: 500 }}>Remember me</span>
              </button>
              <span style={{ fontSize: '13px', color: '#22D3C5', cursor: 'pointer', fontWeight: 600 }}>
                Forgot password?
              </span>
            </div>

            <button type="submit" style={styles.loginSubmitBtn}>
              Login
            </button>
          </form>

          {/* Footer Branding */}
          <div style={styles.footer}>
            <p style={{ fontSize: '12px', color: '#8EABB0' }}>Unit Flow Operator</p>
            <p style={{ fontSize: '13px', fontWeight: 700, color: '#22D3C5', marginTop: '2px' }}>
              Software developed by Innovus
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-around',
    padding: '24px 20px',
    backgroundColor: '#071B23'
  },
  brandSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginTop: '10px'
  },
  hangerIconWrap: {
    marginBottom: '12px'
  },
  title: {
    fontSize: '30px',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: '#ECF7F6'
  },
  subtitle: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.18em',
    color: '#8EABB0',
    marginTop: '4px'
  },
  roleBox: {
    backgroundColor: 'rgba(13, 38, 48, 0.7)',
    border: '1px solid #213C44',
    borderRadius: '16px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  roleLabel: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#8EABB0',
    letterSpacing: '0.05em'
  },
  roleButtons: {
    display: 'flex',
    gap: '8px'
  },
  roleBtn: {
    flex: 1,
    height: '36px',
    borderRadius: '10px',
    backgroundColor: '#102E38',
    color: '#8EABB0',
    fontSize: '12px',
    fontWeight: 600,
    border: '1px solid #213C44'
  },
  roleActive: {
    flex: 1,
    height: '36px',
    borderRadius: '10px',
    backgroundColor: '#22D3C5',
    color: '#041820',
    fontSize: '12px',
    fontWeight: 800,
    border: 'none',
    boxShadow: '0 4px 12px rgba(34, 211, 197, 0.3)'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  inputGroup: {
    position: 'relative',
    width: '100%'
  },
  fieldIcon: {
    position: 'absolute',
    left: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 2
  },
  lightInput: {
    width: '100%',
    height: '48px',
    backgroundColor: '#EFF5F7',
    border: 'none',
    borderRadius: '14px',
    paddingLeft: '44px',
    paddingRight: '16px',
    color: '#071B23',
    fontFamily: 'inherit',
    fontSize: '15px',
    fontWeight: 500,
    outline: 'none'
  },
  rowBetween: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  checkboxBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer'
  },
  loginSubmitBtn: {
    width: '100%',
    height: '50px',
    borderRadius: '16px',
    backgroundColor: '#22D3C5',
    color: '#041820',
    fontWeight: 800,
    fontSize: '17px',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(34, 211, 197, 0.35)',
    marginTop: '6px'
  },
  footer: {
    textAlign: 'center',
    paddingTop: '10px'
  }
};
