import React from 'react';
import '../styles/tokens.css';

interface StatusPillProps {
  label: string;
  variant?: 'teal' | 'green' | 'blue' | 'purple' | 'amber' | 'red' | 'muted';
}

export const StatusPill: React.FC<StatusPillProps> = ({ label, variant = 'teal' }) => {
  let color = 'var(--primary-teal)';
  let bg = 'rgba(22, 184, 174, 0.15)';

  if (variant === 'green') {
    color = 'var(--color-green)';
    bg = 'var(--color-green-bg)';
  } else if (variant === 'blue') {
    color = 'var(--color-blue)';
    bg = 'var(--color-blue-bg)';
  } else if (variant === 'purple') {
    color = 'var(--color-purple)';
    bg = 'var(--color-purple-bg)';
  } else if (variant === 'amber') {
    color = 'var(--color-amber)';
    bg = 'var(--color-amber-bg)';
  } else if (variant === 'red') {
    color = 'var(--color-red)';
    bg = 'var(--color-red-bg)';
  } else if (variant === 'muted') {
    color = 'var(--text-secondary)';
    bg = 'rgba(142, 171, 176, 0.12)';
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        borderRadius: 'var(--radius-pill)',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        color,
        backgroundColor: bg,
        border: `1px solid ${color}33`
      }}
    >
      {label}
    </span>
  );
};
