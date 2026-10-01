/**
 * Helper to check if a barcode / serial number is within an active range.
 * Supports numeric extraction and alphanumeric comparison (e.g. PNFLS092632670 to PNFLS092632690 or BX-000100 to BX-000500).
 */
export function isCodeInRange(code: string, rangeStart?: string, rangeEnd?: string): boolean {
  if (!rangeStart || !rangeEnd || !rangeStart.trim() || !rangeEnd.trim()) {
    return true; // No range restriction enforced
  }

  const cleanCode = code.trim().toUpperCase();
  const cleanStart = rangeStart.trim().toUpperCase();
  const cleanEnd = rangeEnd.trim().toUpperCase();

  // 1. Direct alphanumeric string range comparison
  if (cleanCode.length === cleanStart.length && cleanCode.length === cleanEnd.length) {
    if (cleanCode >= cleanStart && cleanCode <= cleanEnd) {
      return true;
    }
  }

  // 2. Numeric suffix extraction comparison
  const numCode = parseInt(cleanCode.replace(/[^0-9]/g, ''), 10);
  const numStart = parseInt(cleanStart.replace(/[^0-9]/g, ''), 10);
  const numEnd = parseInt(cleanEnd.replace(/[^0-9]/g, ''), 10);

  if (!isNaN(numCode) && !isNaN(numStart) && !isNaN(numEnd)) {
    const minVal = Math.min(numStart, numEnd);
    const maxVal = Math.max(numStart, numEnd);
    return numCode >= minVal && numCode <= maxVal;
  }

  return true;
}

export interface RangeValidationResult {
  valid: boolean;
  error?: 'QR_OUT_OF_RANGE' | 'QR_RANGE_NOT_CONFIGURED' | 'INVALID_QR';
  message?: string;
  expectedRange?: string;
}

/**
 * Validates a product QR barcode against the product range configurations of a Production Order.
 */
export function validatePoQrRange(po: any, rawCode: string): RangeValidationResult {
  if (!po) {
    return { valid: true };
  }

  const code = rawCode.trim().toUpperCase();
  if (!code) {
    return { valid: false, error: 'INVALID_QR', message: 'Barcode is required' };
  }

  const configs: any[] = [];
  if (Array.isArray(po.productConfigurations) && po.productConfigurations.length > 0) {
    configs.push(...po.productConfigurations);
  } else if (Array.isArray(po.configs) && po.configs.length > 0) {
    configs.push(...po.configs);
  }
  if (Array.isArray(po.salesOrders)) {
    for (const so of po.salesOrders) {
      if (so.productQrPrefix || so.product_qr_prefix) {
        configs.push(so);
      }
    }
  }
  if (po.productQrPrefix || po.product_qr_prefix) {
    configs.push(po);
  }

  if (configs.length === 0) {
    const poName = po.poNumber || po.po_number || po.id || '';
    return {
      valid: false,
      error: 'QR_RANGE_NOT_CONFIGURED',
      message: `Product QR range not configured for Production Order ${poName}. Please contact supervisor.`
    };
  }

  let expectedRange: string | undefined;

  for (const cfg of configs) {
    const prefix = (cfg.productQrPrefix || cfg.product_qr_prefix || '').trim().toUpperCase();
    const start = Number(cfg.productSerialStart ?? cfg.product_serial_start);
    const end = Number(cfg.productSerialEnd ?? cfg.product_serial_end);

    if (prefix && !isNaN(start) && !isNaN(end)) {
      if (!expectedRange) {
        expectedRange = `${prefix}${start} to ${prefix}${end}`;
      }

      if (code.startsWith(prefix)) {
        const serialStr = code.slice(prefix.length);
        if (serialStr && /^\d+$/.test(serialStr)) {
          const serialNum = parseInt(serialStr, 10);
          const minVal = Math.min(start, end);
          const maxVal = Math.max(start, end);
          if (serialNum >= minVal && serialNum <= maxVal) {
            return { valid: true, expectedRange: `${prefix}${start} to ${prefix}${end}` };
          }
        }
      }
    }
  }

  const poName = po.poNumber || po.po_number || po.id || '';
  const expMsg = expectedRange ? ` (Expected range: ${expectedRange})` : '';

  return {
    valid: false,
    error: 'QR_OUT_OF_RANGE',
    message: `Out of range — this QR does not belong to Production Order ${poName}.${expMsg}`,
    expectedRange
  };
}

