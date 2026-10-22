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
