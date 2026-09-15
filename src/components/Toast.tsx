import React from 'react';
import { useApp } from '../context/AppContext';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import '../styles/tokens.css';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div style={styles.container}>
      {toasts.map(toast => {
        let icon = <CheckCircle2 size={18} color="var(--color-green)" />;
        let borderColor = 'var(--color-green)';
        let bgColor = 'rgba(24, 184, 121, 0.15)';

        if (toast.type === 'warning') {
          icon = <AlertTriangle size={18} color="var(--color-amber)" />;
          borderColor = 'var(--color-amber)';
          bgColor = 'rgba(243, 168, 51, 0.15)';
        } else if (toast.type === 'error') {
          icon = <AlertCircle size={18} color="var(--color-red)" />;
          borderColor = 'var(--color-red)';
          bgColor = 'rgba(239, 92, 92, 0.15)';
        } else if (toast.type === 'info') {
          icon = <Info size={18} color="var(--color-blue)" />;
          borderColor = 'var(--color-blue)';
          bgColor = 'rgba(67, 133, 245, 0.15)';
        }

        return (
          <div
            key={toast.id}
            style={{
              ...styles.toast,
              borderColor,
              backgroundColor: 'var(--bg-surface-2)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.5)'
            }}
          >
            <div style={{ ...styles.iconBox, backgroundColor: bgColor }}>
              {icon}
            </div>
            <span style={styles.text}>{toast.message}</span>
            <button style={styles.closeBtn} onClick={() => removeToast(toast.id)}>
              <X size={14} color="var(--text-secondary)" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: '70px',
    left: '16px',
    right: '16px',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    pointerEvents: 'none'
  },
  toast: {
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'center',
    padding: '10px 14px',
    borderRadius: '12px',
    border: '1px solid',
    gap: '10px',
    animation: 'fadeIn 0.3s ease-in-out'
  },
  iconBox: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  text: {
    flex: 1,
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--text-primary)'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    padding: '4px',
    cursor: 'pointer'
  }
};
