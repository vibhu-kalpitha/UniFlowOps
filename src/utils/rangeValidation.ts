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
