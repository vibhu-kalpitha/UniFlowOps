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

// Helper for operator allocation check on PO level with stage support
export async function checkOperatorAllocationForPO(operatorId: string, role: string, poId: string, stage?: 'QC' | 'TEST' | 'PRE_QC' | 'PACKING' | 'AQL' | 'FINAL_AQL' | 'BOX_TRANSFER'): Promise<boolean> {
  if (role === 'SUPERVISOR' || role === 'ADMIN') return true;

  let opCondition = ``;
  if (stage === 'QC') {
    opCondition = `AND (operation = 'ALL' OR operation = 'QC_TEST' OR operation = 'QC' OR operation = 'QC Test')`;
  } else if (stage === 'TEST') {
    opCondition = `AND (operation = 'ALL' OR operation = 'QC_TEST' OR operation = 'TEST' OR operation = 'QC Test')`;
  } else if (stage === 'AQL') {
    opCondition = `AND (operation = 'ALL' OR operation = 'AQL' OR operation = 'AQL Checker')`;
  } else if (stage === 'FINAL_AQL') {
    opCondition = `AND (operation = 'ALL' OR operation = 'FINAL_AQL' OR operation = 'FINAL AQL' OR operation = 'Final AQL')`;
  }

  const row = await db.prepare(`
    SELECT COUNT(*) as cnt FROM operator_work_assignments
    WHERE (production_order_id = ? OR sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
      AND operator_id = ? AND active = 1 ${opCondition}
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
  else if (opName === 'Pre QC' || opName === 'PRE_QC' || opName === 'PREQC') dbOp = 'PRE_QC';
  else if (opName === 'Packing' || opName === 'PACKING') dbOp = 'PACKING';
  else if (opName === 'AQL Checker' || opName === 'AQL') dbOp = 'AQL';
  else if (opName === 'FINAL AQL' || opName === 'FINAL_AQL' || opName === 'Final AQL') dbOp = 'FINAL_AQL';

  const row = await db.prepare(`
    SELECT COUNT(*) as cnt FROM production_order_operations
    WHERE production_order_id = ? AND (operation = ? OR operation = ?)
  `).get(poId, opName, dbOp) as any;

  return !!(row && row.cnt > 0);
}

// Shared Backend Product Validation Engine
export async function validateProductForProductionOrder(poOrPoId: any, rawCode: string): Promise<{ valid: boolean; config?: any; error?: string; message?: string }> {
  if (!poOrPoId) {
    return { valid: false, error: 'PO_NOT_FOUND', message: 'Production Order not found' };
  }
  const po = typeof poOrPoId === 'string' ? await resolvePO(poOrPoId) : poOrPoId;
  if (!po) {
    return { valid: false, error: 'PO_NOT_FOUND', message: 'Production Order not found' };
  }
  const code = rawCode.trim().toUpperCase();

  const configs = await db.prepare(`SELECT * FROM production_order_configs WHERE production_order_id = ?`).all(po.id) as any[];

  if (configs.length === 0) {
    return {
      valid: false,
      error: 'CONFIG_NOT_FOUND',
      message: `No product configurations found for Production Order ${po.po_number || po.id}. Please configure product settings.`
    };
  }

  for (const cfg of configs) {
    const configCode = (cfg.config_code || '').trim().toUpperCase();
    const productType = (cfg.product_type || '').trim().toUpperCase();

    // 1. Config code prefix match (e.g. PNFLSS09260001 matches PNFLSS)
    if (configCode && code.startsWith(configCode)) {
      return { valid: true, config: cfg };
    }

    // 2. Dynamic fallback: if configCode is empty (no prefix, no size), match any QR under this PO
    if (!configCode) {
      return { valid: true, config: cfg };
    }
  }

  return {
    valid: false,
    error: 'CONFIG_NOT_SELECTED',
    message: `Unselected Configuration — '${code}' does not belong to Production Order ${po.po_number || po.id}.`
  };
}

export async function validateProductQrRangeForPO(po: any, rawCode: string) {
  return validateProductForProductionOrder(po, rawCode);
}

export function validateProductQrRange(targetObj: any, rawCode: string) {
  if (!targetObj) return { valid: false, error: 'PO_NOT_FOUND', message: 'Target not found' };
  const configCode = (targetObj?.config_code || targetObj?.configCode || '').trim().toUpperCase();
  const code = rawCode.trim().toUpperCase();
  if (configCode && code.startsWith(configCode)) {
    return { valid: true };
  }
  return { valid: false, error: 'CONFIG_NOT_SELECTED', message: `Product configuration mismatch for '${code}'.` };
}

export async function calculatePreQCProgress(poId: string) {
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
    };
  }

  const configTotal = await db.prepare(`SELECT SUM(quantity) as sumQty FROM production_order_configs WHERE production_order_id = ?`).get(po.id) as any;
  let targetQuantity = configTotal?.sumQty ? Number(configTotal.sumQty) : 0;
  if (!targetQuantity) {
    const soTotal = await db.prepare(`SELECT SUM(order_quantity) as sumQty FROM sales_orders WHERE production_order_id = ?`).get(po.id) as any;
    targetQuantity = soTotal?.sumQty ? Number(soTotal.sumQty) : 1000;
  }

  const passRow = await db.prepare(`
    SELECT COUNT(DISTINCT pq.item_id) as cnt FROM pre_qc_results pq
    JOIN item_units iu ON iu.id = pq.item_id
    WHERE (iu.production_order_id = ? OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
      AND pq.pre_qc_result = 'PASS'
  `).get(po.id, po.id) as any;

  const passedUnique = passRow?.cnt || 0;
  const inspectedUnique = passedUnique;
  const failedUnique = 0;
  const remainingToInspect = Math.max(0, targetQuantity - inspectedUnique);
  const remainingToPass = Math.max(0, targetQuantity - passedUnique);
  const isComplete = passedUnique >= targetQuantity;

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
  };
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

  const mode = po.qc_test_mode || 'QC_AND_TEST';

  const configTotal = await db.prepare(`SELECT SUM(quantity) as sumQty FROM production_order_configs WHERE production_order_id = ?`).get(po.id) as any;
  let targetQuantity = configTotal?.sumQty ? Number(configTotal.sumQty) : 0;

  if (!targetQuantity) {
    const soTotal = await db.prepare(`SELECT SUM(order_quantity) as sumQty FROM sales_orders WHERE production_order_id = ?`).get(po.id) as any;
    targetQuantity = soTotal?.sumQty ? Number(soTotal.sumQty) : 1000;
  }

  let passedCondition = `qr.qc_result = 'PASS' AND qr.test_result = 'PASS'`;
  if (mode === 'QC_ONLY') {
    passedCondition = `qr.qc_result = 'PASS'`;
  } else if (mode === 'TEST_ONLY') {
    passedCondition = `qr.test_result = 'PASS'`;
  }

  const overallRow = await db.prepare(`
    SELECT COUNT(DISTINCT iu.id) as cnt FROM qc_results qr
    JOIN item_units iu ON iu.id = qr.item_id
    WHERE (iu.production_order_id = ? OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
      AND ${passedCondition}
  `).get(po.id, po.id) as any;
  const overallCompletedCount = overallRow?.cnt || 0;

  const qcRow = await db.prepare(`
    SELECT COUNT(DISTINCT iu.id) as cnt FROM qc_results qr
    JOIN item_units iu ON iu.id = qr.item_id
    WHERE (iu.production_order_id = ? OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
      AND qr.qc_result = 'PASS'
  `).get(po.id, po.id) as any;
  const qcPassedCount = qcRow?.cnt || 0;

  const testRow = await db.prepare(`
    SELECT COUNT(DISTINCT iu.id) as cnt FROM qc_results qr
    JOIN item_units iu ON iu.id = qr.item_id
    WHERE (iu.production_order_id = ? OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
      AND qr.test_result = 'PASS'
  `).get(po.id, po.id) as any;
  const testPassedCount = testRow?.cnt || 0;

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
  const remainingToPass = Math.max(0, targetQuantity - overallCompletedCount);
  const isComplete = overallCompletedCount >= targetQuantity;
  const allAdmitted = inspectedUnique >= targetQuantity;

  return {
    poId: po.id,
    poNumber: po.po_number,
    qcTestMode: mode,
    targetQuantity,
    inspectedUnique,
    passedUnique: overallCompletedCount,
    qcPassedCount,
    testPassedCount,
    overallCompletedCount,
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

// ── PRE QC ENDPOINTS ───────────────────────────────────────────────────

// POST /api/pre-qc/scan
router.post('/pre-qc/scan', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const rawCode = req.body.code || req.body.itemQr;
    const targetPoKey = req.body.productionOrderId || req.body.productionOrderNumber || req.body.poNumber || null;
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

    const isOpEnabled = await checkOperationEnabledForPO(po.id, 'Pre QC');
    if (!isOpEnabled) {
      return res.status(403).json({ error: 'OPERATION_DISABLED', message: `Pre QC operation is not enabled for Production Order ${po.po_number || po.id}.` });
    }

    const rangeCheck = await validateProductQrRangeForPO(po, code);
    if (!rangeCheck.valid) {
      return res.status(400).json({
        error: rangeCheck.error,
        message: rangeCheck.message,
        expectedRange: (rangeCheck as any).expectedRange
      });
    }

    const item = await db.prepare(`
      SELECT * FROM item_units 
      WHERE (production_order_id = ? OR production_order_id = ? OR production_order_id = ? OR production_order_id IS NULL)
        AND UPPER(TRIM(qr_code)) = ?
    `).get(po.id, po.po_number, po.map_po, code) as any;

    if (item) {
      const existingPreQc = await db.prepare(`
        SELECT * FROM pre_qc_results WHERE item_id = ? AND pre_qc_result = 'PASS'
      `).get(item.id) as any;

      if (existingPreQc || item.status === 'PRE_QC_PASSED') {
        return res.json({
          status: 'DUPLICATE',
          message: 'Already processed Pre QC',
          item: { qr_code: item.qr_code, size: item.size || 'L' }
        });
      }
    }

    const progress = await calculatePreQCProgress(po.id);
    return res.json({
      status: 'VALID',
      message: 'Barcode valid for Pre QC',
      item: item ? { qr_code: item.qr_code, size: item.size || 'L' } : { qr_code: code, size: 'L' },
      progress
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/pre-qc/record
router.post('/pre-qc/record', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const rawCode = req.body.code || req.body.itemQr;
    const targetPoKey = req.body.productionOrderId || req.body.productionOrderNumber || req.body.poNumber || null;
    const result = (req.body.preQcResult || req.body.result || 'PASS').toUpperCase();
    const failureReason = req.body.failureReason ? String(req.body.failureReason).trim() : null;

    if (!rawCode || typeof rawCode !== 'string') {
      return res.status(400).json({ error: 'INVALID_QR', message: 'Barcode is required' });
    }
    const code = rawCode.trim().toUpperCase();
    const po = await resolvePO(targetPoKey);
    if (!po) {
      return res.status(404).json({ error: 'PO_NOT_FOUND', message: 'Production Order not found' });
    }

    const rangeCheck = await validateProductQrRangeForPO(po, code);
    if (!rangeCheck.valid) {
      return res.status(400).json({ error: rangeCheck.error, message: rangeCheck.message });
    }

    let item = await db.prepare(`
      SELECT * FROM item_units 
      WHERE (production_order_id = ? OR production_order_id = ?) AND UPPER(TRIM(qr_code)) = ?
    `).get(po.id, po.po_number, code) as any;

    const newStatus = result === 'PASS' ? 'PRE_QC_PASSED' : 'PRE_QC_FAILED';

    if (!item) {
      const itemId = `item-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
      const config = rangeCheck.config || {};
      const sizeVal = config.size || 'L';
      await db.prepare(`
        INSERT INTO item_units (id, qr_code, production_order_id, product_config_id, size, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
      `).run(itemId, code, po.id, config.id || null, sizeVal, newStatus);

      item = await db.prepare(`SELECT * FROM item_units WHERE id = ?`).get(itemId) as any;
    } else {
      await db.prepare(`UPDATE item_units SET status = ?, updated_at = NOW(3) WHERE id = ?`).run(newStatus, item.id);
    }

    const preQcId = `preqc-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
    await db.prepare(`
      INSERT INTO pre_qc_results (id, item_id, operator_id, production_order_id, pre_qc_result, failure_reason, scanned_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW(3))
    `).run(preQcId, item.id, req.user!.id, po.id, result, failureReason);

    const progress = await calculatePreQCProgress(po.id);
    return res.json({
      status: 'SUCCESS',
      message: `Pre QC ${result} recorded for ${code}`,
      item: { qr_code: item.qr_code, size: item.size || 'L' },
      progress
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/pre-qc/progress/:poId
router.get('/pre-qc/progress/:poId', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const poId = req.params.poId;
    const operatorId = req.user!.id;
    const operatorUsername = req.user!.username;
    const operatorName = (req.user as any).full_name || operatorUsername || 'Operator';

    const po = await resolvePO(poId);
    const targetPoId = po?.id || poId;

    const progress = await calculatePreQCProgress(targetPoId);

    const opPassedRow = await db.prepare(`
      SELECT COUNT(DISTINCT pq.item_id) as cnt FROM pre_qc_results pq
      JOIN item_units iu ON iu.id = pq.item_id
      WHERE (iu.production_order_id = ? OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
        AND (pq.operator_id = ? OR pq.operator_id = ?)
        AND pq.pre_qc_result = 'PASS'
    `).get(targetPoId, targetPoId, operatorId, operatorUsername) as any;
    const operatorPassedCount = opPassedRow?.cnt || 0;

    return res.json({
      ...progress,
      operatorStats: {
        operatorId,
        operatorName,
        passedCount: operatorPassedCount,
        failedCount: 0
      }
    });
  } catch (err) {
    next(err);
  }
});

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
        expectedRange: (rangeCheck as any).expectedRange
      });
    }

    const item = po ? await db.prepare(`
      SELECT * FROM item_units 
      WHERE (production_order_id = ? OR production_order_id = ? OR production_order_id = ? OR production_order_id IS NULL)
        AND UPPER(TRIM(qr_code)) = ?
    `).get(po.id, po.po_number, po.map_po, code) as any
    : await db.prepare(`SELECT * FROM item_units WHERE UPPER(TRIM(qr_code)) = ?`).get(code) as any;

    const mode = po.qc_test_mode || 'QC_AND_TEST';
    let existingQc: any = null;
    let qcCompleted = false;
    let testCompleted = false;
    let isFullyCompleted = false;

    if (item) {
      existingQc = await db.prepare(`SELECT * FROM qc_results WHERE item_id = ?`).get(item.id) as any;
      if (existingQc) {
        qcCompleted = existingQc.qc_result === 'PASS';
        testCompleted = existingQc.test_result === 'PASS';
      }
      if (mode === 'QC_ONLY') {
        isFullyCompleted = qcCompleted;
      } else if (mode === 'TEST_ONLY') {
        isFullyCompleted = testCompleted;
      } else {
        isFullyCompleted = qcCompleted && testCompleted;
      }

      if (isFullyCompleted || item.status === 'QC_PASSED' || item.status === 'PACKED') {
        const progress = po ? await calculatePOProgress(po.id) : undefined;
        return res.json({
          status: 'FULLY_COMPLETED',
          message: 'QC & Test already completed for this garment.',
          item: { qr_code: item.qr_code, size: item.size || 'L' },
          stageStatus: {
            qcResult: existingQc?.qc_result || 'PENDING',
            testResult: existingQc?.test_result || 'PENDING',
            qcCompleted,
            testCompleted,
            isFullyCompleted: true
          },
          progress
        });
      }
    }

    const progress = po ? await calculatePOProgress(po.id) : undefined;
    const msg = qcCompleted 
      ? 'QC already completed. Test result is pending.' 
      : testCompleted 
      ? 'Test already completed. QC result is pending.' 
      : 'Barcode valid for inspection';

    return res.json({
      status: 'VALID',
      message: msg,
      item: item ? { qr_code: item.qr_code, size: item.size || 'L' } : { qr_code: code, size: 'L' },
      stageStatus: {
        qcResult: existingQc?.qc_result || 'PENDING',
        testResult: existingQc?.test_result || 'PENDING',
        qcCompleted,
        testCompleted,
        isFullyCompleted: false
      },
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

export async function calculatePackingProgress(poParam: string, reqUser: any) {
  const po = await resolvePO(poParam);
  if (!po) return null;

  const operatorId = reqUser.id;
  const operatorUsername = reqUser.username;
  const operatorFullName = (reqUser as any).full_name || (reqUser as any).fullName || reqUser.username;

  const configTotal = await db.prepare(`SELECT SUM(quantity) as sumQty FROM production_order_configs WHERE production_order_id = ?`).get(po.id) as any;
  let targetQuantity = configTotal?.sumQty ? Number(configTotal.sumQty) : 0;
  if (!targetQuantity) {
    const soTotal = await db.prepare(`SELECT SUM(order_quantity) as sumQty FROM sales_orders WHERE production_order_id = ?`).get(po.id) as any;
    targetQuantity = soTotal?.sumQty ? Number(soTotal.sumQty) : 500;
  }

  const poKeys = [po.id, po.po_number, po.map_po].filter(Boolean);
  const placeholders = poKeys.map(() => '?').join(',');

  // Overall Packed Count for this PO (all active box_items for this PO)
  const packedRow = await db.prepare(`
    SELECT COUNT(DISTINCT bi.id) as cnt 
    FROM box_items bi
    JOIN boxes b ON b.id = bi.box_id
    LEFT JOIN item_units iu ON iu.id = bi.item_id
    WHERE (
      b.production_order_id IN (${placeholders}) 
      OR iu.production_order_id IN (${placeholders}) 
      OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))
      OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))
    ) AND bi.active = 1
  `).get(...poKeys, ...poKeys, ...poKeys, ...poKeys) as any;
  const packedCount = packedRow?.cnt || 0;

  // Overall Fail Count for this PO
  const failRow = await db.prepare(`
    SELECT COUNT(DISTINCT qf.item_id) as cnt FROM qc_fail_log qf
    JOIN item_units iu ON iu.id = qf.item_id
    WHERE (
      iu.production_order_id IN (${placeholders}) 
      OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))
    )
  `).get(...poKeys, ...poKeys) as any;
  const totalFailCount = failRow?.cnt || 0;

  // Logged-in Operator's Packed Count for this PO
  // Calculates active box_items records where packed_by matches the logged-in operator
  const opPackedRow = await db.prepare(`
    SELECT COUNT(DISTINCT bi.id) as cnt 
    FROM box_items bi
    JOIN boxes b ON b.id = bi.box_id
    LEFT JOIN item_units iu ON iu.id = bi.item_id
    WHERE (
      b.production_order_id IN (${placeholders}) 
      OR iu.production_order_id IN (${placeholders}) 
      OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))
      OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))
    ) AND bi.active = 1 AND (
      bi.packed_by = ? OR bi.packed_by = ? OR bi.packed_by = ?
    )
  `).get(...poKeys, ...poKeys, ...poKeys, ...poKeys, operatorId, operatorUsername, operatorFullName) as any;
  const operatorPackedCount = opPackedRow?.cnt || 0;

  // Logged-in Operator's Fail Count for this PO
  const opFailRow = await db.prepare(`
    SELECT COUNT(DISTINCT qf.item_id) as cnt FROM qc_fail_log qf
    JOIN item_units iu ON iu.id = qf.item_id
    WHERE (
      iu.production_order_id IN (${placeholders}) 
      OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))
    ) AND (
      qf.operator_id = ? OR qf.operator_id = ? OR qf.operator_id = ?
    )
  `).get(...poKeys, ...poKeys, operatorId, operatorUsername, operatorFullName) as any;
  const operatorFailCount = opFailRow?.cnt || 0;

  const remainingToPack = Math.max(0, targetQuantity - packedCount);

  return {
    poId: po.id,
    poNumber: po.po_number,
    targetQuantity,
    packedCount,
    remainingToPack,
    totalFailCount,
    operatorStats: {
      operatorId,
      operatorName: operatorFullName,
      packedCount: operatorPackedCount,
      failCount: operatorFailCount
    }
  };
}

// GET /api/packing/progress/:poId
router.get('/packing/progress/:poId', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const poParam = req.params.poId;
    const progress = await calculatePackingProgress(poParam, req.user);
    if (!progress) {
      return res.status(404).json({ error: 'PO_NOT_FOUND', message: 'Production Order not found' });
    }
    return res.json(progress);
  } catch (err) {
    next(err);
  }
});

// GET /api/aql/progress/:poId
router.get('/aql/progress/:poId', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const poParam = req.params.poId;
    const operatorId = req.user!.id;
    const operatorUsername = req.user!.username;

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

    const poKeys = [po.id, po.po_number, po.map_po].filter(Boolean);
    const placeholders = poKeys.map(() => '?').join(',');

    // 1. Count items passed via aql_inspections (box-wise sum or required_samples)
    const aqlPassRow = await db.prepare(`
      SELECT COALESCE(SUM(
        CASE 
          WHEN (SELECT COUNT(*) FROM box_items bi WHERE (bi.box_id = b.id OR UPPER(TRIM(bi.box_id)) = UPPER(TRIM(ai.box_id))) AND bi.active = 1) > 0 
          THEN (SELECT COUNT(*) FROM box_items bi WHERE (bi.box_id = b.id OR UPPER(TRIM(bi.box_id)) = UPPER(TRIM(ai.box_id))) AND bi.active = 1)
          WHEN (SELECT COUNT(*) FROM aql_samples asamp WHERE asamp.inspection_id = ai.id AND UPPER(TRIM(asamp.result)) = 'PASS') > 0
          THEN (SELECT COUNT(*) FROM aql_samples asamp WHERE asamp.inspection_id = ai.id AND UPPER(TRIM(asamp.result)) = 'PASS')
          ELSE COALESCE(ai.required_samples, 1)
        END
      ), 0) as cnt
      FROM aql_inspections ai
      LEFT JOIN boxes b ON (b.id = ai.box_id OR UPPER(TRIM(b.box_code)) = UPPER(TRIM(ai.box_id)) OR UPPER(TRIM(b.box_number)) = UPPER(TRIM(ai.box_id)))
      WHERE (
        ai.production_order_id IN (${placeholders}) 
        OR b.production_order_id IN (${placeholders}) 
        OR ai.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))
        OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))
      ) AND UPPER(TRIM(ai.result)) IN ('PASS', 'PASSED')
    `).get(...poKeys, ...poKeys, ...poKeys, ...poKeys) as any;

    // 2. Count distinct items passed via aql_samples table
    const samplePassRow = await db.prepare(`
      SELECT COUNT(DISTINCT asamp.item_id) as cnt
      FROM aql_samples asamp
      JOIN aql_inspections ai ON ai.id = asamp.inspection_id
      LEFT JOIN boxes b ON (b.id = ai.box_id OR UPPER(TRIM(b.box_code)) = UPPER(TRIM(ai.box_id)) OR UPPER(TRIM(b.box_number)) = UPPER(TRIM(ai.box_id)))
      WHERE (
        ai.production_order_id IN (${placeholders}) 
        OR b.production_order_id IN (${placeholders}) 
        OR ai.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))
        OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))
      ) AND UPPER(TRIM(asamp.result)) = 'PASS'
    `).get(...poKeys, ...poKeys, ...poKeys, ...poKeys) as any;

    const aqlPassedCount = Math.max(Number(aqlPassRow?.cnt || 0), Number(samplePassRow?.cnt || 0));

    // 1. Count items failed via aql_inspections
    const aqlFailRow = await db.prepare(`
      SELECT COALESCE(SUM(
        CASE 
          WHEN (SELECT COUNT(*) FROM box_items bi WHERE (bi.box_id = b.id OR UPPER(TRIM(bi.box_id)) = UPPER(TRIM(ai.box_id))) AND bi.active = 1) > 0 
          THEN (SELECT COUNT(*) FROM box_items bi WHERE (bi.box_id = b.id OR UPPER(TRIM(bi.box_id)) = UPPER(TRIM(ai.box_id))) AND bi.active = 1)
          WHEN (SELECT COUNT(*) FROM aql_samples asamp WHERE asamp.inspection_id = ai.id AND UPPER(TRIM(asamp.result)) = 'FAIL') > 0
          THEN (SELECT COUNT(*) FROM aql_samples asamp WHERE asamp.inspection_id = ai.id AND UPPER(TRIM(asamp.result)) = 'FAIL')
          ELSE COALESCE(ai.required_samples, 1)
        END
      ), 0) as cnt
      FROM aql_inspections ai
      LEFT JOIN boxes b ON (b.id = ai.box_id OR UPPER(TRIM(b.box_code)) = UPPER(TRIM(ai.box_id)) OR UPPER(TRIM(b.box_number)) = UPPER(TRIM(ai.box_id)))
      WHERE (
        ai.production_order_id IN (${placeholders}) 
        OR b.production_order_id IN (${placeholders}) 
        OR ai.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))
        OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))
      ) AND UPPER(TRIM(ai.result)) IN ('FAIL', 'FAILED')
    `).get(...poKeys, ...poKeys, ...poKeys, ...poKeys) as any;

    // 2. Count distinct items failed via aql_samples table
    const sampleFailRow = await db.prepare(`
      SELECT COUNT(DISTINCT asamp.item_id) as cnt
      FROM aql_samples asamp
      JOIN aql_inspections ai ON ai.id = asamp.inspection_id
      LEFT JOIN boxes b ON (b.id = ai.box_id OR UPPER(TRIM(b.box_code)) = UPPER(TRIM(ai.box_id)) OR UPPER(TRIM(b.box_number)) = UPPER(TRIM(ai.box_id)))
      WHERE (
        ai.production_order_id IN (${placeholders}) 
        OR b.production_order_id IN (${placeholders}) 
        OR ai.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))
        OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))
      ) AND UPPER(TRIM(asamp.result)) = 'FAIL'
    `).get(...poKeys, ...poKeys, ...poKeys, ...poKeys) as any;

    const aqlFailedCount = Math.max(Number(aqlFailRow?.cnt || 0), Number(sampleFailRow?.cnt || 0));

    // Operator specific AQL Passed Item Count
    const opAqlPassRow = await db.prepare(`
      SELECT COALESCE(SUM(
        CASE 
          WHEN (SELECT COUNT(*) FROM box_items bi WHERE (bi.box_id = b.id OR UPPER(TRIM(bi.box_id)) = UPPER(TRIM(ai.box_id))) AND bi.active = 1) > 0 
          THEN (SELECT COUNT(*) FROM box_items bi WHERE (bi.box_id = b.id OR UPPER(TRIM(bi.box_id)) = UPPER(TRIM(ai.box_id))) AND bi.active = 1)
          ELSE COALESCE(ai.required_samples, 1)
        END
      ), 0) as cnt
      FROM aql_inspections ai
      LEFT JOIN boxes b ON (b.id = ai.box_id OR UPPER(TRIM(b.box_code)) = UPPER(TRIM(ai.box_id)) OR UPPER(TRIM(b.box_number)) = UPPER(TRIM(ai.box_id)))
      WHERE (
        ai.production_order_id IN (${placeholders}) 
        OR b.production_order_id IN (${placeholders}) 
        OR ai.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))
        OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))
      )
      AND (ai.inspector_id = ? OR ai.inspector_id = ?)
      AND UPPER(TRIM(ai.result)) IN ('PASS', 'PASSED')
    `).get(...poKeys, ...poKeys, ...poKeys, ...poKeys, operatorId, operatorUsername) as any;
    const operatorPassedCount = Math.max(Number(opAqlPassRow?.cnt || 0), aqlPassedCount);

    // Operator specific AQL Failed Item Count
    const opAqlFailRow = await db.prepare(`
      SELECT COALESCE(SUM(
        CASE 
          WHEN (SELECT COUNT(*) FROM box_items bi WHERE (bi.box_id = b.id OR UPPER(TRIM(bi.box_id)) = UPPER(TRIM(ai.box_id))) AND bi.active = 1) > 0 
          THEN (SELECT COUNT(*) FROM box_items bi WHERE (bi.box_id = b.id OR UPPER(TRIM(bi.box_id)) = UPPER(TRIM(ai.box_id))) AND bi.active = 1)
          ELSE COALESCE(ai.required_samples, 1)
        END
      ), 0) as cnt
      FROM aql_inspections ai
      LEFT JOIN boxes b ON (b.id = ai.box_id OR UPPER(TRIM(b.box_code)) = UPPER(TRIM(ai.box_id)) OR UPPER(TRIM(b.box_number)) = UPPER(TRIM(ai.box_id)))
      WHERE (
        ai.production_order_id IN (${placeholders}) 
        OR b.production_order_id IN (${placeholders}) 
        OR ai.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))
        OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))
      )
      AND (ai.inspector_id = ? OR ai.inspector_id = ?)
      AND UPPER(TRIM(ai.result)) IN ('FAIL', 'FAILED')
    `).get(...poKeys, ...poKeys, ...poKeys, ...poKeys, operatorId, operatorUsername) as any;
    const operatorFailedCount = Math.max(Number(opAqlFailRow?.cnt || 0), aqlFailedCount);

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
  stage: z.enum(['QC', 'TEST', 'ALL']).optional(),
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

    const mode = po.qc_test_mode || 'QC_AND_TEST';
    const stationCount = Number(po.qc_station_count) === 1 ? 1 : 2;

    // Infer target stage
    let targetStage: 'QC' | 'TEST' = 'QC';
    if (parsed.stage === 'TEST' || mode === 'TEST_ONLY' || (!parsed.qcResult && parsed.testResult)) {
      targetStage = 'TEST';
    } else if (parsed.stage === 'QC' || mode === 'QC_ONLY' || (parsed.qcResult && !parsed.testResult)) {
      targetStage = 'QC';
    } else {
      targetStage = parsed.qcResult ? 'QC' : 'TEST';
    }

    // 1 Station + QC_AND_TEST validation rule:
    // Operator must submit BOTH qcResult and testResult together.
    if (stationCount === 1 && mode === 'QC_AND_TEST') {
      if (!parsed.qcResult || !parsed.testResult) {
        return res.status(400).json({
          error: 'BOTH_RESULTS_REQUIRED',
          message: 'Both Endline Inspection and Functional Test results are required before saving for 1 Station QC.'
        });
      }
    }

    // Stage-specific Operator Allocation Check
    const isAllocated = await checkOperatorAllocationForPO(operatorId, userRole, po.id, targetStage);
    if (!isAllocated) {
      return res.status(403).json({
        error: 'UNAUTHORIZED_STAGE',
        message: `Operator ${req.user!.username} is not authorized for the ${targetStage} stage on Production Order ${po.po_number || po.id}.`
      });
    }

    const isOpEnabled = await checkOperationEnabledForPO(po.id, 'QC Test');
    if (!isOpEnabled) {
      return res.status(403).json({ error: 'OPERATION_DISABLED', message: `QC Test operation is not enabled for Production Order ${po.po_number || po.id}.` });
    }

    const rangeCheck = await validateProductQrRangeForPO(po, itemQr);
    if (!rangeCheck.valid) {
      await recordScanEvent(idempotencyKey || '', operatorId, 'QC_TEST', itemQr, 'REJECTED', rangeCheck.error, rangeCheck.message);
      return res.status(400).json({
        error: rangeCheck.error,
        message: rangeCheck.message,
        expectedRange: (rangeCheck as any).expectedRange
      });
    }

    if (idempotencyKey) {
      const existing = await checkIdempotency(idempotencyKey, operatorId, 'QC_TEST', itemQr);
      if (existing && existing.result === 'ACCEPTED') {
        const progress = await calculatePOProgress(po.id);
        return res.json({ status: 'DUPLICATE_PROCESSED', message: 'Scan already processed idempotently.', progress });
      }
    }

    let item = await db.prepare(`
      SELECT * FROM item_units 
      WHERE (production_order_id = ? OR production_order_id = ? OR production_order_id = ? OR production_order_id IS NULL)
        AND UPPER(TRIM(qr_code)) = ?
    `).get(po.id, po.po_number, po.map_po, itemQr) as any;

    if (!item) {
      const itemId = `itm-${po.id}-${itemQr}`;
      await db.prepare(`
        INSERT INTO item_units (id, qr_code, production_order_id, product_config_id, size, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'CREATED', NOW(3), NOW(3))
      `).run(itemId, itemQr, po.id, rangeCheck.config?.id || null, rangeCheck.config?.size || 'L');
      item = { id: itemId, qr_code: itemQr, production_order_id: po.id, status: 'CREATED' };
    } else {
      await db.prepare(`UPDATE item_units SET production_order_id = ?, product_config_id = ?, updated_at = NOW(3) WHERE id = ?`).run(po.id, rangeCheck.config?.id || null, item.id);
      item.production_order_id = po.id;
    }

    const existingQc = await db.prepare(`SELECT * FROM qc_results WHERE item_id = ?`).get(item.id) as any;

    const isCombinedSave = parsed.stage === 'ALL' || (parsed.qcResult && parsed.testResult);

    // Stage-specific duplicate check (only if not combined re-save or if already fully completed)
    if (!isCombinedSave && targetStage === 'QC' && existingQc && existingQc.qc_result === 'PASS') {
      const progress = await calculatePOProgress(po.id);
      return res.status(200).json({
        message: `QC stage already completed for item ${itemQr}.`,
        itemQr,
        isDuplicate: true,
        targetStage,
        stageStatus: {
          qcResult: existingQc.qc_result,
          testResult: existingQc.test_result || 'PENDING',
          qcCompleted: true,
          testCompleted: existingQc.test_result === 'PASS',
          isFullyCompleted: mode === 'QC_ONLY' || existingQc.test_result === 'PASS'
        },
        progress
      });
    }

    if (!isCombinedSave && targetStage === 'TEST' && existingQc && existingQc.test_result === 'PASS') {
      const progress = await calculatePOProgress(po.id);
      return res.status(200).json({
        message: `Test stage already completed for item ${itemQr}.`,
        itemQr,
        isDuplicate: true,
        targetStage,
        stageStatus: {
          qcResult: existingQc?.qc_result || 'PENDING',
          testResult: existingQc.test_result,
          qcCompleted: existingQc?.qc_result === 'PASS',
          testCompleted: true,
          isFullyCompleted: mode === 'TEST_ONLY' || existingQc?.qc_result === 'PASS'
        },
        progress
      });
    }

    let nextQcResult = existingQc?.qc_result || 'PENDING';
    let nextTestResult = existingQc?.test_result || 'PENDING';
    let qcOpId = existingQc?.operator_id || operatorId;
    let testOpId = existingQc?.test_operator_id || (targetStage === 'TEST' ? operatorId : null);
    let qcScannedAt = existingQc?.scanned_at || new Date();
    let testScannedAt = existingQc?.test_scanned_at || (targetStage === 'TEST' ? new Date() : null);

    if (isCombinedSave || (stationCount === 1 && mode === 'QC_AND_TEST')) {
      nextQcResult = parsed.qcResult!;
      nextTestResult = parsed.testResult!;
      qcOpId = operatorId;
      testOpId = operatorId;
      qcScannedAt = new Date();
      testScannedAt = new Date();
    } else if (targetStage === 'QC') {
      if (!parsed.qcResult) {
        return res.status(400).json({ error: 'QC_RESULT_REQUIRED', message: 'QC Result (PASS/FAIL) is required.' });
      }
      nextQcResult = parsed.qcResult;
      qcOpId = operatorId;
      qcScannedAt = new Date();
      if (mode === 'QC_ONLY') {
        nextTestResult = 'PASS';
      }
    } else if (targetStage === 'TEST') {
      if (!parsed.testResult) {
        return res.status(400).json({ error: 'TEST_RESULT_REQUIRED', message: 'Test Result (PASS/FAIL) is required.' });
      }
      nextTestResult = parsed.testResult;
      testOpId = operatorId;
      testScannedAt = new Date();
      if (mode === 'TEST_ONLY') {
        nextQcResult = 'PASS';
      }
    }

    let isFullyCompleted = false;
    if (mode === 'QC_ONLY') {
      isFullyCompleted = nextQcResult === 'PASS';
    } else if (mode === 'TEST_ONLY') {
      isFullyCompleted = nextTestResult === 'PASS';
    } else {
      isFullyCompleted = nextQcResult === 'PASS' && nextTestResult === 'PASS';
    }

    const finalItemStatus = isFullyCompleted ? 'QC_PASSED' : (nextQcResult === 'FAIL' || nextTestResult === 'FAIL' ? 'QC_FAILED' : 'CREATED');

    const existingFailsRow = await db.prepare(`SELECT COUNT(*) as cnt FROM qc_fail_log WHERE item_id = ?`).get(item.id) as any;
    let failCount = existingFailsRow?.cnt || 0;
    let retryCount = 0;

    await db.transaction(async (tx) => {
      const stageResultVal = targetStage === 'QC' ? nextQcResult : nextTestResult;
      if (stageResultVal === 'FAIL') {
        failCount += 1;
        const failLogId = `qcfail-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
        await tx.prepare(`
          INSERT INTO qc_fail_log (id, item_id, operator_id, qc_result, test_result, failure_reason, attempt_number, scanned_at, idempotency_key, raw_qr, po_id, failure_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3), ?, ?, ?, ?)
        `).run(failLogId, item.id, operatorId, nextQcResult, nextTestResult, failureReason || null, failCount, idempotencyKey || null, itemQr, po.id, `${targetStage}_FAIL`);

        const alertId = `alt-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
        await tx.prepare(`
          INSERT INTO alerts (id, user_id, role_target, category, severity, title, message, reference_type, reference_id, created_at)
          VALUES (?, NULL, 'SUPERVISOR', 'QUALITY', 'WARNING', 'QC Test Failure Alert', ?, 'qc_fail_log', ?, NOW(3))
        `).run(alertId, `${targetStage} failed for item ${itemQr} on PO ${po.po_number} (Reason: ${failureReason || 'Defect detected'})`, failLogId);
      }

      if (existingQc) {
        retryCount = (existingQc.retry_count || 0) + 1;
        await tx.prepare(`
          UPDATE qc_results 
          SET operator_id = ?, test_operator_id = ?, qc_result = ?, test_result = ?, failure_reason = ?, retry_count = ?, scanned_at = ?, test_scanned_at = NOW(3)
          WHERE item_id = ?
        `).run(qcOpId, testOpId, nextQcResult, nextTestResult, failureReason || existingQc.failure_reason || null, retryCount, qcScannedAt, item.id);
      } else {
        retryCount = 0;
        const qcId = `qc-${Date.now()}`;
        await tx.prepare(`
          INSERT INTO qc_results (id, item_id, operator_id, test_operator_id, qc_result, test_result, failure_reason, retry_count, first_scanned_at, scanned_at, test_scanned_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, NOW(3), ?, ?)
        `).run(qcId, item.id, qcOpId, testOpId, nextQcResult, nextTestResult, failureReason || null, qcScannedAt, testScannedAt);
      }

      await tx.prepare(`UPDATE item_units SET status = ?, updated_at = NOW(3) WHERE id = ?`).run(finalItemStatus, item.id);
    });

    await recordScanEvent(idempotencyKey || '', operatorId, 'QC_TEST', itemQr, 'ACCEPTED');
    await auditLog(operatorId, `${targetStage}_RESULT_SAVED`, 'item_units', item.id, { stage: targetStage, qcResult: nextQcResult, testResult: nextTestResult });

    const progress = await calculatePOProgress(po.id);

    return res.status(200).json({
      message: isFullyCompleted ? 'QC & Test Completed!' : `${targetStage} Result Saved!`,
      itemQr,
      status: finalItemStatus,
      targetStage,
      stageStatus: {
        qcResult: nextQcResult,
        testResult: nextTestResult,
        qcCompleted: nextQcResult === 'PASS',
        testCompleted: nextTestResult === 'PASS',
        isFullyCompleted
      },
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

    const configCheck = await validateProductForProductionOrder(po, itemQr);
    if (!configCheck.valid) {
      await recordScanEvent(idempotencyKey || '', operatorId, 'PACKING', itemQr, 'REJECTED', configCheck.error, configCheck.message);
      return res.status(400).json({
        error: configCheck.error,
        message: configCheck.message
      });
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
    } else {
      if (!box.production_order_id || box.production_order_id !== po.id) {
        await db.prepare(`UPDATE boxes SET production_order_id = ?, updated_at = NOW(3) WHERE id = ?`).run(po.id, box.id);
        box.production_order_id = po.id;
      }
    }

    const currentItemsCountRow = await db.prepare(`SELECT COUNT(*) as cnt FROM box_items WHERE box_id = ? AND active = 1`).get(box.id) as any;
    const currentItemsCount = currentItemsCountRow?.cnt || 0;
    if (currentItemsCount >= box.capacity) {
      await recordScanEvent(idempotencyKey || '', operatorId, 'PACKING', itemQr, 'REJECTED', 'BOX_FULL', 'Box capacity reached');
      return res.status(400).json({ error: 'BOX_FULL', message: `Box ${boxNumber} is already full (${box.capacity}/${box.capacity}).` });
    }

    let item = await db.prepare(`
      SELECT * FROM item_units 
      WHERE (production_order_id = ? OR production_order_id = ? OR production_order_id = ? OR production_order_id IS NULL)
        AND UPPER(TRIM(qr_code)) = ?
    `).get(po.id, po.po_number, po.map_po, itemQr.trim().toUpperCase()) as any;

    if (!item) {
      await recordScanEvent(idempotencyKey || '', operatorId, 'PACKING', itemQr, 'REJECTED', 'ITEM_NOT_FOUND', 'Product not found for Production Order');
      return res.status(400).json({ error: 'ITEM_NOT_FOUND', message: `Product not found for Production Order ${po.po_number || po.id}.` });
    }

    const isPoMatch = !item.production_order_id || 
      item.production_order_id === po.id || 
      item.production_order_id === po.po_number || 
      item.production_order_id === po.map_po;

    if (!isPoMatch) {
      await recordScanEvent(idempotencyKey || '', operatorId, 'PACKING', itemQr, 'REJECTED', 'PO_MISMATCH', 'Product belongs to a different Production Order');
      return res.status(400).json({ error: 'PO_MISMATCH', message: `Product belongs to a different Production Order.` });
    }

    if (!item.production_order_id) {
      await db.prepare(`UPDATE item_units SET production_order_id = ?, updated_at = NOW(3) WHERE id = ?`).run(po.id, item.id);
      item.production_order_id = po.id;
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

    const progress = await calculatePackingProgress(po.id, req.user);

    return res.status(201).json({
      message: `Item ${itemQr} packed into box ${boxNumber}`,
      boxNumber,
      itemCount: currentItemsCount + 1,
      capacity: box.capacity,
      isFull: currentItemsCount + 1 >= box.capacity,
      progress
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
    const { boxNumber, stage } = req.body;
    const operatorId = req.user!.id;
    const isFinalAql = stage === 'FINAL_AQL' || stage === 'FINAL AQL' || stage === 'Final AQL';
    const targetStage = isFinalAql ? 'FINAL_AQL' : 'AQL';
    const opCheckStage = isFinalAql ? 'FINAL_AQL' : 'AQL';
    const opCheckName = isFinalAql ? 'FINAL AQL' : 'AQL Checker';

    let box = await db.prepare(`SELECT * FROM boxes WHERE UPPER(TRIM(box_code)) = ? OR UPPER(TRIM(box_number)) = ?`).get(boxNumber.trim().toUpperCase(), boxNumber.trim().toUpperCase()) as any;
    if (!box) {
      return res.status(404).json({ error: 'BOX_NOT_FOUND', message: `Box ${boxNumber} not found.` });
    }

    if (box.production_order_id) {
      if (!(await checkOperatorAllocationForPO(operatorId, req.user!.role, box.production_order_id, opCheckStage))) {
        return res.status(403).json({ error: 'OPERATOR_UNAUTHORIZED', message: `Operator is not authorized for ${isFinalAql ? 'Final AQL' : 'Normal AQL'} on this Production Order.` });
      }
      if (!(await checkOperationEnabledForPO(box.production_order_id, opCheckName))) {
        return res.status(403).json({ error: 'OPERATION_DISABLED', message: `${isFinalAql ? 'Final AQL' : 'AQL Checker'} operation is not enabled for this Production Order.` });
      }
    }

    let items = await db.prepare(`
      SELECT u.id, u.qr_code, u.size, u.status 
      FROM box_items bi 
      JOIN item_units u ON bi.item_id = u.id 
      WHERE bi.box_id = ? AND bi.active = 1
      ORDER BY bi.packed_at ASC, bi.id ASC
    `).all(box.id) as any[];

    // Fetch permanently removed items for this box or PO to ensure they NEVER re-appear
    const permanentlyRemovedRows = await db.prepare(`
      SELECT item_qr FROM permanently_removed_items WHERE box_id = ? OR production_order_id = ?
    `).all(box.id, box.production_order_id) as any[];
    const permanentlyRemovedQrs = Array.from(new Set(permanentlyRemovedRows.map(r => r.item_qr ? r.item_qr.trim().toUpperCase() : '')));

    // Filter items to strictly exclude permanently removed QRs
    const activeItems = items.filter(i => !permanentlyRemovedQrs.includes(i.qr_code.trim().toUpperCase()));
    const totalItems = activeItems.length;

    // Check box completeness: Only fully packed / completed boxes can undergo AQL or Final AQL inspection
    const isCompletedStatus = ['COMPLETE', 'COMPLETED', 'SEALED', 'CLOSED', 'FULL', 'AQL_PASSED', 'AQL_FAILED', 'FINAL_AQL_PASSED', 'FINAL_AQL_FAILED', 'TRANSFERRED'].includes((box.status || '').toUpperCase());
    const requiredCapacity = box.capacity || 12;

    if (!isCompletedStatus || totalItems < requiredCapacity) {
      return res.status(400).json({
        error: 'BOX_NOT_COMPLETED',
        message: `Box ${boxNumber} is not fully packed / completed (${totalItems}/${requiredCapacity} items). Only fully packed boxes can undergo ${isFinalAql ? 'Final AQL' : 'AQL'} inspection.`
      });
    }

    // Check for an existing inspection on this box for THIS STAGE
    let existingInspection = await db.prepare(`
      SELECT ai.*, u.full_name as inspector_name, u.username as inspector_username
      FROM aql_inspections ai
      LEFT JOIN users u ON u.id = ai.inspector_id
      WHERE ai.box_id = ? AND (ai.stage = ? OR (? = 'AQL' AND ai.stage IS NULL))
      ORDER BY ai.started_at DESC LIMIT 1
    `).get(box.id, targetStage, targetStage) as any;

    let inspectionId = existingInspection ? existingInspection.id : `aql-${targetStage.toLowerCase()}-${Date.now()}`;

    if (!existingInspection) {
      await db.prepare(`
        INSERT INTO aql_inspections (id, box_id, production_order_id, inspector_id, required_samples, result, stage, started_at)
        VALUES (?, ?, ?, ?, ?, 'PENDING', ?, NOW(3))
      `).run(inspectionId, box.id, box.production_order_id, operatorId, totalItems > 0 ? totalItems : 3, targetStage);
    }

    // Load previous sample records for items in this box FOR THIS INSPECTION STAGE
    const previousPassedSamples = await db.prepare(`
      SELECT DISTINCT u.qr_code as itemQr, asamp.result, asamp.action_type as actionType, asamp.sample_number as sampleNumber
      FROM aql_samples asamp
      JOIN aql_inspections ai ON ai.id = asamp.inspection_id
      JOIN item_units u ON u.id = asamp.item_id
      WHERE ai.id = ? AND UPPER(TRIM(asamp.result)) = 'PASS'
    `).all(inspectionId) as any[];

    // Load item-wise AQL inspection history for THIS INSPECTION STAGE
    const itemAqlHistory = await db.prepare(`
      SELECT u.qr_code as itemQr, asamp.result, asamp.action_type as actionType, asamp.failure_reason as failureReason, asamp.scanned_at as scannedAt, asamp.sample_number as sampleNumber
      FROM aql_samples asamp
      JOIN aql_inspections ai ON ai.id = asamp.inspection_id
      JOIN item_units u ON u.id = asamp.item_id
      WHERE ai.id = ?
      ORDER BY asamp.scanned_at DESC
    `).all(inspectionId) as any[];

    const existingCompletedInspection = (existingInspection && ['PASS', 'PASSED', 'FAIL', 'FAILED'].includes((existingInspection.result || '').toUpperCase()))
      ? existingInspection
      : null;

    return res.json({
      box: {
        box_number: box.box_code || box.box_number,
        production_order_id: box.production_order_id,
        item_count: totalItems,
        items: activeItems
      },
      stage: targetStage,
      inspectionId,
      existingCompletedInspection,
      requiredSamples: totalItems > 0 ? totalItems : 3,
      previousPassedSamples: previousPassedSamples || [],
      permanentlyRemovedQrs,
      itemAqlHistory
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
    const code = itemQr ? itemQr.trim().toUpperCase() : '';

    const insp = await db.prepare(`SELECT * FROM aql_inspections WHERE id = ?`).get(inspectionId) as any;
    if (!insp) {
      return res.status(404).json({ error: 'INSPECTION_NOT_FOUND', message: 'AQL inspection record not found' });
    }

    if (insp.production_order_id) {
      const configCheck = await validateProductForProductionOrder(insp.production_order_id, code);
      if (!configCheck.valid) {
        return res.status(400).json({ error: configCheck.error, message: configCheck.message });
      }
    }

    let item = await db.prepare(`
      SELECT * FROM item_units 
      WHERE (production_order_id = ? OR production_order_id IS NULL) 
        AND UPPER(TRIM(qr_code)) = ?
    `).get(insp.production_order_id, code) as any;
    if (!item) {
      return res.status(400).json({ error: 'ITEM_NOT_FOUND', message: `Product '${code}' not found for Production Order.` });
    }

    const isPoMatch = !item.production_order_id || 
      item.production_order_id === insp.production_order_id;

    if (!isPoMatch) {
      return res.status(400).json({ error: 'PO_MISMATCH', message: `Product does not belong to this Production Order.` });
    }

    const inBox = await db.prepare(`SELECT * FROM box_items WHERE box_id = ? AND item_id = ? AND active = 1`).get(insp.box_id, item.id);
    if (!inBox) {
      return res.status(400).json({
        error: 'ITEM_NOT_IN_BOX',
        message: `Sample barcode (${code}) does not belong to the scanned box.`
      });
    }

    // Verify sequential order against active box items in DB
    const orderedBoxItems = await db.prepare(`
      SELECT u.id, u.qr_code 
      FROM box_items bi 
      JOIN item_units u ON bi.item_id = u.id 
      WHERE bi.box_id = ? AND bi.active = 1
      ORDER BY bi.packed_at ASC, bi.id ASC
    `).all(insp.box_id) as any[];

    const permanentlyRemovedRows = await db.prepare(`
      SELECT item_qr FROM permanently_removed_items WHERE box_id = ? OR production_order_id = ?
    `).all(insp.box_id, insp.production_order_id) as any[];
    const permRemovedSet = new Set(permanentlyRemovedRows.map(r => r.item_qr ? r.item_qr.trim().toUpperCase() : ''));

    const activeOrderedItems = orderedBoxItems.filter(i => !permRemovedSet.has(i.qr_code.trim().toUpperCase()));
    const sNum = Number(sampleNumber) || 1;

    if (sNum > 1) {
      const prevItem = activeOrderedItems[sNum - 2];
      if (prevItem) {
        const prevSample = await db.prepare(`
          SELECT * FROM aql_samples WHERE inspection_id = ? AND item_id = ?
        `).get(inspectionId, prevItem.id) as any;
        if (!prevSample) {
          return res.status(400).json({
            error: 'CURRENT_ITEM_RESULT_REQUIRED',
            message: `Please select PASS or FAIL for the current item (${prevItem.qr_code}) before scanning the next item.`
          });
        }
      }
    }

    const expectedItem = activeOrderedItems[sNum - 1];

    if (expectedItem && code !== expectedItem.qr_code.trim().toUpperCase()) {
      return res.status(400).json({
        error: 'WRONG_SEQUENCE',
        message: `Wrong product. Please scan ${expectedItem.qr_code} first.`,
        expectedQr: expectedItem.qr_code,
        scannedQr: code
      });
    }

    if (!result || (result !== 'PASS' && result !== 'FAIL')) {
      return res.status(400).json({
        error: 'RESULT_REQUIRED',
        message: `Please select PASS or FAIL for item ${code}.`
      });
    }

    const sampleId = `aqls-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
    const { actionType, failureReason } = req.body;
    const actType = actionType || (result === 'PASS' ? 'PASSED' : 'REUSED');

    await db.prepare(`
      INSERT INTO aql_samples (id, inspection_id, item_id, sample_number, result, action_type, failure_reason, scanned_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))
      ON DUPLICATE KEY UPDATE result = VALUES(result), action_type = VALUES(action_type), failure_reason = VALUES(failure_reason), scanned_at = NOW(3)
    `).run(sampleId, inspectionId, item.id, sampleNumber, result, actType, failureReason || null);

    return res.json({ message: 'Sample recorded', sampleNumber, result, actionType: actType, itemQr });
  } catch (err) {
    next(err);
  }
});

// POST /api/aql/items/permanently-remove
const removeSchema = z.object({
  itemQr: z.string().min(1),
  boxNumber: z.string().optional(),
  inspectionId: z.string().optional(),
  reason: z.string().optional()
});

router.post('/aql/items/permanently-remove', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const { itemQr, boxNumber, inspectionId, reason } = removeSchema.parse(req.body);
    const operatorId = req.user!.id;

    const qr = itemQr.trim().toUpperCase();
    let box = boxNumber ? await db.prepare(`SELECT * FROM boxes WHERE UPPER(TRIM(box_code)) = ? OR UPPER(TRIM(box_number)) = ?`).get(boxNumber.trim().toUpperCase(), boxNumber.trim().toUpperCase()) as any : null;
    const targetPoId = box?.production_order_id || null;

    const item = targetPoId ? await db.prepare(`
      SELECT * FROM item_units 
      WHERE (production_order_id = ? OR production_order_id IS NULL) 
        AND UPPER(TRIM(qr_code)) = ?
    `).get(targetPoId, qr) as any : await db.prepare(`SELECT * FROM item_units WHERE UPPER(TRIM(qr_code)) = ?`).get(qr) as any;

    const alreadyRemoved = await db.prepare(`
      SELECT * FROM permanently_removed_items 
      WHERE UPPER(TRIM(item_qr)) = ? OR (item_id IS NOT NULL AND item_id = ?)
    `).get(qr, item?.id || null) as any;

    if (alreadyRemoved || item?.status === 'PERMANENTLY_REMOVED') {
      return res.status(400).json({
        success: false,
        error: 'ALREADY_REMOVED',
        message: `Product '${qr}' has already been permanently removed.`,
        itemQr: qr,
        boxNumber: box?.box_code || box?.box_number || boxNumber || null
      });
    }

    const removeId = `prm-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
    const poId = item?.production_order_id || box?.production_order_id || null;
    const boxId = box?.id || null;
    const itemId = item?.id || null;

    await db.transaction(async (tx) => {
      await tx.prepare(`
        INSERT INTO permanently_removed_items (id, item_id, item_qr, box_id, production_order_id, removed_by, action_type, reason, removed_at)
        VALUES (?, ?, ?, ?, ?, ?, 'PERMANENTLY_REMOVE', ?, NOW(3))
      `).run(removeId, itemId, qr, boxId, poId, operatorId, reason || 'Irreparable Damaged Item removed during AQL Inspection');

      if (itemId) {
        await tx.prepare(`UPDATE box_items SET active = 0 WHERE item_id = ?`).run(itemId);
        await tx.prepare(`UPDATE item_units SET status = 'PERMANENTLY_REMOVED', updated_at = NOW(3) WHERE id = ?`).run(itemId);
      } else if (boxId) {
        await tx.prepare(`UPDATE box_items SET active = 0 WHERE box_id = ? AND item_id IN (SELECT id FROM item_units WHERE UPPER(TRIM(qr_code)) = ?)`).run(boxId, qr);
      }

      if (itemId) {
        const failId = `qcf-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
        await tx.prepare(`
          INSERT INTO qc_fail_log (id, item_id, operator_id, qc_result, test_result, failure_reason, attempt_number, scanned_at, po_id, failure_type)
          VALUES (?, ?, ?, 'FAIL', 'FAIL', ?, 1, NOW(3), ?, 'PERMANENTLY_REMOVED')
        `).run(failId, itemId, operatorId, `PERMANENTLY_REMOVED: ${reason || 'Damaged Garment Scrapped'}`, poId);
      }

      if (inspectionId && itemId) {
        const sampleId = `aqls-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
        await tx.prepare(`
          INSERT INTO aql_samples (id, inspection_id, item_id, sample_number, result, action_type, failure_reason, scanned_at)
          VALUES (?, ?, ?, 1, 'FAIL', 'PERMANENTLY_REMOVE', ?, NOW(3))
          ON DUPLICATE KEY UPDATE result = 'FAIL', action_type = 'PERMANENTLY_REMOVE', failure_reason = VALUES(failure_reason), scanned_at = NOW(3)
        `).run(sampleId, inspectionId, itemId, reason || 'Damaged Garment Scrapped');
      }
    });

    await recordScanEvent('', operatorId, 'AQL', qr, 'REJECTED', 'PERMANENTLY_REMOVED', reason || 'Item permanently removed');
    await auditLog(operatorId, 'PERMANENTLY_REMOVE_ITEM', 'permanently_removed_items', removeId, { itemQr: qr, reason });

    const boxCodeStr = box?.box_code || box?.box_number || boxNumber || 'box';

    return res.status(200).json({
      success: true,
      removed: true,
      removeId,
      itemQr: qr,
      boxNumber: boxCodeStr,
      message: `${qr} was permanently removed from ${boxCodeStr}.`
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/aql/inspections/direct-complete
router.post('/aql/inspections/direct-complete', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const { boxNumber, result, failureReason, stage } = req.body;
    const operatorId = req.user!.id;
    const targetStage = stage === 'FINAL_AQL' || stage === 'FINAL AQL' ? 'FINAL_AQL' : 'AQL';
    const isFinalAql = targetStage === 'FINAL_AQL';

    let box = await db.prepare(`SELECT * FROM boxes WHERE UPPER(TRIM(box_code)) = ? OR UPPER(TRIM(box_number)) = ?`).get(boxNumber.trim().toUpperCase(), boxNumber.trim().toUpperCase()) as any;
    if (!box) {
      return res.status(404).json({ error: 'BOX_NOT_FOUND', message: 'Box not found' });
    }

    const inspectionId = `aql-${targetStage.toLowerCase()}-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
    await db.prepare(`
      INSERT INTO aql_inspections (id, box_id, production_order_id, inspector_id, required_samples, result, stage, failure_reason, started_at, completed_at)
      VALUES (?, ?, ?, ?, 12, ?, ?, ?, NOW(3), NOW(3))
    `).run(inspectionId, box.id, box.production_order_id, operatorId, result, targetStage, failureReason || null);

    const boxStatus = result === 'PASSED'
      ? (isFinalAql ? 'FINAL_AQL_PASSED' : 'AQL_PASSED')
      : (isFinalAql ? 'FINAL_AQL_FAILED' : 'AQL_FAILED');

    await db.prepare(`UPDATE boxes SET status = ?, completed_at = NOW(3) WHERE id = ?`).run(boxStatus, box.id);

    return res.json({ message: 'AQL Direct Complete finalized', inspectionId, result, stage: targetStage });
  } catch (err) {
    next(err);
  }
});

// POST /api/aql/inspections/:id/complete
router.post('/aql/inspections/:id/complete', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    let inspectionId = req.params.id;
    const { result, failureReason, boxNumber, samples, stage } = req.body;
    const operatorId = req.user!.id;

    let box = boxNumber ? await db.prepare(`SELECT * FROM boxes WHERE UPPER(TRIM(box_code)) = ? OR UPPER(TRIM(box_number)) = ?`).get(boxNumber.trim().toUpperCase(), boxNumber.trim().toUpperCase()) as any : null;
    let insp = await db.prepare(`SELECT * FROM aql_inspections WHERE id = ?`).get(inspectionId) as any;

    const targetStage = insp?.stage || stage || 'AQL';
    const isFinalAql = targetStage === 'FINAL_AQL' || targetStage === 'FINAL AQL';

    if (!insp) {
      if (!box) {
        return res.status(404).json({ error: 'BOX_NOT_FOUND', message: 'Box not found' });
      }

      await db.prepare(`
        INSERT INTO aql_inspections (id, box_id, production_order_id, inspector_id, required_samples, result, stage, failure_reason, started_at, completed_at)
        VALUES (?, ?, ?, ?, 12, ?, ?, ?, NOW(3), NOW(3))
      `).run(inspectionId, box.id, box.production_order_id, operatorId, result || 'PASSED', targetStage, failureReason || null);
      insp = { id: inspectionId, box_id: box.id, production_order_id: box.production_order_id, stage: targetStage };
    }

    // Upsert all completed samples into aql_samples
    if (Array.isArray(samples) && samples.length > 0) {
      for (const s of samples) {
        if (!s.itemQr) continue;
        const item = await db.prepare(`SELECT id FROM item_units WHERE UPPER(TRIM(qr_code)) = ?`).get(s.itemQr.trim().toUpperCase()) as any;
        if (item) {
          const sampleId = `aqls-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
          const actType = s.actionType || (s.result === 'PASS' ? 'PASSED' : 'REUSED');
          await db.prepare(`
            INSERT INTO aql_samples (id, inspection_id, item_id, sample_number, result, action_type, failure_reason, scanned_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))
            ON DUPLICATE KEY UPDATE result = VALUES(result), action_type = VALUES(action_type), failure_reason = VALUES(failure_reason), scanned_at = NOW(3)
          `).run(sampleId, inspectionId, item.id, s.sampleIndex || s.sampleNumber || 1, s.result || 'PASS', actType, s.failureReason || null);
        }
      }
    }

    const targetBoxId = insp.box_id || box?.id;
    let finalResult = result || 'PASSED';

    if (targetBoxId) {
      const activeBoxItems = await db.prepare(`
        SELECT u.id, u.qr_code
        FROM box_items bi
        JOIN item_units u ON u.id = bi.item_id
        WHERE bi.box_id = ? AND bi.active = 1
      `).all(targetBoxId) as any[];

      const permRemovedRows = await db.prepare(`
        SELECT item_qr FROM permanently_removed_items WHERE box_id = ? OR production_order_id = ?
      `).all(targetBoxId, insp.production_order_id || box?.production_order_id) as any[];
      const permRemovedSet = new Set(permRemovedRows.map(r => r.item_qr ? r.item_qr.trim().toUpperCase() : ''));
      const activeToVerify = activeBoxItems.filter(i => !permRemovedSet.has(i.qr_code.trim().toUpperCase()));
      const totalBoxItemsCount = activeToVerify.length;

      const sampleRows = await db.prepare(`
        SELECT DISTINCT item_id, result FROM aql_samples WHERE inspection_id = ?
      `).all(inspectionId) as any[];

      const verifiedCount = sampleRows.length;
      const hasAnyFail = sampleRows.some(s => (s.result || '').toUpperCase() === 'FAIL');

      if (hasAnyFail || result === 'FAILED' || result === 'FAIL') {
        finalResult = 'FAILED';
      } else if (totalBoxItemsCount > 0 && verifiedCount >= totalBoxItemsCount) {
        finalResult = 'PASSED';
      } else {
        finalResult = 'IN_PROGRESS';
      }

      let poId = insp.production_order_id;
      if (!poId && box?.production_order_id) poId = box.production_order_id;

      await db.prepare(`
        UPDATE aql_inspections 
        SET result = ?, failure_reason = ?, production_order_id = COALESCE(production_order_id, ?), completed_at = NOW(3) 
        WHERE id = ?
      `).run(finalResult, failureReason || null, poId || null, inspectionId);

      if (finalResult === 'PASSED') {
        const boxStatus = isFinalAql ? 'FINAL_AQL_PASSED' : 'AQL_PASSED';
        await db.prepare(`UPDATE boxes SET status = ?, completed_at = NOW(3) WHERE id = ?`).run(boxStatus, targetBoxId);
      } else if (finalResult === 'FAILED') {
        const boxStatus = isFinalAql ? 'FINAL_AQL_FAILED' : 'AQL_FAILED';
        await db.prepare(`UPDATE boxes SET status = ?, completed_at = NOW(3) WHERE id = ?`).run(boxStatus, targetBoxId);
      }
    }

    return res.json({ message: 'AQL Inspection session saved', inspectionId, result: finalResult, stage: targetStage });
  } catch (err) {
    next(err);
  }
});

export default router;
