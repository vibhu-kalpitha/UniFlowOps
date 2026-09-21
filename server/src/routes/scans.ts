import { Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { auditLog } from '../middleware/errorHandler.js';

const router = ExpressRouter();

// Helper to check idempotency key
async function checkIdempotency(key: string, operatorId: string, operation: string, rawCode: string): Promise<any | null> {
  if (!key) return null;
  const existing = await db.prepare(`SELECT * FROM scan_events WHERE idempotency_key = ?`).get(key) as any;
  return existing || null;
}

async function recordScanEvent(key: string, operatorId: string, operation: string, rawCode: string, result: 'ACCEPTED' | 'REJECTED' | 'DUPLICATE', errCode?: string, errMsg?: string) {
  if (!key) return;
  const id = `scan-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
  await db.prepare(`
    INSERT INTO scan_events (id, idempotency_key, operator_id, operation, raw_code, normalized_code, device_type, result, error_code, error_message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'KEYBOARD_WEDGE', ?, ?, ?, NOW(3))
    ON DUPLICATE KEY UPDATE result = VALUES(result), error_code = VALUES(error_code), error_message = VALUES(error_message)
  `).run(id, key, operatorId, operation, rawCode, rawCode.trim().toUpperCase(), result, errCode || null, errMsg || null);
}

// Helper to resolve SO safely from ID, so_number, or map_so
export async function resolveSO(soKey?: string | null) {
  if (!soKey) {
    return db.prepare(`SELECT * FROM sales_orders ORDER BY created_at DESC LIMIT 1`).get() as any;
  }
  let so = await db.prepare(`SELECT * FROM sales_orders WHERE id = ? OR so_number = ? OR map_so = ?`).get(soKey, soKey, soKey) as any;
  if (!so) {
    so = await db.prepare(`SELECT * FROM sales_orders ORDER BY created_at DESC LIMIT 1`).get() as any;
  }
  return so;
}

// Helper to count distinct item units admitted to QC for an SO
export async function getSOAdmittedItemCount(soId: string): Promise<number> {
  const row = await db.prepare(`
    SELECT COUNT(DISTINCT iu.id) as cnt FROM item_units iu
    WHERE iu.sales_order_id = ? AND iu.id IN (
      SELECT item_id FROM qc_results
      UNION
      SELECT item_id FROM qc_fail_log
    )
  `).get(soId) as any;
  return row?.cnt || 0;
}

// Helper to check if item is already admitted to QC
export async function isItemAdmitted(itemId: string): Promise<boolean> {
  const row = await db.prepare(`
    SELECT 1 FROM (
      SELECT item_id FROM qc_results WHERE item_id = ?
      UNION
      SELECT item_id FROM qc_fail_log WHERE item_id = ?
    ) as combined
    LIMIT 1
  `).get(itemId, itemId) as any;
  return !!row;
}

// Helper for operator allocation check using operator_work_assignments
export async function checkOperatorAllocation(operatorId: string, role: string, soId: string): Promise<boolean> {
  if (role === 'SUPERVISOR' || role === 'ADMIN') return true;

  const row = await db.prepare(`
    SELECT COUNT(*) as cnt FROM operator_work_assignments
    WHERE sales_order_id = ? AND operator_id = ? AND active = 1
  `).get(soId, operatorId) as any;

  return !!(row && row.cnt > 0);
}

// Product QR Range Validation Helper
export function validateProductQrRange(so: any, rawCode: string): { valid: boolean; error?: string; message?: string; expectedRange?: string } {
  if (!so) {
    return { valid: false, error: 'SO_NOT_FOUND', message: 'Sales Order not found' };
  }
  const prefix = so.product_qr_prefix || so.productQrPrefix;
  const start = so.product_serial_start != null ? Number(so.product_serial_start) : (so.productSerialStart != null ? Number(so.productSerialStart) : null);
  const end = so.product_serial_end != null ? Number(so.product_serial_end) : (so.productSerialEnd != null ? Number(so.productSerialEnd) : null);

  const soNum = so.so_number || so.id;

  if (!prefix || start === null || end === null || isNaN(start) || isNaN(end)) {
    return {
      valid: false,
      error: 'QR_RANGE_NOT_CONFIGURED',
      message: `Product QR range not configured for ${soNum}. Please edit Sales Order to configure QR range.`
    };
  }

  const code = rawCode.trim().toUpperCase();
  const normalizedPrefix = prefix.trim().toUpperCase();
  const expectedRange = `${normalizedPrefix}${start} to ${normalizedPrefix}${end}`;

  if (!code.startsWith(normalizedPrefix)) {
    return {
      valid: false,
      error: 'QR_OUT_OF_RANGE',
      message: `This product QR does not belong to ${soNum}.`,
      expectedRange
    };
  }

  const serialStr = code.slice(normalizedPrefix.length);
  if (!serialStr || !/^\d+$/.test(serialStr)) {
    return {
      valid: false,
      error: 'QR_OUT_OF_RANGE',
      message: `This product QR does not belong to ${soNum}.`,
      expectedRange
    };
  }

  const serialNum = parseInt(serialStr, 10);
  if (serialNum < start || serialNum > end) {
    return {
      valid: false,
      error: 'QR_OUT_OF_RANGE',
      message: `This product QR does not belong to ${soNum}.`,
      expectedRange
    };
  }

  return { valid: true, expectedRange };
}

// 0. POST /api/qc/scan
router.post('/qc/scan', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const rawCode = req.body.code || req.body.itemQr;
    const targetSoKey = req.body.salesOrderId || req.body.salesOrderNumber || null;
    if (!rawCode || typeof rawCode !== 'string') {
      return res.status(400).json({ error: 'INVALID_QR', message: 'Barcode is required' });
    }
    const code = rawCode.trim().toUpperCase();
    const so = await resolveSO(targetSoKey);

    const rangeCheck = validateProductQrRange(so, code);
    if (!rangeCheck.valid) {
      return res.status(400).json({
        error: rangeCheck.error,
        message: rangeCheck.message,
        expectedRange: rangeCheck.expectedRange
      });
    }

    const item = await db.prepare(`SELECT * FROM item_units WHERE UPPER(TRIM(qr_code)) = ?`).get(code) as any;
    if (item) {
      const existingPass = await db.prepare(`
        SELECT * FROM qc_results WHERE item_id = ? AND qc_result = 'PASS' AND test_result = 'PASS'
      `).get(item.id) as any;

      if (existingPass || item.status === 'QC_PASSED' || item.status === 'PACKED') {
        return res.json({
          status: 'DUPLICATE',
          message: 'Already processed QC',
          item: { qr_code: item.qr_code, size: item.size || 'L' }
        });
      }
    }

    // Capacity Check
    if (so) {
      const admittedCount = await getSOAdmittedItemCount(so.id);
      const isAlreadyAdmitted = item && (await isItemAdmitted(item.id));
      if (!isAlreadyAdmitted && admittedCount >= so.order_quantity) {
        return res.status(400).json({
          error: 'SO_QUANTITY_REACHED',
          message: `This sales order already has ${so.order_quantity} of ${so.order_quantity} pieces registered for QC.`
        });
      }
    }

    const progress = so ? await calculateSOProgress(so.id) : undefined;
    return res.json({
      status: 'VALID',
      message: 'Barcode valid for QC',
      item: item ? { qr_code: item.qr_code, size: item.size || 'L' } : { qr_code: code, size: 'L' },
      progress
    });
  } catch (err) {
    next(err);
  }
});

// Helper to update SO and PO completion status
async function checkAndUpdateSOCompletion(soId: string) {
  const so = await db.prepare(`SELECT * FROM sales_orders WHERE id = ?`).get(soId) as any;
  if (!so) return;

  const qcPassedRow = await db.prepare(`
    SELECT COUNT(DISTINCT iu.id) as cnt FROM qc_results qr
    JOIN item_units iu ON iu.id = qr.item_id
    WHERE iu.sales_order_id = ? AND qr.qc_result = 'PASS' AND qr.test_result = 'PASS'
  `).get(so.id) as any;
  const qcPassed = qcPassedRow?.cnt || 0;

  const packedRow = await db.prepare(`
    SELECT COUNT(DISTINCT bi.item_id) as cnt FROM box_items bi
    JOIN boxes b ON b.id = bi.box_id
    WHERE b.sales_order_id = ? AND bi.active = 1
  `).get(so.id) as any;
  const packed = packedRow?.cnt || 0;

  if (qcPassed >= so.order_quantity && packed >= so.order_quantity) {
    await db.prepare(`UPDATE sales_orders SET status = 'COMPLETED', updated_at = NOW(3) WHERE id = ?`).run(so.id);

    const remainingSo = await db.prepare(`
      SELECT COUNT(*) as cnt FROM sales_orders 
      WHERE production_order_id = ? AND status != 'COMPLETED'
    `).get(so.production_order_id) as any;

    if (remainingSo && remainingSo.cnt === 0) {
      await db.prepare(`UPDATE production_orders SET status = 'COMPLETED', updated_at = NOW(3) WHERE id = ?`).run(so.production_order_id);
    }
  }
}

// Helper function for authoritative SO progress calculation
export async function calculateSOProgress(soId: string) {
  const so = await resolveSO(soId);
  if (!so) {
    return {
      targetQuantity: 0,
      inspectedUnique: 0,
      passedUnique: 0,
      failedUnique: 0,
      remainingToInspect: 0,
      remainingToPass: 0,
      isComplete: false,
      allAdmitted: false,
    };
  }

  const targetQuantity = so.order_quantity || 0;

  const passedRow = await db.prepare(`
    SELECT COUNT(DISTINCT iu.id) as cnt FROM qc_results qr
    JOIN item_units iu ON iu.id = qr.item_id
    WHERE iu.sales_order_id = ? AND qr.qc_result = 'PASS' AND qr.test_result = 'PASS'
  `).get(so.id) as any;
  const passedUnique = passedRow?.cnt || 0;

  const failedRow = await db.prepare(`
    SELECT COUNT(DISTINCT iu.id) as cnt FROM qc_fail_log qf
    JOIN item_units iu ON iu.id = qf.item_id
    WHERE iu.sales_order_id = ? AND iu.status != 'QC_PASSED' AND iu.status != 'PACKED'
  `).get(so.id) as any;
  const failedUnique = failedRow?.cnt || 0;

  const inspectedRow = await db.prepare(`
    SELECT COUNT(DISTINCT item_id) as cnt FROM (
      SELECT qr.item_id FROM qc_results qr
      JOIN item_units iu ON iu.id = qr.item_id
      WHERE iu.sales_order_id = ?
      UNION
      SELECT qf.item_id FROM qc_fail_log qf
      JOIN item_units iu ON iu.id = qf.item_id
      WHERE iu.sales_order_id = ?
    ) as combined
  `).get(so.id, so.id) as any;
  const inspectedUnique = inspectedRow?.cnt || 0;

  const remainingToInspect = Math.max(0, targetQuantity - inspectedUnique);
  const remainingToPass = Math.max(0, targetQuantity - passedUnique);
  const isComplete = passedUnique >= targetQuantity;
  const allAdmitted = inspectedUnique >= targetQuantity;

  return {
    soId: so.id,
    soNumber: so.so_number,
    targetQuantity,
    inspectedUnique,
    passedUnique,
    failedUnique,
    remainingToInspect,
    remainingToPass,
    isComplete,
    allAdmitted
  };
}

// GET /api/qc/progress/:soId - Authoritative SO QC Progress Query
router.get('/qc/progress/:soId', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const soId = req.params.soId;
    const progress = await calculateSOProgress(soId);
    return res.json(progress);
  } catch (err) {
    next(err);
  }
});

// 1. POST /api/qc/results
const qcResultSchema = z.object({
  idempotencyKey: z.string().optional(),
  itemQr: z.string().min(1),
  salesOrderNumber: z.string().optional(),
  salesOrderId: z.string().optional(),
  qcResult: z.enum(['PASS', 'FAIL']),
  testResult: z.enum(['PASS', 'FAIL']),
  failureReason: z.string().optional()
});

router.post('/qc/results', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const parsed = qcResultSchema.parse(req.body);
    const idempotencyKey = parsed.idempotencyKey;
    const itemQr = parsed.itemQr.trim().toUpperCase();
    const targetSoKey = parsed.salesOrderId || parsed.salesOrderNumber || null;
    const qcResult = parsed.qcResult;
    const testResult = parsed.testResult;
    const failureReason = parsed.failureReason;

    const operatorId = req.user!.id;
    const userRole = req.user!.role;

    const so = await resolveSO(targetSoKey);
    if (!so) {
      return res.status(404).json({ error: 'SO_NOT_FOUND', message: 'Sales Order not found' });
    }

    const rangeCheck = validateProductQrRange(so, itemQr);
    if (!rangeCheck.valid) {
      await recordScanEvent(idempotencyKey || '', operatorId, 'QC_TEST', itemQr, 'REJECTED', rangeCheck.error, rangeCheck.message);
      return res.status(400).json({
        error: rangeCheck.error,
        message: rangeCheck.message,
        expectedRange: rangeCheck.expectedRange
      });
    }

    if (idempotencyKey) {
      const existing = await checkIdempotency(idempotencyKey, operatorId, 'QC_TEST', itemQr);
      if (existing && existing.result === 'ACCEPTED') {
        const progress = await calculateSOProgress(so.id);
        return res.json({ status: 'DUPLICATE_PROCESSED', message: 'Scan already processed idempotently.', progress });
      }
    }

    // Operator scoping check
    if (!(await checkOperatorAllocation(operatorId, userRole, so.id))) {
      return res.status(403).json({
        error: 'OPERATOR_UNAUTHORIZED',
        message: `Operator ${req.user!.username} is not allocated to Sales Order ${so.so_number}`
      });
    }

    let item = await db.prepare(`SELECT * FROM item_units WHERE UPPER(TRIM(qr_code)) = ?`).get(itemQr) as any;
    if (!item) {
      const admittedCount = await getSOAdmittedItemCount(so.id);
      if (admittedCount >= so.order_quantity) {
        return res.status(400).json({
          error: 'SO_QUANTITY_REACHED',
          message: `This sales order already has ${so.order_quantity} of ${so.order_quantity} pieces registered for QC.`
        });
      }

      const itemId = `itm-${itemQr}`;
      await db.prepare(`
        INSERT INTO item_units (id, qr_code, sales_order_id, size, status, created_at, updated_at)
        VALUES (?, ?, ?, 'L', 'CREATED', NOW(3), NOW(3))
      `).run(itemId, itemQr, so.id);
      item = { id: itemId, qr_code: itemQr, sales_order_id: so.id, status: 'CREATED' };
    } else {
      const isAlreadyAdmitted = await isItemAdmitted(item.id);
      if (!isAlreadyAdmitted) {
        const admittedCount = await getSOAdmittedItemCount(so.id);
        if (admittedCount >= so.order_quantity) {
          return res.status(400).json({
            error: 'SO_QUANTITY_REACHED',
            message: `This sales order already has ${so.order_quantity} of ${so.order_quantity} pieces registered for QC.`
          });
        }
      }
      await db.prepare(`UPDATE item_units SET sales_order_id = ?, updated_at = NOW(3) WHERE id = ?`).run(so.id, item.id);
      item.sales_order_id = so.id;
    }

    const isPass = qcResult === 'PASS' && testResult === 'PASS';
    const existingQc = await db.prepare(`SELECT * FROM qc_results WHERE item_id = ?`).get(item.id) as any;

    const isAlreadyPassed = item.status === 'QC_PASSED' || item.status === 'PACKED' || (existingQc && existingQc.qc_result === 'PASS' && existingQc.test_result === 'PASS');

    if (isAlreadyPassed && isPass) {
      await recordScanEvent(idempotencyKey || '', operatorId, 'QC_TEST', itemQr, 'DUPLICATE');
      const progress = await calculateSOProgress(so.id);
      return res.status(200).json({
        message: `Item ${itemQr} is already QC Passed (Duplicate Scan).`,
        itemQr,
        status: item.status || 'QC_PASSED',
        isDuplicate: true,
        progress
      });
    }

    const finalItemStatus = isPass ? 'QC_PASSED' : 'QC_FAILED';
    const existingFailsRow = await db.prepare(`SELECT COUNT(*) as cnt FROM qc_fail_log WHERE item_id = ?`).get(item.id) as any;
    const existingFails = existingFailsRow?.cnt || 0;
    let failCount = existingFails;
    let retryCount = 0;

    await db.transaction(async (tx) => {
      if (!isPass) {
        failCount += 1;
        const failLogId = `qcfail-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
        await tx.prepare(`
          INSERT INTO qc_fail_log (id, item_id, operator_id, qc_result, test_result, failure_reason, attempt_number, scanned_at, idempotency_key, raw_qr, so_id, po_id, shift_id, failure_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3), ?, ?, ?, ?, ?, 'QC_FAIL')
        `).run(failLogId, item.id, operatorId, qcResult, testResult, failureReason || null, failCount, idempotencyKey || null, itemQr, so.id, so.production_order_id, so.shift_id);

        const alertId = `alt-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
        await tx.prepare(`
          INSERT INTO alerts (id, user_id, role_target, category, severity, title, message, reference_type, reference_id, created_at)
          VALUES (?, NULL, 'SUPERVISOR', 'QUALITY', 'WARNING', 'QC Test Failure Alert', ?, 'qc_fail_log', ?, NOW(3))
        `).run(alertId, `QC failed for item ${itemQr} on SO ${so.so_number} (Reason: ${failureReason || 'Defect detected'})`, failLogId);
      }

      if (existingQc) {
        retryCount = (existingQc.retry_count || 0) + 1;
        await tx.prepare(`
          UPDATE qc_results 
          SET operator_id = ?, qc_result = ?, test_result = ?, failure_reason = ?, retry_count = ?, scanned_at = NOW(3)
          WHERE item_id = ?
        `).run(operatorId, qcResult, testResult, failureReason || null, retryCount, item.id);
      } else {
        retryCount = 0;
        const qcId = `qc-${Date.now()}`;
        await tx.prepare(`
          INSERT INTO qc_results (id, item_id, operator_id, qc_result, test_result, failure_reason, retry_count, first_scanned_at, scanned_at)
          VALUES (?, ?, ?, ?, ?, ?, 0, NOW(3), NOW(3))
        `).run(qcId, item.id, operatorId, qcResult, testResult, failureReason || null);
      }

      await tx.prepare(`UPDATE item_units SET status = ?, updated_at = NOW(3) WHERE id = ?`).run(finalItemStatus, item.id);
    });

    await recordScanEvent(idempotencyKey || '', operatorId, 'QC_TEST', itemQr, 'ACCEPTED');
    await auditLog(operatorId, 'QC_RESULT_SAVED', 'item_units', item.id, { qcResult, testResult, retryCount, failCount });

    await checkAndUpdateSOCompletion(so.id);

    const progress = await calculateSOProgress(so.id);

    return res.status(200).json({
      message: isPass ? (retryCount > 0 ? `QC Passed after ${retryCount} attempt(s)!` : 'QC Passed!') : `QC Failed (Attempt #${failCount})`,
      itemQr,
      status: finalItemStatus,
      retryCount,
      totalFails: failCount,
      progress
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/qc/history/:itemQr - fetch full test attempt history and fail log for a QR
router.get('/qc/history/:itemQr', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const itemQr = req.params.itemQr;
    const item = await db.prepare(`SELECT * FROM item_units WHERE qr_code = ?`).get(itemQr) as any;
    if (!item) {
      return res.status(404).json({ error: 'ITEM_NOT_FOUND', message: 'Item not found' });
    }

    const currentResult = await db.prepare(`SELECT * FROM qc_results WHERE item_id = ?`).get(item.id) as any;
    const failLogs = await db.prepare(`
      SELECT f.*, u.full_name as operator_name 
      FROM qc_fail_log f 
      LEFT JOIN users u ON f.operator_id = u.id 
      WHERE f.item_id = ? 
      ORDER BY f.attempt_number ASC
    `).all(item.id) as any[];

    return res.json({
      itemQr,
      itemId: item.id,
      status: item.status,
      currentResult: currentResult || null,
      failCount: failLogs.length,
      retryCount: currentResult?.retry_count || 0,
      history: failLogs
    });
  } catch (err) {
    next(err);
  }
});

export type AuthorizedBoxResult =
  | { error: string; status: number; message: string }
  | { box: any };

// Helper to format and check authorized box details
export async function getAuthorizedBoxDetails(box: any, operatorId: string, role: string): Promise<AuthorizedBoxResult> {
  if (!(await checkOperatorAllocation(operatorId, role, box.sales_order_id))) {
    return { error: 'OPERATOR_UNAUTHORIZED', status: 403, message: 'Operator is not authorized to access boxes for this Sales Order.' };
  }

  const po = await db.prepare(`SELECT id, po_number FROM production_orders WHERE id = ?`).get(box.production_order_id) as any;
  const so = await db.prepare(`SELECT id, so_number FROM sales_orders WHERE id = ?`).get(box.sales_order_id) as any;

  const activeItems = await db.prepare(`
    SELECT bi.id as box_item_id, bi.packed_at, u.id as item_id, u.qr_code, u.size, u.status
    FROM box_items bi
    JOIN item_units u ON u.id = bi.item_id
    WHERE bi.box_id = ? AND bi.active = 1
  `).all(box.id) as any[];

  const activeCount = activeItems.length;
  const availableSpace = Math.max(0, box.capacity - activeCount);

  return {
    box: {
      id: box.id,
      boxCode: box.box_code || box.box_number,
      boxNumber: box.box_number || box.box_code,
      productionOrderId: box.production_order_id,
      poNumber: po?.po_number || '',
      salesOrderId: box.sales_order_id,
      soNumber: so?.so_number || '',
      capacity: box.capacity,
      activeCount,
      availableSpace,
      status: box.status,
      items: activeItems
    }
  };
}

// 2. GET /api/boxes/by-code/:boxCode - Strict Scanned Box QR Lookup Endpoint
router.get('/boxes/by-code/:boxCode', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const rawCode = req.params.boxCode;
    if (!rawCode) {
      return res.status(400).json({ error: 'INVALID_CODE', message: 'Box code is required' });
    }
    const boxCode = rawCode.trim().toUpperCase();

    const box = await db.prepare(`SELECT * FROM boxes WHERE UPPER(TRIM(box_code)) = ?`).get(boxCode) as any;
    if (!box) {
      return res.status(404).json({ error: 'BOX_NOT_FOUND', message: `Box with code '${boxCode}' not found.` });
    }

    const result = await getAuthorizedBoxDetails(box, req.user!.id, req.user!.role);
    if ('error' in result) {
      return res.status(result.status).json({ error: result.error, message: result.message });
    }

    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// 2b. POST /api/boxes/resolve - Secure Box Resolver for QR or Manual Input
const resolveBoxSchema = z.object({
  value: z.string().optional(),
  boxCode: z.string().optional(),
  boxNumber: z.string().optional()
});

router.post('/boxes/resolve', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const parsed = resolveBoxSchema.parse(req.body);
    const rawVal = parsed.value || parsed.boxCode || parsed.boxNumber;
    if (!rawVal || typeof rawVal !== 'string' || !rawVal.trim()) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Box code or box number is required' });
    }
    const val = rawVal.trim().toUpperCase();

    // 1. Try exact match on box_code
    const codeMatches = await db.prepare(`SELECT * FROM boxes WHERE UPPER(TRIM(box_code)) = ?`).all(val) as any[];
    let box: any = null;

    if (codeMatches.length > 1) {
      return res.status(409).json({
        error: 'AMBIGUOUS_BOX_IDENTIFIER',
        message: `Ambiguous identifier '${val}'. Multiple boxes match this code. Please scan the exact box QR.`
      });
    } else if (codeMatches.length === 1) {
      box = codeMatches[0];
    } else {
      // 2. Try exact match on box_number if not found by box_code
      const numMatches = await db.prepare(`SELECT * FROM boxes WHERE UPPER(TRIM(box_number)) = ?`).all(val) as any[];
      if (numMatches.length > 1) {
        return res.status(409).json({
          error: 'AMBIGUOUS_BOX_IDENTIFIER',
          message: `Ambiguous identifier '${val}'. Multiple boxes match this box number. Please scan the exact box QR.`
        });
      } else if (numMatches.length === 1) {
        box = numMatches[0];
      }
    }

    if (!box) {
      return res.status(404).json({ error: 'BOX_NOT_FOUND', message: `Box '${val}' not found.` });
    }

    const result = await getAuthorizedBoxDetails(box, req.user!.id, req.user!.role);
    if ('error' in result) {
      return res.status(result.status).json({ error: result.error, message: result.message });
    }

    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// 3. POST /api/packing/items/scan
const packItemSchema = z.object({
  idempotencyKey: z.string().optional(),
  boxNumber: z.string().min(1),
  itemQr: z.string().min(1),
  salesOrderNumber: z.string().min(1)
});

router.post('/packing/items/scan', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const { idempotencyKey, boxNumber, itemQr, salesOrderNumber } = packItemSchema.parse(req.body);
    const operatorId = req.user!.id;

    let so = await db.prepare(`SELECT id, production_order_id FROM sales_orders WHERE so_number = ? OR id = ?`).get(salesOrderNumber, salesOrderNumber) as any;
    if (!so) {
      so = await db.prepare(`SELECT id, production_order_id FROM sales_orders ORDER BY created_at DESC LIMIT 1`).get() as any;
    }
    if (!so) {
      return res.status(404).json({ error: 'SO_NOT_FOUND', message: 'Sales order not found for packing.' });
    }

    let box = await db.prepare(`SELECT * FROM boxes WHERE UPPER(TRIM(box_code)) = ? OR UPPER(TRIM(box_number)) = ?`).get(boxNumber.trim().toUpperCase(), boxNumber.trim().toUpperCase()) as any;
    if (!box) {
      const boxId = `box-${Date.now()}`;
      const code = boxNumber.trim().toUpperCase();
      await db.prepare(`
        INSERT INTO boxes (id, box_code, box_number, production_order_id, sales_order_id, capacity, status, created_at)
        VALUES (?, ?, ?, ?, ?, 12, 'OPEN', NOW(3))
      `).run(boxId, code, code, so.production_order_id, so.id);
      box = { id: boxId, box_code: code, box_number: code, production_order_id: so.production_order_id, sales_order_id: so.id, capacity: 12, status: 'OPEN' };
    }

    const currentItemsCountRow = await db.prepare(`SELECT COUNT(*) as cnt FROM box_items WHERE box_id = ? AND active = 1`).get(box.id) as any;
    const currentItemsCount = currentItemsCountRow?.cnt || 0;
    if (currentItemsCount >= box.capacity) {
      await recordScanEvent(idempotencyKey || '', operatorId, 'PACKING', itemQr, 'REJECTED', 'BOX_FULL', 'Box capacity reached');
      return res.status(400).json({ error: 'BOX_FULL', message: `Box ${boxNumber} is already full (${box.capacity}/${box.capacity}).` });
    }

    let item = await db.prepare(`SELECT * FROM item_units WHERE qr_code = ?`).get(itemQr) as any;
    if (!item) {
      return res.status(400).json({
        error: 'NOT_QC_PASSED',
        message: `Item ${itemQr} has not been created or passed QC.`
      });
    }

    const qcResult = await db.prepare(`SELECT * FROM qc_results WHERE item_id = ? AND qc_result = 'PASS' AND test_result = 'PASS'`).get(item.id);
    if (item.status !== 'QC_PASSED' && item.status !== 'PACKED' && !qcResult) {
      return res.status(400).json({
        error: 'NOT_QC_PASSED',
        message: `Item ${itemQr} must pass QC test before packing.`
      });
    }

    if (item.sales_order_id !== box.sales_order_id) {
      return res.status(400).json({
        error: 'SO_MISMATCH',
        message: `Item ${itemQr} belongs to a different Sales Order than Box ${boxNumber}.`
      });
    }

    const existingActivePack = await db.prepare(`
      SELECT bi.*, b.box_code, b.box_number 
      FROM box_items bi 
      JOIN boxes b ON b.id = bi.box_id 
      WHERE bi.item_id = ? AND bi.active = 1
    `).get(item.id) as any;

    if (existingActivePack) {
      if (existingActivePack.box_id === box.id) {
        await recordScanEvent(idempotencyKey || '', operatorId, 'PACKING', itemQr, 'DUPLICATE', 'ALREADY_PACKED', 'Item already packed in this box');
        return res.status(200).json({
          message: `Item ${itemQr} is already packed in box ${boxNumber}`,
          boxNumber,
          itemCount: currentItemsCount,
          capacity: box.capacity,
          isDuplicate: true
        });
      } else {
        await recordScanEvent(idempotencyKey || '', operatorId, 'PACKING', itemQr, 'REJECTED', 'ALREADY_PACKED_OTHER', 'Item already packed in another box');
        return res.status(409).json({
          error: 'ALREADY_PACKED',
          message: `Item ${itemQr} is currently packed in Box ${existingActivePack.box_code || existingActivePack.box_number}. Use Box Transfer to move items.`
        });
      }
    }

    const boxItemId = `bi-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
    await db.transaction(async (tx) => {
      await tx.prepare(`
        INSERT INTO box_items (id, box_id, item_id, packed_by, packed_at, active)
        VALUES (?, ?, ?, ?, NOW(3), 1)
      `).run(boxItemId, box.id, item.id, operatorId);

      await tx.prepare(`UPDATE item_units SET status = 'PACKED', updated_at = NOW(3) WHERE id = ?`).run(item.id);

      if (currentItemsCount + 1 >= box.capacity) {
        await tx.prepare(`UPDATE boxes SET status = 'COMPLETE', completed_at = NOW(3) WHERE id = ?`).run(box.id);
      }
    });

    await recordScanEvent(idempotencyKey || '', operatorId, 'PACKING', itemQr, 'ACCEPTED');
    await auditLog(operatorId, 'PACK_ITEM', 'boxes', box.id, { itemQr, count: currentItemsCount + 1 });

    await checkAndUpdateSOCompletion(so.id);

    return res.status(201).json({
      message: `Item ${itemQr} packed into box ${boxNumber}`,
      boxNumber,
      itemCount: currentItemsCount + 1,
      capacity: box.capacity,
      isFull: currentItemsCount + 1 >= box.capacity
    });
  } catch (err) {
    next(err);
  }
});

// 4. POST /api/box-transfers — Pessimistic MySQL Transaction & Capacity Validation
const transferSchema = z.object({
  fromBoxNumber: z.string().min(1),
  toBoxNumber: z.string().min(1),
  itemQrs: z.array(z.string()).min(1),
  remarks: z.string().optional()
});

router.post('/box-transfers', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const { fromBoxNumber, toBoxNumber, itemQrs, remarks } = transferSchema.parse(req.body);
    const operatorId = req.user!.id;
    const role = req.user!.role;

    const fromCode = fromBoxNumber.trim().toUpperCase();
    const toCode = toBoxNumber.trim().toUpperCase();

    const fromBox = await db.prepare(`SELECT * FROM boxes WHERE UPPER(TRIM(box_code)) = ? OR UPPER(TRIM(box_number)) = ?`).get(fromCode, fromCode) as any;
    const toBox = await db.prepare(`SELECT * FROM boxes WHERE UPPER(TRIM(box_code)) = ? OR UPPER(TRIM(box_number)) = ?`).get(toCode, toCode) as any;

    if (!fromBox || !toBox) {
      return res.status(404).json({ error: 'BOX_NOT_FOUND', message: 'Source or destination box not found' });
    }

    // Validation 1: SAME_BOX check
    if (fromBox.id === toBox.id) {
      return res.status(400).json({ error: 'SAME_BOX', message: 'Source and destination box cannot be the same box.' });
    }

    // Validation 2: Operator Authorization Check
    if (!(await checkOperatorAllocation(operatorId, role, fromBox.sales_order_id))) {
      return res.status(403).json({
        error: 'OPERATOR_UNAUTHORIZED',
        message: 'Operator is not authorized to transfer products for this Sales Order.'
      });
    }

    // Validation 3: PO Mismatch
    if (fromBox.production_order_id && toBox.production_order_id && fromBox.production_order_id !== toBox.production_order_id) {
      return res.status(400).json({ error: 'PO_MISMATCH', message: 'Source and destination boxes belong to different Production Orders.' });
    }

    // Validation 4: SO Mismatch
    if (fromBox.sales_order_id !== toBox.sales_order_id) {
      return res.status(400).json({ error: 'SO_MISMATCH', message: 'Source and destination boxes belong to different Sales Orders.' });
    }

    const transferId = `trf-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
    let updatedSourceCount = 0;
    let updatedDestCount = 0;

    // MySQL Transaction with SELECT ... FOR UPDATE pessimistic row locking
    await db.transaction(async (tx) => {
      // Lock source and destination box rows
      await tx.query(`SELECT * FROM boxes WHERE id = ? FOR UPDATE`, [fromBox.id]);
      await tx.query(`SELECT * FROM boxes WHERE id = ? FOR UPDATE`, [toBox.id]);

      // Lock and count current occupied destination capacity inside transaction
      const destCountRow = await tx.queryOne<{ cnt: number }>(`
        SELECT COUNT(*) as cnt FROM box_items WHERE box_id = ? AND active = 1 FOR UPDATE
      `, [toBox.id]);
      const destOccupied = destCountRow?.cnt || 0;
      const availableSpace = Math.max(0, toBox.capacity - destOccupied);

      // Validation 5: DESTINATION_BOX_CAPACITY_EXCEEDED
      if (itemQrs.length > availableSpace) {
        throw {
          statusCode: 400,
          code: 'DESTINATION_BOX_CAPACITY_EXCEEDED',
          message: `Destination box capacity exceeded. Maximum transferable slots: ${availableSpace}`
        };
      }

      // Record box_transfers row
      await tx.prepare(`
        INSERT INTO box_transfers (id, source_box_id, destination_box_id, production_order_id, sales_order_id, transferred_by, item_count, transferred_at, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3), ?)
      `).run(transferId, fromBox.id, toBox.id, fromBox.production_order_id, fromBox.sales_order_id, operatorId, itemQrs.length, remarks || null);

      for (const qr of itemQrs) {
        const cleanQr = qr.trim().toUpperCase();
        // Lock selected active box item
        const activeBoxItem = await tx.queryOne<any>(`
          SELECT bi.* FROM box_items bi
          JOIN item_units iu ON iu.id = bi.item_id
          WHERE bi.box_id = ? AND UPPER(TRIM(iu.qr_code)) = ? AND bi.active = 1
          FOR UPDATE
        `, [fromBox.id, cleanQr]);

        if (activeBoxItem) {
          // Deactivate source box_item
          await tx.prepare(`UPDATE box_items SET active = 0 WHERE id = ?`).run(activeBoxItem.id);

          // Insert active destination box_item
          const newBoxItemId = `bi-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
          await tx.prepare(`
            INSERT INTO box_items (id, box_id, item_id, packed_by, packed_at, active)
            VALUES (?, ?, ?, ?, NOW(3), 1)
          `).run(newBoxItemId, toBox.id, activeBoxItem.item_id, operatorId);

          // Record box_transfer_items
          const trfItemId = `trfi-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
          await tx.prepare(`
            INSERT INTO box_transfer_items (id, transfer_id, item_id, source_box_item_id, destination_box_item_id, transferred_at)
            VALUES (?, ?, ?, ?, ?, NOW(3))
          `).run(trfItemId, transferId, activeBoxItem.item_id, activeBoxItem.id, newBoxItemId);
        }
      }

      // Calculate final active counts
      const srcFinalRow = await tx.queryOne<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM box_items WHERE box_id = ? AND active = 1`, [fromBox.id]);
      const destFinalRow = await tx.queryOne<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM box_items WHERE box_id = ? AND active = 1`, [toBox.id]);
      updatedSourceCount = srcFinalRow?.cnt || 0;
      updatedDestCount = destFinalRow?.cnt || 0;
    });

    // Post-transfer AQL alert check (if source had completed AQL)
    const sourceAql = await db.prepare(`SELECT * FROM aql_inspections WHERE box_id = ? AND result IN ('PASSED', 'FAILED')`).get(fromBox.id) as any;
    if (sourceAql) {
      const alertId = `alt-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
      await db.prepare(`
        INSERT INTO alerts (id, user_id, role_target, category, severity, title, message, reference_type, reference_id, created_at)
        VALUES (?, NULL, 'SUPERVISOR', 'QUALITY', 'INFO', 'Box Transfer Post-AQL', ?, 'box_transfers', ?, NOW(3))
      `).run(alertId, `Items were transferred from Box ${fromBox.box_code || fromBox.box_number} after AQL completion. Destination Box requires AQL review.`, transferId);
    }

    await auditLog(operatorId, 'BOX_TRANSFER', 'box_transfers', transferId, { fromBoxNumber, toBoxNumber, count: itemQrs.length });

    return res.status(201).json({
      message: `Transferred ${itemQrs.length} items from ${fromBox.box_code || fromBox.box_number} to ${toBox.box_code || toBox.box_number}`,
      transferId,
      sourceActiveCount: updatedSourceCount,
      destinationActiveCount: updatedDestCount
    });
  } catch (err) {
    next(err);
  }
});

// 5. POST /api/aql/boxes/scan - Scan box for AQL and set required samples = total items in box
router.post('/aql/boxes/scan', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const { boxNumber } = req.body;
    const operatorId = req.user!.id;

    let box = await db.prepare(`SELECT * FROM boxes WHERE UPPER(TRIM(box_code)) = ? OR UPPER(TRIM(box_number)) = ?`).get(boxNumber.trim().toUpperCase(), boxNumber.trim().toUpperCase()) as any;
    if (!box) {
      return res.status(404).json({ error: 'BOX_NOT_FOUND', message: `Box ${boxNumber} not found.` });
    }

    let items = await db.prepare(`
      SELECT u.id, u.qr_code, u.size, u.status 
      FROM box_items bi 
      JOIN item_units u ON bi.item_id = u.id 
      WHERE bi.box_id = ? AND bi.active = 1
    `).all(box.id) as any[];

    const totalItems = items.length;
    const inspectionId = `aql-${Date.now()}`;

    await db.prepare(`
      INSERT INTO aql_inspections (id, box_id, sales_order_id, inspector_id, required_samples, result, started_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING', NOW(3))
    `).run(inspectionId, box.id, box.sales_order_id, operatorId, totalItems > 0 ? totalItems : 3);

    return res.json({
      box: {
        box_number: box.box_code || box.box_number,
        sales_order_id: box.sales_order_id,
        item_count: totalItems,
        items
      },
      inspectionId,
      requiredSamples: totalItems > 0 ? totalItems : 3
    });
  } catch (err) {
    next(err);
  }
});

// 6. POST /api/aql/inspections/:id/samples - Record individual sample test
router.post('/aql/inspections/:id/samples', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const inspectionId = req.params.id;
    const { sampleNumber, itemQr, result } = req.body;

    const insp = await db.prepare(`SELECT * FROM aql_inspections WHERE id = ?`).get(inspectionId) as any;
    if (!insp) {
      return res.status(404).json({ error: 'INSPECTION_NOT_FOUND', message: 'AQL inspection record not found' });
    }

    let item = await db.prepare(`SELECT * FROM item_units WHERE qr_code = ?`).get(itemQr) as any;
    if (!item) {
      return res.status(404).json({ error: 'ITEM_NOT_FOUND', message: 'Item unit not found' });
    }

    // AQL Rule: Sampled product MUST exist in scanned box's active box_items
    const inBox = await db.prepare(`SELECT * FROM box_items WHERE box_id = ? AND item_id = ? AND active = 1`).get(insp.box_id, item.id);
    if (!inBox) {
      return res.status(400).json({
        error: 'ITEM_NOT_IN_BOX',
        message: `Sample barcode (${itemQr}) does not belong to the scanned box.`
      });
    }

    const sampleId = `aqls-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
    await db.prepare(`
      INSERT INTO aql_samples (id, inspection_id, item_id, sample_number, result, scanned_at)
      VALUES (?, ?, ?, ?, ?, NOW(3))
      ON DUPLICATE KEY UPDATE result = VALUES(result), scanned_at = NOW(3)
    `).run(sampleId, inspectionId, item.id, sampleNumber, result);

    return res.json({ message: 'Sample recorded', sampleNumber, result, itemQr });
  } catch (err) {
    next(err);
  }
});

// 7. POST /api/aql/inspections/direct-complete - Direct complete endpoint when no inspectionId exists
router.post('/api/aql/inspections/direct-complete', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const { boxNumber, result, failureReason } = req.body;
    const operatorId = req.user!.id;

    let box = await db.prepare(`SELECT * FROM boxes WHERE UPPER(TRIM(box_code)) = ? OR UPPER(TRIM(box_number)) = ?`).get(boxNumber.trim().toUpperCase(), boxNumber.trim().toUpperCase()) as any;
    if (!box) {
      return res.status(404).json({ error: 'BOX_NOT_FOUND', message: 'Box not found' });
    }

    const inspectionId = `aql-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
    await db.prepare(`
      INSERT INTO aql_inspections (id, box_id, sales_order_id, inspector_id, required_samples, result, failure_reason, started_at, completed_at)
      VALUES (?, ?, ?, ?, 12, ?, ?, NOW(3), NOW(3))
    `).run(inspectionId, box.id, box.sales_order_id, operatorId, result, failureReason || null);

    const boxStatus = result === 'PASSED' ? 'AQL_PASSED' : 'AQL_FAILED';
    await db.prepare(`UPDATE boxes SET status = ?, completed_at = NOW(3) WHERE id = ?`).run(boxStatus, box.id);

    return res.json({ message: 'AQL Direct Complete finalized', inspectionId, result });
  } catch (err) {
    next(err);
  }
});

// 8. POST /api/aql/inspections/:id/complete - Finalize AQL inspection result
router.post('/aql/inspections/:id/complete', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    let inspectionId = req.params.id;
    const { result, failureReason, boxNumber } = req.body;
    const operatorId = req.user!.id;

    let insp = await db.prepare(`SELECT * FROM aql_inspections WHERE id = ?`).get(inspectionId) as any;
    if (!insp) {
      let box = boxNumber ? await db.prepare(`SELECT * FROM boxes WHERE UPPER(TRIM(box_code)) = ? OR UPPER(TRIM(box_number)) = ?`).get(boxNumber.trim().toUpperCase(), boxNumber.trim().toUpperCase()) as any : null;
      if (!box) {
        return res.status(404).json({ error: 'BOX_NOT_FOUND', message: 'Box not found' });
      }

      await db.prepare(`
        INSERT INTO aql_inspections (id, box_id, sales_order_id, inspector_id, required_samples, result, failure_reason, started_at, completed_at)
        VALUES (?, ?, ?, ?, 12, ?, ?, NOW(3), NOW(3))
      `).run(inspectionId, box.id, box.sales_order_id, operatorId, result, failureReason || null);
      insp = { id: inspectionId, box_id: box.id };
    } else {
      await db.prepare(`
        UPDATE aql_inspections 
        SET result = ?, failure_reason = ?, completed_at = NOW(3) 
        WHERE id = ?
      `).run(result, failureReason || null, inspectionId);
    }

    const boxStatus = result === 'PASSED' ? 'AQL_PASSED' : 'AQL_FAILED';
    if (insp.box_id) {
      await db.prepare(`UPDATE boxes SET status = ?, completed_at = NOW(3) WHERE id = ?`).run(boxStatus, insp.box_id);
    }

    return res.json({ message: 'AQL Inspection finalized', inspectionId, result });
  } catch (err) {
    next(err);
  }
});

export default router;
