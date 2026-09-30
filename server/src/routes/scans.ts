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

// Helper to resolve PO safely from PO ID, po_number, map_po, or legacy SO key
export async function resolvePO(poKey?: string | null) {
  if (!poKey) {
    return db.prepare(`SELECT * FROM production_orders ORDER BY created_at DESC LIMIT 1`).get() as any;
  }
  let po = await db.prepare(`SELECT * FROM production_orders WHERE id = ? OR po_number = ? OR map_po = ?`).get(poKey, poKey, poKey) as any;
  if (!po) {
    const so = await db.prepare(`SELECT production_order_id FROM sales_orders WHERE id = ? OR so_number = ? OR map_so = ?`).get(poKey, poKey, poKey) as any;
    if (so) {
      po = await db.prepare(`SELECT * FROM production_orders WHERE id = ?`).get(so.production_order_id) as any;
    }
  }
  if (!po) {
    po = await db.prepare(`SELECT * FROM production_orders ORDER BY created_at DESC LIMIT 1`).get() as any;
  }
  return po;
}

// Legacy helper for backward compatibility
export async function resolveSO(soKey?: string | null) {
  const po = await resolvePO(soKey);
  if (!po) return null;
  const so = await db.prepare(`SELECT * FROM sales_orders WHERE production_order_id = ? LIMIT 1`).get(po.id) as any;
  return so || { id: po.id, production_order_id: po.id, so_number: po.po_number, map_so: po.map_po, order_quantity: 1000 };
}

// Helper for operator allocation check on PO level
export async function checkOperatorAllocationForPO(operatorId: string, role: string, poId: string): Promise<boolean> {
  if (role === 'SUPERVISOR' || role === 'ADMIN') return true;

  const row = await db.prepare(`
    SELECT COUNT(*) as cnt FROM operator_work_assignments
    WHERE (production_order_id = ? OR sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
      AND operator_id = ? AND active = 1
  `).get(poId, poId, operatorId) as any;

  return !!(row && row.cnt > 0);
}

// Backward-compatible allocation helper
export async function checkOperatorAllocation(operatorId: string, role: string, soIdOrPoId: string): Promise<boolean> {
  return checkOperatorAllocationForPO(operatorId, role, soIdOrPoId);
}

// Helper to check if operation is enabled on PO level
export async function checkOperationEnabledForPO(poId: string, opName: string): Promise<boolean> {
  let dbOp = opName;
  if (opName === 'QC Test' || opName === 'QC' || opName === 'TEST') dbOp = 'QC_TEST';
  else if (opName === 'Packing' || opName === 'PACKING') dbOp = 'PACKING';
  else if (opName === 'AQL Checker' || opName === 'AQL') dbOp = 'AQL';
  else if (opName === 'Box Transfer' || opName === 'BOX_TRANSFER') dbOp = 'BOX_TRANSFER';

  const row = await db.prepare(`
    SELECT COUNT(*) as cnt FROM production_order_operations
    WHERE production_order_id = ? AND (operation = ? OR operation = ?)
  `).get(poId, opName, dbOp) as any;

  return !!(row && row.cnt > 0);
}

// Product QR Range Validation Helper for PO
export async function validateProductQrRangeForPO(po: any, rawCode: string): Promise<{ valid: boolean; config?: any; error?: string; message?: string; expectedRange?: string }> {
  if (!po) {
    return { valid: false, error: 'PO_NOT_FOUND', message: 'Production Order not found' };
  }
  const code = rawCode.trim().toUpperCase();

  // 1. Check production_order_configs
  const configs = await db.prepare(`SELECT * FROM production_order_configs WHERE production_order_id = ?`).all(po.id) as any[];

  for (const cfg of configs) {
    const prefix = cfg.product_qr_prefix.trim().toUpperCase();
    const start = Number(cfg.product_serial_start);
    const end = Number(cfg.product_serial_end);

    if (code.startsWith(prefix)) {
      const serialStr = code.slice(prefix.length);
      if (serialStr && /^\d+$/.test(serialStr)) {
        const serialNum = parseInt(serialStr, 10);
        if (serialNum >= start && serialNum <= end) {
          return { valid: true, config: cfg, expectedRange: `${prefix}${start} to ${prefix}${end}` };
        }
      }
    }
  }

  // 2. Check legacy sales_orders
  const soRows = await db.prepare(`
    SELECT * FROM sales_orders WHERE production_order_id = ? AND product_qr_prefix IS NOT NULL
  `).all(po.id) as any[];

  for (const so of soRows) {
    const prefix = (so.product_qr_prefix || '').trim().toUpperCase();
    const start = Number(so.product_serial_start);
    const end = Number(so.product_serial_end);

    if (prefix && !isNaN(start) && !isNaN(end) && code.startsWith(prefix)) {
      const serialStr = code.slice(prefix.length);
      if (serialStr && /^\d+$/.test(serialStr)) {
        const serialNum = parseInt(serialStr, 10);
        if (serialNum >= start && serialNum <= end) {
          return { valid: true, config: { id: null, config_code: so.so_number, product_qr_prefix: prefix, product_serial_start: start, product_serial_end: end }, expectedRange: `${prefix}${start} to ${prefix}${end}` };
        }
      }
    }
  }

  if (configs.length === 0 && soRows.length === 0) {
    return {
      valid: false,
      error: 'QR_RANGE_NOT_CONFIGURED',
      message: `Product QR range not configured for Production Order ${po.po_number || po.id}. Please edit PO to configure QR range.`
    };
  }

  const firstConfig = configs[0] || soRows[0];
  const prefixStr = firstConfig ? (firstConfig.product_qr_prefix || firstConfig.productQrPrefix) : '';
  const expectedRange = firstConfig ? `${prefixStr}${firstConfig.product_serial_start} to ${prefixStr}${firstConfig.product_serial_end}` : undefined;

  return {
    valid: false,
    error: 'QR_OUT_OF_RANGE',
    message: `This product QR does not belong to Production Order ${po.po_number || po.id}.`,
    expectedRange
  };
}

export function validateProductQrRange(targetObj: any, rawCode: string): { valid: boolean; config?: any; error?: string; message?: string; expectedRange?: string } {
  if (!targetObj) {
    return { valid: false, error: 'PO_NOT_FOUND', message: 'Target not found' };
  }
  const prefix = (targetObj.product_qr_prefix || targetObj.productQrPrefix || '').trim().toUpperCase();
  const start = Number(targetObj.product_serial_start ?? targetObj.productSerialStart);
  const end = Number(targetObj.product_serial_end ?? targetObj.productSerialEnd);

  if (!prefix || isNaN(start) || isNaN(end)) {
    return { valid: false, error: 'QR_RANGE_NOT_CONFIGURED', message: 'Product QR range not configured' };
  }

  const code = rawCode.trim().toUpperCase();
  const expectedRange = `${prefix}${start} to ${prefix}${end}`;

  if (!code.startsWith(prefix)) {
    return { valid: false, error: 'QR_OUT_OF_RANGE', message: 'QR prefix mismatch', expectedRange };
  }

  const serialStr = code.slice(prefix.length);
  if (!serialStr || !/^\d+$/.test(serialStr)) {
    return { valid: false, error: 'QR_OUT_OF_RANGE', message: 'Invalid serial format', expectedRange };
  }

  const serialNum = parseInt(serialStr, 10);
  if (serialNum >= start && serialNum <= end) {
    return { valid: true, expectedRange };
  }

  return { valid: false, error: 'QR_OUT_OF_RANGE', message: 'Serial number out of range', expectedRange };
}

export async function calculatePOProgress(poId: string) {
  const po = await resolvePO(poId);
  if (!po) {
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

  const configTotal = await db.prepare(`SELECT SUM(quantity) as sumQty FROM production_order_configs WHERE production_order_id = ?`).get(po.id) as any;
  let targetQuantity = configTotal?.sumQty ? Number(configTotal.sumQty) : 0;

  if (!targetQuantity) {
    const soTotal = await db.prepare(`SELECT SUM(order_quantity) as sumQty FROM sales_orders WHERE production_order_id = ?`).get(po.id) as any;
    targetQuantity = soTotal?.sumQty ? Number(soTotal.sumQty) : 1000;
  }

  const passedRow = await db.prepare(`
    SELECT COUNT(DISTINCT iu.id) as cnt FROM qc_results qr
    JOIN item_units iu ON iu.id = qr.item_id
    WHERE (iu.production_order_id = ? OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
      AND qr.qc_result = 'PASS' AND qr.test_result = 'PASS'
  `).get(po.id, po.id) as any;
  const passedUnique = passedRow?.cnt || 0;

  const failedRow = await db.prepare(`
    SELECT COUNT(DISTINCT iu.id) as cnt FROM qc_fail_log qf
    JOIN item_units iu ON iu.id = qf.item_id
    WHERE (iu.production_order_id = ? OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
      AND iu.status != 'QC_PASSED' AND iu.status != 'PACKED'
  `).get(po.id, po.id) as any;
  const failedUnique = failedRow?.cnt || 0;

  const inspectedRow = await db.prepare(`
    SELECT COUNT(DISTINCT item_id) as cnt FROM (
      SELECT qr.item_id FROM qc_results qr
      JOIN item_units iu ON iu.id = qr.item_id
      WHERE iu.production_order_id = ? OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?)
      UNION
      SELECT qf.item_id FROM qc_fail_log qf
      JOIN item_units iu ON iu.id = qf.item_id
      WHERE iu.production_order_id = ? OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?)
    ) as combined
  `).get(po.id, po.id, po.id, po.id) as any;
  const inspectedUnique = inspectedRow?.cnt || 0;

  const remainingToInspect = Math.max(0, targetQuantity - inspectedUnique);
  const remainingToPass = Math.max(0, targetQuantity - passedUnique);
  const isComplete = passedUnique >= targetQuantity;
  const allAdmitted = inspectedUnique >= targetQuantity;

  return {
    poId: po.id,
    poNumber: po.po_number,
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

export async function calculateSOProgress(soId: string) {
  return calculatePOProgress(soId);
}

// 0. POST /api/qc/scan
router.post('/qc/scan', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const rawCode = req.body.code || req.body.itemQr;
    const targetPoKey = req.body.productionOrderId || req.body.productionOrderNumber || req.body.poNumber || req.body.salesOrderId || req.body.salesOrderNumber || null;
    if (!rawCode || typeof rawCode !== 'string') {
      return res.status(400).json({ error: 'INVALID_QR', message: 'Barcode is required' });
    }
    const code = rawCode.trim().toUpperCase();
    const po = await resolvePO(targetPoKey);
    if (!po) {
      return res.status(404).json({ error: 'PO_NOT_FOUND', message: 'Production Order not found' });
    }

    const isAllocated = await checkOperatorAllocationForPO(req.user!.id, req.user!.role, po.id);
    if (!isAllocated) {
      return res.status(403).json({ error: 'UNAUTHORIZED_PO', message: `Operator is not authorized for Production Order ${po.po_number || po.id}.` });
    }

    const isOpEnabled = await checkOperationEnabledForPO(po.id, 'QC Test');
    if (!isOpEnabled) {
      return res.status(403).json({ error: 'OPERATION_DISABLED', message: `QC Test operation is not enabled for Production Order ${po.po_number || po.id}.` });
    }

    const rangeCheck = await validateProductQrRangeForPO(po, code);
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

    const progress = po ? await calculatePOProgress(po.id) : undefined;
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

// GET /api/qc/progress/:poId
router.get('/qc/progress/:poId', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const poId = req.params.poId;
    const operatorId = req.user!.id;
    const operatorUsername = req.user!.username;
    const operatorName = (req.user as any).full_name || operatorUsername || 'Operator';

    const po = await resolvePO(poId);
    const targetPoId = po?.id || poId;

    const progress = await calculatePOProgress(targetPoId);

    // Operator specific QC pass/fail metrics
    const opPassedRow = await db.prepare(`
      SELECT COUNT(DISTINCT qr.item_id) as cnt FROM qc_results qr
      JOIN item_units iu ON iu.id = qr.item_id
      WHERE (iu.production_order_id = ? OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
        AND (qr.operator_id = ? OR qr.operator_id = ?)
        AND qr.qc_result = 'PASS' AND qr.test_result = 'PASS'
    `).get(targetPoId, targetPoId, operatorId, operatorUsername) as any;
    const operatorPassedCount = opPassedRow?.cnt || 0;

    const opFailedRow = await db.prepare(`
      SELECT COUNT(DISTINCT qf.item_id) as cnt FROM qc_fail_log qf
      JOIN item_units iu ON iu.id = qf.item_id
      WHERE (iu.production_order_id = ? OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
        AND (qf.operator_id = ? OR qf.operator_id = ?)
    `).get(targetPoId, targetPoId, operatorId, operatorUsername) as any;
    const operatorFailedCount = opFailedRow?.cnt || 0;

    return res.json({
      ...progress,
      operatorStats: {
        operatorId,
        operatorName,
        passedCount: operatorPassedCount,
        failedCount: operatorFailedCount
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/packing/progress/:poId
router.get('/packing/progress/:poId', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const poParam = req.params.poId;
    const operatorId = req.user!.id;

    const po = await resolvePO(poParam);
    if (!po) {
      return res.status(404).json({ error: 'PO_NOT_FOUND', message: 'Production Order not found' });
    }

    const configTotal = await db.prepare(`SELECT SUM(quantity) as sumQty FROM production_order_configs WHERE production_order_id = ?`).get(po.id) as any;
    let targetQuantity = configTotal?.sumQty ? Number(configTotal.sumQty) : 0;
    if (!targetQuantity) {
      const soTotal = await db.prepare(`SELECT SUM(order_quantity) as sumQty FROM sales_orders WHERE production_order_id = ?`).get(po.id) as any;
      targetQuantity = soTotal?.sumQty ? Number(soTotal.sumQty) : 500;
    }

    // Overall Packed Count for this PO
    const packedRow = await db.prepare(`
      SELECT COUNT(DISTINCT bi.item_id) as cnt FROM box_items bi
      JOIN boxes b ON b.id = bi.box_id
      WHERE (b.production_order_id = ? OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
        AND bi.active = 1
    `).get(po.id, po.id) as any;
    const packedCount = packedRow?.cnt || 0;

    // Overall Fail Count for this PO
    const failRow = await db.prepare(`
      SELECT COUNT(DISTINCT qf.item_id) as cnt FROM qc_fail_log qf
      JOIN item_units iu ON iu.id = qf.item_id
      WHERE (iu.production_order_id = ? OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
    `).get(po.id, po.id) as any;
    const totalFailCount = failRow?.cnt || 0;

    // Logged-in Operator's Packed Count for this PO
    const opPackedRow = await db.prepare(`
      SELECT COUNT(DISTINCT bi.item_id) as cnt FROM box_items bi
      JOIN boxes b ON b.id = bi.box_id
      WHERE (b.production_order_id = ? OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
        AND bi.active = 1 AND (b.created_by = ? OR b.id IN (SELECT box_id FROM box_items WHERE active = 1))
    `).get(po.id, po.id, operatorId) as any;
    const operatorPackedCount = opPackedRow?.cnt || 0;

    // Logged-in Operator's Fail Count for this PO
    const opFailRow = await db.prepare(`
      SELECT COUNT(DISTINCT qf.item_id) as cnt FROM qc_fail_log qf
      JOIN item_units iu ON iu.id = qf.item_id
      WHERE (iu.production_order_id = ? OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
        AND qf.operator_id = ?
    `).get(po.id, po.id, operatorId) as any;
    const operatorFailCount = opFailRow?.cnt || 0;

    const remainingToPack = Math.max(0, targetQuantity - packedCount);

    return res.json({
      poId: po.id,
      poNumber: po.po_number,
      targetQuantity,
      packedCount,
      remainingToPack,
      totalFailCount,
      operatorStats: {
        operatorId,
        operatorName: (req.user as any).full_name || req.user!.username || 'Operator',
        packedCount: operatorPackedCount,
        failCount: operatorFailCount
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/aql/progress/:poId
router.get('/aql/progress/:poId', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const poParam = req.params.poId;
    const operatorId = req.user!.id;

    const po = await resolvePO(poParam);
    if (!po) {
      return res.status(404).json({ error: 'PO_NOT_FOUND', message: 'Production Order not found' });
    }

    const configTotal = await db.prepare(`SELECT SUM(quantity) as sumQty FROM production_order_configs WHERE production_order_id = ?`).get(po.id) as any;
    let targetQuantity = configTotal?.sumQty ? Number(configTotal.sumQty) : 0;
    if (!targetQuantity) {
      const soTotal = await db.prepare(`SELECT SUM(order_quantity) as sumQty FROM sales_orders WHERE production_order_id = ?`).get(po.id) as any;
      targetQuantity = soTotal?.sumQty ? Number(soTotal.sumQty) : 500;
    }

    const aqlPassRow = await db.prepare(`
      SELECT COUNT(*) as cnt FROM aql_inspections ai
      JOIN boxes b ON b.id = ai.box_id
      WHERE (b.production_order_id = ? OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
        AND UPPER(ai.result) IN ('PASS', 'PASSED')
    `).get(po.id, po.id) as any;
    const aqlPassedCount = aqlPassRow?.cnt || 0;

    const aqlFailRow = await db.prepare(`
      SELECT COUNT(*) as cnt FROM aql_inspections ai
      JOIN boxes b ON b.id = ai.box_id
      WHERE (b.production_order_id = ? OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
        AND UPPER(ai.result) IN ('FAIL', 'FAILED')
    `).get(po.id, po.id) as any;
    const aqlFailedCount = aqlFailRow?.cnt || 0;

    // Operator specific AQL counts
    const opAqlPassRow = await db.prepare(`
      SELECT COUNT(*) as cnt FROM aql_inspections ai
      JOIN boxes b ON b.id = ai.box_id
      WHERE (b.production_order_id = ? OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
        AND ai.inspector_id = ? AND UPPER(ai.result) IN ('PASS', 'PASSED')
    `).get(po.id, po.id, operatorId) as any;
    const operatorPassedCount = opAqlPassRow?.cnt || 0;

    const opAqlFailRow = await db.prepare(`
      SELECT COUNT(*) as cnt FROM aql_inspections ai
      JOIN boxes b ON b.id = ai.box_id
      WHERE (b.production_order_id = ? OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
        AND ai.inspector_id = ? AND UPPER(ai.result) IN ('FAIL', 'FAILED')
    `).get(po.id, po.id, operatorId) as any;
    const operatorFailedCount = opAqlFailRow?.cnt || 0;

    return res.json({
      poId: po.id,
      poNumber: po.po_number,
      targetQuantity,
      aqlPassedCount,
      aqlFailedCount,
      operatorStats: {
        operatorId,
        operatorName: (req.user as any).full_name || req.user!.username || 'Operator',
        passedCount: operatorPassedCount,
        failedCount: operatorFailedCount
      }
    });
  } catch (err) {
    next(err);
  }
});

// 1. POST /api/qc/results
const qcResultSchema = z.object({
  idempotencyKey: z.string().optional(),
  itemQr: z.string().min(1),
  productionOrderNumber: z.string().optional(),
  productionOrderId: z.string().optional(),
  salesOrderNumber: z.string().optional(),
  salesOrderId: z.string().optional(),
  qcResult: z.enum(['PASS', 'FAIL']).optional(),
  testResult: z.enum(['PASS', 'FAIL']).optional(),
  failureReason: z.string().optional()
});

router.post('/qc/results', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const parsed = qcResultSchema.parse(req.body);
    const idempotencyKey = parsed.idempotencyKey;
    const itemQr = parsed.itemQr.trim().toUpperCase();
    const targetPoKey = parsed.productionOrderId || parsed.productionOrderNumber || parsed.salesOrderId || parsed.salesOrderNumber || null;
    const failureReason = parsed.failureReason;

    const operatorId = req.user!.id;
    const userRole = req.user!.role;

    const po = await resolvePO(targetPoKey);
    if (!po) {
      return res.status(404).json({ error: 'PO_NOT_FOUND', message: 'Production Order not found' });
    }

    const isAllocatedResults = await checkOperatorAllocationForPO(operatorId, userRole, po.id);
    if (!isAllocatedResults) {
      return res.status(403).json({ error: 'UNAUTHORIZED_PO', message: `Operator is not authorized for Production Order ${po.po_number || po.id}.` });
    }

    const isOpEnabledResults = await checkOperationEnabledForPO(po.id, 'QC Test');
    if (!isOpEnabledResults) {
      return res.status(403).json({ error: 'OPERATION_DISABLED', message: `QC Test operation is not enabled for Production Order ${po.po_number || po.id}.` });
    }

    const mode = po.qc_test_mode || 'QC_AND_TEST';

    let qcResult: 'PASS' | 'FAIL' = 'PASS';
    let testResult: 'PASS' | 'FAIL' = 'PASS';

    if (mode === 'QC_ONLY') {
      if (!parsed.qcResult) {
        return res.status(400).json({ error: 'QC_RESULT_REQUIRED', message: 'QC Result (PASS/FAIL) is required.' });
      }
      qcResult = parsed.qcResult;
      testResult = 'PASS';
    } else if (mode === 'TEST_ONLY') {
      if (!parsed.testResult) {
        return res.status(400).json({ error: 'TEST_RESULT_REQUIRED', message: 'Test Result (PASS/FAIL) is required.' });
      }
      qcResult = 'PASS';
      testResult = parsed.testResult;
    } else {
      // QC & Test mode
      if (!parsed.qcResult || !parsed.testResult) {
        return res.status(400).json({ error: 'INCOMPLETE_SUBMISSION', message: 'Both QC Result and Test Result are required for QC & Test mode.' });
      }
      qcResult = parsed.qcResult;
      testResult = parsed.testResult;
    }

    const rangeCheck = await validateProductQrRangeForPO(po, itemQr);
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
        const progress = await calculatePOProgress(po.id);
        return res.json({ status: 'DUPLICATE_PROCESSED', message: 'Scan already processed idempotently.', progress });
      }
    }

    // Operator scoping check
    if (!(await checkOperatorAllocationForPO(operatorId, userRole, po.id))) {
      return res.status(403).json({
        error: 'OPERATOR_UNAUTHORIZED',
        message: `Operator ${req.user!.username} is not allocated to Production Order ${po.po_number}`
      });
    }

    let item = await db.prepare(`SELECT * FROM item_units WHERE UPPER(TRIM(qr_code)) = ?`).get(itemQr) as any;
    if (!item) {
      const itemId = `itm-${itemQr}`;
      await db.prepare(`
        INSERT INTO item_units (id, qr_code, production_order_id, product_config_id, size, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'CREATED', NOW(3), NOW(3))
      `).run(itemId, itemQr, po.id, rangeCheck.config?.id || null, rangeCheck.config?.size || 'L');
      item = { id: itemId, qr_code: itemQr, production_order_id: po.id, status: 'CREATED' };
    } else {
      await db.prepare(`UPDATE item_units SET production_order_id = ?, product_config_id = ?, updated_at = NOW(3) WHERE id = ?`).run(po.id, rangeCheck.config?.id || null, item.id);
      item.production_order_id = po.id;
    }

    const isPass = qcResult === 'PASS' && testResult === 'PASS';
    const existingQc = await db.prepare(`SELECT * FROM qc_results WHERE item_id = ?`).get(item.id) as any;

    const isAlreadyPassed = item.status === 'QC_PASSED' || item.status === 'PACKED' || (existingQc && existingQc.qc_result === 'PASS' && existingQc.test_result === 'PASS');

    if (isAlreadyPassed && isPass) {
      await recordScanEvent(idempotencyKey || '', operatorId, 'QC_TEST', itemQr, 'DUPLICATE');
      const progress = await calculatePOProgress(po.id);
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
          INSERT INTO qc_fail_log (id, item_id, operator_id, qc_result, test_result, failure_reason, attempt_number, scanned_at, idempotency_key, raw_qr, po_id, failure_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3), ?, ?, ?, 'QC_FAIL')
        `).run(failLogId, item.id, operatorId, qcResult, testResult, failureReason || null, failCount, idempotencyKey || null, itemQr, po.id);

        const alertId = `alt-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
        await tx.prepare(`
          INSERT INTO alerts (id, user_id, role_target, category, severity, title, message, reference_type, reference_id, created_at)
          VALUES (?, NULL, 'SUPERVISOR', 'QUALITY', 'WARNING', 'QC Test Failure Alert', ?, 'qc_fail_log', ?, NOW(3))
        `).run(alertId, `QC failed for item ${itemQr} on PO ${po.po_number} (Reason: ${failureReason || 'Defect detected'})`, failLogId);
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

    const progress = await calculatePOProgress(po.id);

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

// GET /api/qc/history/:itemQr
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
  const poId = box.production_order_id || box.sales_order_id;
  if (poId && !(await checkOperatorAllocationForPO(operatorId, role, poId))) {
    return { error: 'OPERATOR_UNAUTHORIZED', status: 403, message: 'Operator is not authorized to access boxes for this Production Order.' };
  }

  const po = box.production_order_id ? await db.prepare(`SELECT id, po_number FROM production_orders WHERE id = ?`).get(box.production_order_id) as any : null;

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
      capacity: box.capacity,
      activeCount,
      availableSpace,
      status: box.status,
      items: activeItems
    }
  };
}

// GET /api/boxes/by-code/:boxCode
router.get('/boxes/by-code/:boxCode', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const rawCode = req.params.boxCode;
    if (!rawCode) {
      return res.status(400).json({ error: 'INVALID_CODE', message: 'Box code is required' });
    }
    const boxCode = rawCode.trim().toUpperCase();

    const box = await db.prepare(`SELECT * FROM boxes WHERE UPPER(TRIM(box_code)) = ? OR UPPER(TRIM(box_number)) = ?`).get(boxCode, boxCode) as any;
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

// POST /api/boxes/resolve
const resolveBoxSchema = z.object({
  value: z.string().optional(),
  boxCode: z.string().optional(),
  boxNumber: z.string().optional(),
  isDestination: z.boolean().optional(),
  sourceBoxCode: z.string().optional(),
  sourceBoxNumber: z.string().optional()
});

router.post('/boxes/resolve', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const parsed = resolveBoxSchema.parse(req.body);
    const rawVal = parsed.value || parsed.boxCode || parsed.boxNumber;
    if (!rawVal || typeof rawVal !== 'string' || !rawVal.trim()) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Box code or box number is required' });
    }
    const val = rawVal.trim().toUpperCase();

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
      if (parsed.isDestination && (parsed.sourceBoxCode || parsed.sourceBoxNumber)) {
        const srcCode = (parsed.sourceBoxCode || parsed.sourceBoxNumber)!.trim().toUpperCase();
        const srcBox = await db.prepare(`SELECT * FROM boxes WHERE UPPER(TRIM(box_code)) = ? OR UPPER(TRIM(box_number)) = ?`).get(srcCode, srcCode) as any;
        if (srcBox) {
          const po = await db.prepare(`SELECT * FROM production_orders WHERE id = ?`).get(srcBox.production_order_id) as any;
          const capacity = Number(srcBox.capacity || 12);

          return res.json({
            box: {
              id: `new-${val}`,
              isNew: true,
              boxCode: val,
              boxNumber: val,
              productionOrderId: srcBox.production_order_id,
              poNumber: po?.po_number || srcBox.production_order_id,
              capacity,
              activeCount: 0,
              availableSpace: capacity,
              status: 'NEW',
              items: []
            }
          });
        }
      }
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

// POST /api/packing/items/scan
const packItemSchema = z.object({
  idempotencyKey: z.string().optional(),
  boxNumber: z.string().min(1),
  itemQr: z.string().min(1),
  productionOrderNumber: z.string().optional(),
  productionOrderId: z.string().optional(),
  salesOrderNumber: z.string().optional()
});

router.post('/packing/items/scan', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const { idempotencyKey, boxNumber, itemQr, productionOrderNumber, productionOrderId, salesOrderNumber } = packItemSchema.parse(req.body);
    const operatorId = req.user!.id;

    const poKey = productionOrderId || productionOrderNumber || salesOrderNumber;
    let po = await resolvePO(poKey);

    if (!po) {
      return res.status(404).json({ error: 'PO_NOT_FOUND', message: 'Production order not found for packing.' });
    }

    const isAllocatedPack = await checkOperatorAllocationForPO(operatorId, req.user!.role, po.id);
    if (!isAllocatedPack) {
      return res.status(403).json({ error: 'UNAUTHORIZED_PO', message: `Operator is not authorized for Production Order ${po.po_number || po.id}.` });
    }

    const isOpEnabledPack = await checkOperationEnabledForPO(po.id, 'Packing');
    if (!isOpEnabledPack) {
      return res.status(403).json({ error: 'OPERATION_DISABLED', message: `Packing operation is not enabled for Production Order ${po.po_number || po.id}.` });
    }

    let box = await db.prepare(`SELECT * FROM boxes WHERE UPPER(TRIM(box_code)) = ? OR UPPER(TRIM(box_number)) = ?`).get(boxNumber.trim().toUpperCase(), boxNumber.trim().toUpperCase()) as any;
    if (!box) {
      const boxId = `box-${Date.now()}`;
      const code = boxNumber.trim().toUpperCase();
      await db.prepare(`
        INSERT INTO boxes (id, box_code, box_number, production_order_id, capacity, status, created_at)
        VALUES (?, ?, ?, ?, 12, 'OPEN', NOW(3))
      `).run(boxId, code, code, po.id);
      box = { id: boxId, box_code: code, box_number: code, production_order_id: po.id, capacity: 12, status: 'OPEN' };
    }

    const currentItemsCountRow = await db.prepare(`SELECT COUNT(*) as cnt FROM box_items WHERE box_id = ? AND active = 1`).get(box.id) as any;
    const currentItemsCount = currentItemsCountRow?.cnt || 0;
    if (currentItemsCount >= box.capacity) {
      await recordScanEvent(idempotencyKey || '', operatorId, 'PACKING', itemQr, 'REJECTED', 'BOX_FULL', 'Box capacity reached');
      return res.status(400).json({ error: 'BOX_FULL', message: `Box ${boxNumber} is already full (${box.capacity}/${box.capacity}).` });
    }

    let item = await db.prepare(`SELECT * FROM item_units WHERE UPPER(TRIM(qr_code)) = ?`).get(itemQr.trim().toUpperCase()) as any;
    if (!item) {
      const itemId = `itm-${itemQr.trim().toUpperCase().replace(/[^a-zA-Z0-9]/g, '')}`;
      await db.prepare(`
        INSERT INTO item_units (id, serial_number, qr_code, production_order_id, status, created_at)
        VALUES (?, ?, ?, ?, 'QC_PASSED', NOW(3))
      `).run(itemId, itemQr, itemQr, po.id);
      item = { id: itemId, qr_code: itemQr, production_order_id: po.id, status: 'QC_PASSED' };

      const qcResultId = `qcr-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
      await db.prepare(`
        INSERT INTO qc_results (id, item_id, operator_id, qc_result, test_result, created_at)
        VALUES (?, ?, ?, 'PASS', 'PASS', NOW(3))
      `).run(qcResultId, itemId, operatorId);
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

// POST /api/box-transfers
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

    if (!fromBox) {
      return res.status(404).json({ error: 'BOX_NOT_FOUND', message: `Source box '${fromCode}' not found.` });
    }

    if (fromCode === toCode) {
      return res.status(400).json({ error: 'SAME_BOX', message: 'Source and destination box cannot be the same box.' });
    }

    if (fromBox.production_order_id && !(await checkOperatorAllocationForPO(operatorId, role, fromBox.production_order_id))) {
      return res.status(403).json({
        error: 'OPERATOR_UNAUTHORIZED',
        message: 'Operator is not authorized to transfer products for this Production Order.'
      });
    }

    if (fromBox.production_order_id && !(await checkOperationEnabledForPO(fromBox.production_order_id, 'Box Transfer'))) {
      return res.status(403).json({
        error: 'OPERATION_DISABLED',
        message: 'Box Transfer operation is not enabled for this Production Order.'
      });
    }

    let toBox = await db.prepare(`SELECT * FROM boxes WHERE UPPER(TRIM(box_code)) = ? OR UPPER(TRIM(box_number)) = ?`).get(toCode, toCode) as any;

    if (toBox) {
      if (fromBox.id === toBox.id) {
        return res.status(400).json({ error: 'SAME_BOX', message: 'Source and destination box cannot be the same box.' });
      }

      if (fromBox.production_order_id && toBox.production_order_id && fromBox.production_order_id !== toBox.production_order_id) {
        return res.status(400).json({ error: 'PO_MISMATCH', message: 'Source and destination boxes belong to different Production Orders.' });
      }
    }

    const transferId = `trf-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
    let updatedSourceCount = 0;
    let updatedDestCount = 0;

    await db.transaction(async (tx) => {
      await tx.query(`SELECT * FROM boxes WHERE id = ? FOR UPDATE`, [fromBox.id]);

      if (!toBox) {
        const existingLockedToBox = await tx.queryOne<any>(`
          SELECT * FROM boxes WHERE UPPER(TRIM(box_code)) = ? OR UPPER(TRIM(box_number)) = ? FOR UPDATE
        `, [toCode, toCode]);

        if (existingLockedToBox) {
          toBox = existingLockedToBox;
        } else {
          const destCapacity = Number(fromBox.capacity || 12);
          const newBoxId = `bx-${Date.now()}-${Math.random().toString().slice(2, 6)}`;

          await tx.prepare(`
            INSERT INTO boxes (id, box_code, box_number, production_order_id, capacity, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'OPEN', NOW(3))
          `).run(newBoxId, toCode, toCode, fromBox.production_order_id, destCapacity);

          toBox = {
            id: newBoxId,
            box_code: toCode,
            box_number: toCode,
            production_order_id: fromBox.production_order_id,
            capacity: destCapacity,
            status: 'OPEN'
          };
        }
      } else {
        await tx.query(`SELECT * FROM boxes WHERE id = ? FOR UPDATE`, [toBox.id]);
      }

      const destCountRow = await tx.queryOne<{ cnt: number }>(`
        SELECT COUNT(*) as cnt FROM box_items WHERE box_id = ? AND active = 1 FOR UPDATE
      `, [toBox.id]);
      const destOccupied = destCountRow?.cnt || 0;
      const availableSpace = Math.max(0, toBox.capacity - destOccupied);

      if (itemQrs.length > availableSpace) {
        throw {
          statusCode: 400,
          code: 'DESTINATION_BOX_CAPACITY_EXCEEDED',
          message: `Destination box capacity exceeded. Maximum transferable slots: ${availableSpace}`
        };
      }

      await tx.prepare(`
        INSERT INTO box_transfers (id, source_box_id, destination_box_id, production_order_id, transferred_by, item_count, transferred_at, remarks)
        VALUES (?, ?, ?, ?, ?, ?, NOW(3), ?)
      `).run(transferId, fromBox.id, toBox.id, fromBox.production_order_id, operatorId, itemQrs.length, remarks || null);

      for (const qr of itemQrs) {
        const cleanQr = qr.trim().toUpperCase();
        const activeBoxItem = await tx.queryOne<any>(`
          SELECT bi.* FROM box_items bi
          JOIN item_units iu ON iu.id = bi.item_id
          WHERE bi.box_id = ? AND UPPER(TRIM(iu.qr_code)) = ? AND bi.active = 1
          FOR UPDATE
        `, [fromBox.id, cleanQr]);

        if (activeBoxItem) {
          await tx.prepare(`UPDATE box_items SET active = 0 WHERE id = ?`).run(activeBoxItem.id);

          const newBoxItemId = `bi-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
          await tx.prepare(`
            INSERT INTO box_items (id, box_id, item_id, packed_by, packed_at, active)
            VALUES (?, ?, ?, ?, NOW(3), 1)
          `).run(newBoxItemId, toBox.id, activeBoxItem.item_id, operatorId);

          const trfItemId = `trfi-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
          await tx.prepare(`
            INSERT INTO box_transfer_items (id, transfer_id, item_id, source_box_item_id, destination_box_item_id, transferred_at)
            VALUES (?, ?, ?, ?, ?, NOW(3))
          `).run(trfItemId, transferId, activeBoxItem.item_id, activeBoxItem.id, newBoxItemId);
        }
      }

      const srcFinalRow = await tx.queryOne<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM box_items WHERE box_id = ? AND active = 1`, [fromBox.id]);
      const destFinalRow = await tx.queryOne<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM box_items WHERE box_id = ? AND active = 1`, [toBox.id]);
      updatedSourceCount = srcFinalRow?.cnt || 0;
      updatedDestCount = destFinalRow?.cnt || 0;
    });

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

// GET /api/box-transfers
router.get('/box-transfers', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const transfers = await db.query(`
      SELECT 
        bt.id,
        bt.source_box_id,
        bt.destination_box_id,
        sb.box_code AS source_box_code,
        sb.box_number AS source_box_number,
        db_box.box_code AS destination_box_code,
        db_box.box_number AS destination_box_number,
        bt.production_order_id,
        bt.transferred_by,
        u.full_name AS operator_name,
        u.username AS operator_username,
        bt.item_count,
        bt.transferred_at,
        bt.remarks
      FROM box_transfers bt
      LEFT JOIN boxes sb ON sb.id = bt.source_box_id
      LEFT JOIN boxes db_box ON db_box.id = bt.destination_box_id
      LEFT JOIN users u ON u.id = bt.transferred_by
      ORDER BY bt.transferred_at DESC
    `);
    return res.json(transfers);
  } catch (err) {
    next(err);
  }
});

// POST /api/aql/boxes/scan
router.post('/aql/boxes/scan', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const { boxNumber } = req.body;
    const operatorId = req.user!.id;

    let box = await db.prepare(`SELECT * FROM boxes WHERE UPPER(TRIM(box_code)) = ? OR UPPER(TRIM(box_number)) = ?`).get(boxNumber.trim().toUpperCase(), boxNumber.trim().toUpperCase()) as any;
    if (!box) {
      return res.status(404).json({ error: 'BOX_NOT_FOUND', message: `Box ${boxNumber} not found.` });
    }

    if (box.production_order_id) {
      if (!(await checkOperatorAllocationForPO(operatorId, req.user!.role, box.production_order_id))) {
        return res.status(403).json({ error: 'OPERATOR_UNAUTHORIZED', message: 'Operator is not authorized for this Production Order.' });
      }
      if (!(await checkOperationEnabledForPO(box.production_order_id, 'AQL Checker'))) {
        return res.status(403).json({ error: 'OPERATION_DISABLED', message: 'AQL Checker operation is not enabled for this Production Order.' });
      }
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
      INSERT INTO aql_inspections (id, box_id, production_order_id, inspector_id, required_samples, result, started_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING', NOW(3))
    `).run(inspectionId, box.id, box.production_order_id, operatorId, totalItems > 0 ? totalItems : 3);

    return res.json({
      box: {
        box_number: box.box_code || box.box_number,
        production_order_id: box.production_order_id,
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

// POST /api/aql/inspections/:id/samples
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

// POST /api/aql/inspections/direct-complete
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
      INSERT INTO aql_inspections (id, box_id, production_order_id, inspector_id, required_samples, result, failure_reason, started_at, completed_at)
      VALUES (?, ?, ?, ?, 12, ?, ?, NOW(3), NOW(3))
    `).run(inspectionId, box.id, box.production_order_id, operatorId, result, failureReason || null);

    const boxStatus = result === 'PASSED' ? 'AQL_PASSED' : 'AQL_FAILED';
    await db.prepare(`UPDATE boxes SET status = ?, completed_at = NOW(3) WHERE id = ?`).run(boxStatus, box.id);

    return res.json({ message: 'AQL Direct Complete finalized', inspectionId, result });
  } catch (err) {
    next(err);
  }
});

// POST /api/aql/inspections/:id/complete
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
        INSERT INTO aql_inspections (id, box_id, production_order_id, inspector_id, required_samples, result, failure_reason, started_at, completed_at)
        VALUES (?, ?, ?, ?, 12, ?, ?, NOW(3), NOW(3))
      `).run(inspectionId, box.id, box.production_order_id, operatorId, result, failureReason || null);
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
