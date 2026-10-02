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
