import React from 'react';
import { getDueDateStatus } from '../utils/formatters';

interface DueDateBadgeProps {
  dueDate?: string | null;
  style?: React.CSSProperties;
  className?: string;
}

export const DueDateBadge: React.FC<DueDateBadgeProps> = ({ dueDate, style, className }) => {
  const status = getDueDateStatus(dueDate);
  if (!status) return null;

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '11px',
        fontWeight: 700,
        padding: '3px 9px',
        borderRadius: '8px',
        backgroundColor: status.bg,
        border: status.border,
        color: status.color,
        letterSpacing: '0.02em',
        boxShadow: status.isOverdue ? '0 0 10px rgba(239, 68, 68, 0.25)' : undefined,
        ...style
      }}
      title={`PO Due Date: ${status.formattedDue}`}
    >
      {status.label}
    </span>
  );
};
