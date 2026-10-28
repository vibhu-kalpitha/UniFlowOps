/**
 * Utility functions for formatting Production Order display titles and labels across UniFlow Ops UI.
 */

export function formatPoDisplayName(po: any): string {
  if (!po) return '';
  const style = po.styleName || po.styleCode || 'Standard Style';
  const name = (po.poName || po.po_name || '').trim();
  const num = po.poNumber || po.po_number || po.id || '';

  if (name) {
    return `${style} - ${name} - ${num}`;
  }
  return `${style} - ${num}`;
}

/**
 * Splits and formats production line numbers string into distinct line labels.
 * Handles inputs like:
 * "1, 6, 8" -> ["Line 1", "Line 6", "Line 8"]
 * "Line 1, Line 6, Line 8" -> ["Line 1", "Line 6", "Line 8"]
 * "Line 1, 6, 8" -> ["Line 1", "Line 6", "Line 8"]
 * "Line 46" -> ["Line 46"]
 */
export function parsePoLines(rawLineString?: string | null): string[] {
  if (!rawLineString || typeof rawLineString !== 'string') {
    return ['Line 1'];
  }
  const trimmed = rawLineString.trim();
  if (!trimmed) {
    return ['Line 1'];
  }

  // Split by comma, semicolon, slash, or plus
  const parts = trimmed.split(/[,;/+]+/).map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) {
    return ['Line 1'];
  }

  return parts.map(part => {
    // If it already starts with 'line', normalize e.g. "Line 1"
    if (/^line/i.test(part)) {
      return part.replace(/^line\s*/i, 'Line ').trim();
    }
    // Otherwise prepend "Line "
    return `Line ${part}`;
  });
}

/**
 * Formats a raw lines string into a normalized comma-separated string: "Line 1, Line 6, Line 8"
 */
export function formatPoLinesString(rawLineString?: string | null): string {
  if (!rawLineString || !rawLineString.trim()) return '';
  const lines = parsePoLines(rawLineString);
  return lines.join(', ');
}

export interface DueDateStatus {
  daysRemaining: number;
  isOverdue: boolean;
  isToday: boolean;
  formattedDue: string;
  label: string;
  bg: string;
  border: string;
  color: string;
}

export function getDueDateStatus(dueDateStr?: string | null): DueDateStatus | null {
  if (!dueDateStr) return null;
  const cleanedStr = dueDateStr.includes('T') ? dueDateStr.split('T')[0] : dueDateStr.trim();
  const parts = cleanedStr.split('-');
  if (parts.length !== 3) {
    const d = new Date(dueDateStr);
    if (isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return calculateDueDateStatus(y, m, day);
  }
  
  const [y, m, day] = parts.map(Number);
  if (!y || !m || !day) return null;
  return calculateDueDateStatus(y, m, day);
}

function calculateDueDateStatus(y: number, m: number, day: number): DueDateStatus {
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueMidnight = new Date(y, m - 1, day).getTime();

  const diffMs = dueMidnight - todayMidnight;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const formattedDue = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      daysRemaining: diffDays,
      isOverdue: true,
      isToday: false,
      formattedDue,
      label: `🚨 ${overdueDays} Day${overdueDays > 1 ? 's' : ''} Overdue (Due: ${formattedDue})`,
      bg: 'rgba(239, 68, 68, 0.15)',
      border: '1.5px solid #ef4444',
      color: '#ef4444'
    };
  } else if (diffDays === 0) {
    return {
      daysRemaining: 0,
      isOverdue: false,
      isToday: true,
      formattedDue,
      label: `⚠️ Due Today (${formattedDue})`,
      bg: 'rgba(245, 158, 11, 0.18)',
      border: '1.5px solid #f59e0b',
      color: '#f59e0b'
    };
  } else {
    return {
      daysRemaining: diffDays,
      isOverdue: false,
      isToday: false,
      formattedDue,
      label: `⏳ ${diffDays} Day${diffDays > 1 ? 's' : ''} Remaining (Due: ${formattedDue})`,
      bg: 'rgba(20, 184, 166, 0.15)',
      border: '1px solid rgba(20, 184, 166, 0.4)',
      color: 'var(--primary-teal, #14b8a6)'
    };
  }
}

