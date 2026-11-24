import React from 'react';
import { getDueDateStatus } from '../utils/formatters';

interface DueDateBadgeProps {
  dueDate?: string | null;
  style?: React.CSSProperties;
  className?: string;
  compact?: boolean;
  noBox?: boolean;
}

export const DueDateBadge: React.FC<DueDateBadgeProps> = ({ dueDate, style, className, compact = false, noBox = false }) => {
  const status = getDueDateStatus(dueDate);
  if (!status) return null;

  if (noBox) {
    return (
      <span
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '11px',
          fontWeight: 700,
          color: status.color,
          letterSpacing: '0.02em',
          ...style
        }}
        title={`PO Due Date: ${status.formattedDue}`}
      >
        {compact ? status.shortLabel : status.label}
      </span>
    );
  }

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
      {compact ? status.shortLabel : status.label}
    </span>
  );
};
