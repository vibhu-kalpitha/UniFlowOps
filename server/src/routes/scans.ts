import { Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { db } from '../db/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { auditLog } from '../middleware/errorHandler';

const router = ExpressRouter();

// Helper to check idempotency key
function checkIdempotency(key: string, operatorId: string, operation: string, rawCode: string): any | null {
  if (!key) return null;
  const existing = db.prepare(`SELECT * FROM scan_events WHERE idempotency_key = ?`).get(key) as any;
  return existing || null;
}

function recordScanEvent(key: string, operatorId: string, operation: string, rawCode: string, result: 'ACCEPTED' | 'REJECTED' | 'DUPLICATE', errCode?: string, errMsg?: string) {
  if (!key) return;
  const id = `scan-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO scan_events (id, idempotency_key, operator_id, operation, raw_code, normalized_code, device_type, result, error_code, error_message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'KEYBOARD_WEDGE', ?, ?, ?, ?)
    ON CONFLICT(idempotency_key) DO NOTHING
  `).run(id, key, operatorId, operation, rawCode, rawCode.trim().toUpperCase(), result, errCode || null, errMsg || null, now);
}

// Helper to resolve SO safely from ID, so_number, or map_so
export function resolveSO(soKey?: string | null) {
  if (!soKey) {
    return db.prepare(`SELECT * FROM sales_orders ORDER BY created_at DESC LIMIT 1`).get() as any;
  }
  let so = db.prepare(`SELECT * FROM sales_orders WHERE id = ? OR so_number = ? OR map_so = ?`).get(soKey, soKey, soKey) as any;
  if (!so) {
    so = db.prepare(`SELECT * FROM sales_orders ORDER BY created_at DESC LIMIT 1`).get() as any;
  }
  return so;
}

// Helper to count distinct item units admitted to QC for an SO
export function getSOAdmittedItemCount(soId: string): number {
  const row = db.prepare(`
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
export function isItemAdmitted(itemId: string): boolean {
  const row = db.prepare(`
    SELECT 1 FROM (
      SELECT item_id FROM qc_results WHERE item_id = ?
      UNION
      SELECT item_id FROM qc_fail_log WHERE item_id = ?
    )
  `).get(itemId, itemId) as any;
  return !!row;
}

// 0. POST /api/qc/scan
router.post('/qc/scan', authenticateToken, (req: AuthRequest, res, next) => {
  try {
    const rawCode = req.body.code || req.body.itemQr;
    const targetSoKey = req.body.salesOrderId || req.body.salesOrderNumber || null;
    if (!rawCode || typeof rawCode !== 'string') {
      return res.status(400).json({ error: 'INVALID_QR', message: 'Barcode is required' });
    }
    const code = rawCode.trim().toUpperCase();
    const so = resolveSO(targetSoKey);

    const item = db.prepare(`SELECT * FROM item_units WHERE UPPER(TRIM(qr_code)) = ?`).get(code) as any;
    if (item) {
      const existingPass = db.prepare(`
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
      const admittedCount = getSOAdmittedItemCount(so.id);
      const isAlreadyAdmitted = item && isItemAdmitted(item.id);
      if (!isAlreadyAdmitted && admittedCount >= so.order_quantity) {
        return res.status(400).json({
          error: 'SO_QUANTITY_REACHED',
          message: `This sales order already has ${so.order_quantity} of ${so.order_quantity} pieces registered for QC.`
        });
      }
    }

    const progress = so ? calculateSOProgress(so.id) : undefined;
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

// Helper for operator allocation check
export function checkOperatorAllocation(operatorId: string, role: string, soId: string, operation: string): boolean {
  if (role === 'SUPERVISOR' || role === 'ADMIN') return true;

  // Check total assigned operators for this SO
  const totalAssignedRow = db.prepare(`
    SELECT COUNT(*) as cnt FROM operator_work_assignments
    WHERE sales_order_id = ? AND active = 1
  `).get(soId) as any;

  const totalAssigned = totalAssignedRow?.cnt || 0;

  // If no operators are assigned to this SO yet, allow any operator to work on it
  if (totalAssigned === 0) {
    return true;
  }

  // If specific operators are assigned, check if THIS operator is allocated
  const row = db.prepare(`
    SELECT COUNT(*) as cnt FROM operator_work_assignments
    WHERE sales_order_id = ? AND operator_id = ? AND active = 1
  `).get(soId, operatorId) as any;

  return !!(row && row.cnt > 0);
}

// Helper to update SO and PO completion status
function checkAndUpdateSOCompletion(soId: string) {
  const so = db.prepare(`SELECT * FROM sales_orders WHERE id = ?`).get(soId) as any;
  if (!so) return;

  const qcPassed = (db.prepare(`
    SELECT COUNT(*) as cnt FROM qc_results qr
    JOIN item_units iu ON iu.id = qr.item_id
    WHERE iu.sales_order_id = ? AND qr.qc_result = 'PASS' AND qr.test_result = 'PASS'
  `).get(so.id) as any)?.cnt || 0;

  const packed = (db.prepare(`
    SELECT COUNT(*) as cnt FROM box_items bi
    JOIN boxes b ON b.id = bi.box_id
    WHERE b.sales_order_id = ?
  `).get(so.id) as any)?.cnt || 0;

  if (qcPassed >= so.order_quantity && packed >= so.order_quantity) {
    const now = new Date().toISOString();
    db.prepare(`UPDATE sales_orders SET status = 'COMPLETED', updated_at = ? WHERE id = ?`).run(now, so.id);

    const remainingSo = db.prepare(`
      SELECT COUNT(*) as cnt FROM sales_orders 
      WHERE production_order_id = ? AND status != 'COMPLETED'
    `).get(so.production_order_id) as any;

    if (remainingSo && remainingSo.cnt === 0) {
      db.prepare(`UPDATE production_orders SET status = 'COMPLETED', updated_at = ? WHERE id = ?`).run(now, so.production_order_id);
    }
  }
}

// Helper function for authoritative SO progress calculation
export function calculateSOProgress(soId: string) {
  const so = resolveSO(soId);
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

  // Distinct valid SO items passed QC
  const passedRow = db.prepare(`
    SELECT COUNT(DISTINCT iu.id) as cnt FROM qc_results qr
    JOIN item_units iu ON iu.id = qr.item_id
    WHERE iu.sales_order_id = ? AND qr.qc_result = 'PASS' AND qr.test_result = 'PASS'
  `).get(so.id) as any;
  const passedUnique = passedRow?.cnt || 0;

  // Distinct valid SO items failed (and not currently passed)
  const failedRow = db.prepare(`
    SELECT COUNT(DISTINCT iu.id) as cnt FROM qc_fail_log qf
    JOIN item_units iu ON iu.id = qf.item_id
    WHERE iu.sales_order_id = ? AND iu.status != 'QC_PASSED' AND iu.status != 'PACKED'
  `).get(so.id) as any;
  const failedUnique = failedRow?.cnt || 0;

  // Distinct items inspected overall for this SO
  const inspectedRow = db.prepare(`
    SELECT COUNT(DISTINCT item_id) as cnt FROM (
      SELECT qr.item_id FROM qc_results qr
      JOIN item_units iu ON iu.id = qr.item_id
      WHERE iu.sales_order_id = ?
      UNION
      SELECT qf.item_id FROM qc_fail_log qf
      JOIN item_units iu ON iu.id = qf.item_id
      WHERE iu.sales_order_id = ?
    )
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
router.get('/qc/progress/:soId', authenticateToken, (req: AuthRequest, res, next) => {
  try {
    const soId = req.params.soId;
    const progress = calculateSOProgress(soId);
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

router.post('/qc/results', authenticateToken, (req: AuthRequest, res, next) => {
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
    const now = new Date().toISOString();

    const so = resolveSO(targetSoKey);
    if (!so) {
      return res.status(404).json({ error: 'SO_NOT_FOUND', message: 'Sales Order not found' });
    }

    if (idempotencyKey) {
      const existing = checkIdempotency(idempotencyKey, operatorId, 'QC_TEST', itemQr);
      if (existing && existing.result === 'ACCEPTED') {
        const progress = calculateSOProgress(so.id);
        return res.json({ status: 'DUPLICATE_PROCESSED', message: 'Scan already processed idempotently.', progress });
      }
    }

    // Operator scoping check
    if (!checkOperatorAllocation(operatorId, userRole, so.id, 'QC_TEST')) {
      return res.status(403).json({
        error: 'OPERATOR_UNAUTHORIZED',
        message: `Operator ${req.user!.username} is not allocated to Sales Order ${so.so_number} for QC Test`
      });
    }

    // Capacity & Item Admission Logic
    let item = db.prepare(`SELECT * FROM item_units WHERE UPPER(TRIM(qr_code)) = ?`).get(itemQr) as any;
    if (!item) {
      // Check capacity before creating & admitting a new item
      const admittedCount = getSOAdmittedItemCount(so.id);
      if (admittedCount >= so.order_quantity) {
        return res.status(400).json({
          error: 'SO_QUANTITY_REACHED',
          message: `This sales order already has ${so.order_quantity} of ${so.order_quantity} pieces registered for QC.`
        });
      }

      const itemId = `itm-${itemQr}`;
      db.prepare(`
        INSERT INTO item_units (id, qr_code, sales_order_id, size, status, created_at, updated_at)
        VALUES (?, ?, ?, 'L', 'CREATED', ?, ?)
      `).run(itemId, itemQr, so.id, now, now);
      item = { id: itemId, qr_code: itemQr, sales_order_id: so.id, status: 'CREATED' };
    } else {
      // Check if item is already admitted to this SO or another SO
      const isAlreadyAdmitted = isItemAdmitted(item.id);
      if (!isAlreadyAdmitted) {
        const admittedCount = getSOAdmittedItemCount(so.id);
        if (admittedCount >= so.order_quantity) {
          return res.status(400).json({
            error: 'SO_QUANTITY_REACHED',
            message: `This sales order already has ${so.order_quantity} of ${so.order_quantity} pieces registered for QC.`
          });
        }
      }
      db.prepare(`UPDATE item_units SET sales_order_id = ?, updated_at = ? WHERE id = ?`).run(so.id, now, item.id);
      item.sales_order_id = so.id;
    }

    const isPass = qcResult === 'PASS' && testResult === 'PASS';
    const existingQc = db.prepare(`SELECT * FROM qc_results WHERE item_id = ?`).get(item.id) as any;

    // Check if item is already QC_PASSED or PACKED
    const isAlreadyPassed = item.status === 'QC_PASSED' || item.status === 'PACKED' || (existingQc && existingQc.qc_result === 'PASS' && existingQc.test_result === 'PASS');

    if (isAlreadyPassed && isPass) {
      // Duplicate scan on an already passed item — return ALREADY_PROCESSED / DUPLICATE without altering status
      recordScanEvent(idempotencyKey || '', operatorId, 'QC_TEST', itemQr, 'DUPLICATE');
      const progress = calculateSOProgress(so.id);
      return res.status(200).json({
        message: `Item ${itemQr} is already QC Passed (Duplicate Scan).`,
        itemQr,
        status: item.status || 'QC_PASSED',
        isDuplicate: true,
        progress
      });
    }

    const finalItemStatus = isPass ? 'QC_PASSED' : 'QC_FAILED';
    const existingFails = (db.prepare(`SELECT COUNT(*) as cnt FROM qc_fail_log WHERE item_id = ?`).get(item.id) as any)?.cnt || 0;
    let failCount = existingFails;
    let retryCount = 0;

    db.transaction(() => {
      if (!isPass) {
        failCount += 1;
        const failLogId = `qcfail-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
        db.prepare(`
          INSERT INTO qc_fail_log (id, item_id, operator_id, qc_result, test_result, failure_reason, attempt_number, scanned_at, idempotency_key, raw_qr, so_id, po_id, shift_id, failure_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'QC_FAIL')
        `).run(failLogId, item.id, operatorId, qcResult, testResult, failureReason || null, failCount, now, idempotencyKey || null, itemQr, so.id, so.production_order_id, so.shift_id);

        // Immediate Supervisor Alert
        const alertId = `alt-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
        db.prepare(`
          INSERT INTO alerts (id, user_id, role_target, category, severity, title, message, reference_type, reference_id, created_at)
          VALUES (?, NULL, 'SUPERVISOR', 'QUALITY', 'WARNING', 'QC Test Failure Alert', ?, 'qc_fail_log', ?, ?)
        `).run(alertId, `QC failed for item ${itemQr} on SO ${so.so_number} (Reason: ${failureReason || 'Defect detected'})`, failLogId, now);
      }

      if (existingQc) {
        retryCount = (existingQc.retry_count || 0) + 1;
        db.prepare(`
          UPDATE qc_results 
          SET operator_id = ?, qc_result = ?, test_result = ?, failure_reason = ?, retry_count = ?, scanned_at = ?
          WHERE item_id = ?
        `).run(operatorId, qcResult, testResult, failureReason || null, retryCount, now, item.id);
      } else {
        retryCount = 0;
        const qcId = `qc-${Date.now()}`;
        db.prepare(`
          INSERT INTO qc_results (id, item_id, operator_id, qc_result, test_result, failure_reason, retry_count, first_scanned_at, scanned_at)
          VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
        `).run(qcId, item.id, operatorId, qcResult, testResult, failureReason || null, now, now);
      }

      db.prepare(`UPDATE item_units SET status = ?, updated_at = ? WHERE id = ?`).run(finalItemStatus, now, item.id);
    })();

    recordScanEvent(idempotencyKey || '', operatorId, 'QC_TEST', itemQr, 'ACCEPTED');
    auditLog(operatorId, 'QC_RESULT_SAVED', 'item_units', item.id, { qcResult, testResult, retryCount, failCount });

    checkAndUpdateSOCompletion(so.id);

    const progress = calculateSOProgress(so.id);

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
router.get('/qc/history/:itemQr', authenticateToken, (req: AuthRequest, res, next) => {
  try {
    const itemQr = req.params.itemQr;
    const item = db.prepare(`SELECT * FROM item_units WHERE qr_code = ?`).get(itemQr) as any;
    if (!item) {
      return res.status(404).json({ error: 'ITEM_NOT_FOUND', message: 'Item not found' });
    }

    const currentResult = db.prepare(`SELECT * FROM qc_results WHERE item_id = ?`).get(item.id) as any;
    const failLogs = db.prepare(`
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

// 2. POST /api/packing/items/scan
const packItemSchema = z.object({
  idempotencyKey: z.string().optional(),
  boxNumber: z.string().min(1),
  itemQr: z.string().min(1),
  salesOrderNumber: z.string().min(1)
});

router.post('/packing/items/scan', authenticateToken, (req: AuthRequest, res, next) => {
  try {
    const { idempotencyKey, boxNumber, itemQr, salesOrderNumber } = packItemSchema.parse(req.body);
    const operatorId = req.user!.id;
    const now = new Date().toISOString();

    // Resolve SO
    let so = db.prepare(`SELECT id FROM sales_orders WHERE so_number = ? OR id = ?`).get(salesOrderNumber, salesOrderNumber) as any;
    if (!so) {
      so = db.prepare(`SELECT id FROM sales_orders ORDER BY created_at DESC LIMIT 1`).get() as any;
    }
    if (!so) {
      const defaultPoId = `po-${Date.now()}`;
      const defaultSoId = `so-${Date.now()}`;
      db.prepare(`
        INSERT INTO production_orders (id, po_number, map_po, customer, start_date, due_date, supervisor_id, status, created_at, updated_at)
        VALUES (?, 'PO-AUTO', 'MAP-PO-AUTO', 'Factory Orders', ?, ?, ?, 'CURRENT', ?, ?)
      `).run(defaultPoId, now.split('T')[0], now.split('T')[0], operatorId, now, now);

      db.prepare(`
        INSERT INTO sales_orders (id, production_order_id, so_number, map_so, product, style_code, colour, size_range, order_quantity, line_id, shift_id, box_capacity, status, created_at, updated_at)
        VALUES (?, ?, 'SO-AUTO', 'MAP-SO-AUTO', 'Garment Product', 'ST-AUTO', 'Black', 'S - XL', 1000, 'line-04', 'shift-c', 12, 'In Progress', ?, ?)
      `).run(defaultSoId, defaultPoId, now, now);

      so = { id: defaultSoId };
    }

    // Resolve box
    let box = db.prepare(`SELECT * FROM boxes WHERE box_number = ?`).get(boxNumber) as any;
    if (!box) {
      const boxId = `box-${Date.now()}`;
      db.prepare(`
        INSERT INTO boxes (id, box_number, sales_order_id, capacity, status, created_at)
        VALUES (?, ?, ?, 12, 'OPEN', ?)
      `).run(boxId, boxNumber, so.id, now);
      box = { id: boxId, box_number: boxNumber, sales_order_id: so.id, capacity: 12, status: 'OPEN' };
    }

    // Check capacity
    const currentItemsCount = (db.prepare(`SELECT COUNT(*) as cnt FROM box_items WHERE box_id = ?`).get(box.id) as any)?.cnt || 0;
    if (currentItemsCount >= box.capacity) {
      recordScanEvent(idempotencyKey || '', operatorId, 'PACKING', itemQr, 'REJECTED', 'BOX_FULL', 'Box capacity reached');
      return res.status(400).json({ error: 'BOX_FULL', message: `Box ${boxNumber} is already full (${box.capacity}/${box.capacity}).` });
    }

    // Resolve or create item
    let item = db.prepare(`SELECT * FROM item_units WHERE qr_code = ?`).get(itemQr) as any;
    if (!item) {
      const itemId = `itm-${itemQr}`;
      db.prepare(`
        INSERT INTO item_units (id, qr_code, sales_order_id, size, status, created_at, updated_at)
        VALUES (?, ?, ?, 'L', 'QC_PASSED', ?, ?)
      `).run(itemId, itemQr, so.id, now, now);
      item = { id: itemId, qr_code: itemQr, sales_order_id: so.id };
    }

    // Duplicate box item check
    const existingPack = db.prepare(`SELECT * FROM box_items WHERE item_id = ?`).get(item.id);
    if (existingPack) {
      recordScanEvent(idempotencyKey || '', operatorId, 'PACKING', itemQr, 'DUPLICATE', 'ALREADY_PACKED', 'Item already packed');
      return res.status(409).json({ error: 'ALREADY_PACKED', message: `Item ${itemQr} is already packed.` });
    }

    db.transaction(() => {
      db.prepare(`INSERT INTO box_items (box_id, item_id, packed_by, packed_at) VALUES (?, ?, ?, ?)`).run(box.id, item.id, operatorId, now);
      db.prepare(`UPDATE item_units SET status = 'PACKED', updated_at = ? WHERE id = ?`).run(now, item.id);
      if (currentItemsCount + 1 >= box.capacity) {
        db.prepare(`UPDATE boxes SET status = 'COMPLETE', completed_at = ? WHERE id = ?`).run(now, box.id);
      }
    })();

    recordScanEvent(idempotencyKey || '', operatorId, 'PACKING', itemQr, 'ACCEPTED');
    auditLog(operatorId, 'PACK_ITEM', 'boxes', box.id, { itemQr, count: currentItemsCount + 1 });

    checkAndUpdateSOCompletion(so.id);

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

// 3. POST /api/packing/boxes/:id/finish
router.post('/packing/boxes/:id/finish', authenticateToken, (req: AuthRequest, res, next) => {
  try {
    const boxNum = req.params.id;
    const now = new Date().toISOString();

    const box = db.prepare(`SELECT * FROM boxes WHERE box_number = ? OR id = ?`).get(boxNum, boxNum) as any;
    if (!box) {
      return res.status(404).json({ error: 'BOX_NOT_FOUND', message: 'Box not found' });
    }

    db.prepare(`UPDATE boxes SET status = 'COMPLETE', completed_at = ? WHERE id = ?`).run(now, box.id);
    auditLog(req.user!.id, 'FINISH_BOX', 'boxes', box.id);

    return res.json({ message: `Box ${box.box_number} completed and sealed`, boxNumber: box.box_number, status: 'COMPLETE' });
  } catch (err) {
    next(err);
  }
});

// 4. POST /api/box-transfers
const transferSchema = z.object({
  fromBoxNumber: z.string().min(1),
  toBoxNumber: z.string().min(1),
  itemQrs: z.array(z.string()).min(1)
});

router.post('/box-transfers', authenticateToken, (req: AuthRequest, res, next) => {
  try {
    const { fromBoxNumber, toBoxNumber, itemQrs } = transferSchema.parse(req.body);
    const operatorId = req.user!.id;
    const now = new Date().toISOString();

    const fromBox = db.prepare(`SELECT * FROM boxes WHERE box_number = ?`).get(fromBoxNumber) as any;
    const toBox = db.prepare(`SELECT * FROM boxes WHERE box_number = ?`).get(toBoxNumber) as any;

    if (!fromBox || !toBox) {
      return res.status(404).json({ error: 'BOX_NOT_FOUND', message: 'Source or destination box not found' });
    }

    const transferId = `trf-${Date.now()}`;

    db.transaction(() => {
      db.prepare(`
        INSERT INTO box_transfers (id, from_box_id, to_box_id, operator_id, transferred_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(transferId, fromBox.id, toBox.id, operatorId, now);

      const insertTrfItem = db.prepare(`INSERT INTO box_transfer_items (transfer_id, item_id) VALUES (?, ?)`);
      const deleteBoxItem = db.prepare(`DELETE FROM box_items WHERE box_id = ? AND item_id = ?`);
      const insertDestItem = db.prepare(`INSERT INTO box_items (box_id, item_id, packed_by, packed_at) VALUES (?, ?, ?, ?)`);

      itemQrs.forEach(qr => {
        const item = db.prepare(`SELECT id FROM item_units WHERE qr_code = ?`).get(qr) as any;
        if (item) {
          insertTrfItem.run(transferId, item.id);
          deleteBoxItem.run(fromBox.id, item.id);
          insertDestItem.run(toBox.id, item.id, operatorId, now);
        }
      });
    })();

    auditLog(operatorId, 'BOX_TRANSFER', 'box_transfers', transferId, { fromBoxNumber, toBoxNumber, count: itemQrs.length });

    return res.status(201).json({
      message: `Transferred ${itemQrs.length} items from ${fromBoxNumber} to ${toBoxNumber}`,
      transferId
    });
  } catch (err) {
    next(err);
  }
});

// 5. POST /api/aql/boxes/scan - Scan box for AQL and set required samples = total items in box
router.post('/aql/boxes/scan', authenticateToken, (req: AuthRequest, res, next) => {
  try {
    const { boxNumber } = req.body;
    const operatorId = req.user!.id;
    const now = new Date().toISOString();

    let box = db.prepare(`SELECT * FROM boxes WHERE box_number = ?`).get(boxNumber) as any;
    if (!box) {
      const defaultSo = db.prepare(`SELECT id FROM sales_orders ORDER BY created_at DESC LIMIT 1`).get() as any;
      const boxId = `box-${Date.now()}`;
      db.prepare(`
        INSERT INTO boxes (id, box_number, sales_order_id, capacity, status, created_at)
        VALUES (?, ?, ?, 12, 'OPEN', ?)
      `).run(boxId, boxNumber, defaultSo?.id || 'so-auto', now);
      box = { id: boxId, box_number: boxNumber, capacity: 12 };
    }

    let items = db.prepare(`
      SELECT u.qr_code, u.size, u.status 
      FROM box_items bi 
      JOIN item_units u ON bi.item_id = u.id 
      WHERE bi.box_id = ?
    `).all(box.id) as any[];

    const totalItems = items.length > 0 ? items.length : 12;
    const inspectionId = `aql-${Date.now()}`;

    db.prepare(`
      INSERT INTO aql_inspections (id, box_id, inspector_id, required_samples, result, started_at)
      VALUES (?, ?, ?, ?, 'PENDING', ?)
    `).run(inspectionId, box.id, operatorId, totalItems, now);

    return res.json({
      box: {
        box_number: boxNumber,
        item_count: totalItems,
        items
      },
      inspectionId,
      requiredSamples: totalItems
    });
  } catch (err) {
    next(err);
  }
});

// 6. POST /api/aql/inspections/:id/samples - Record individual sample test
router.post('/aql/inspections/:id/samples', authenticateToken, (req: AuthRequest, res, next) => {
  try {
    const inspectionId = req.params.id;
    const { sampleNumber, itemQr, result } = req.body;
    const now = new Date().toISOString();

    let item = db.prepare(`SELECT * FROM item_units WHERE qr_code = ?`).get(itemQr) as any;
    if (item) {
      const sampleId = `aqls-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
      db.prepare(`
        INSERT INTO aql_samples (id, inspection_id, item_id, sample_number, result, scanned_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(inspection_id, item_id) DO UPDATE SET result = ?, scanned_at = ?
      `).run(sampleId, inspectionId, item.id, sampleNumber, result, now, result, now);
    }

    return res.json({ message: 'Sample recorded', sampleNumber, result });
  } catch (err) {
    next(err);
  }
});

// 7. POST /api/aql/inspections/direct-complete - Direct complete endpoint when no inspectionId exists
router.post('/aql/inspections/direct-complete', authenticateToken, (req: AuthRequest, res, next) => {
  try {
    const { boxNumber, result, failureReason } = req.body;
    const operatorId = req.user!.id;
    const now = new Date().toISOString();

    let box = db.prepare(`SELECT * FROM boxes WHERE box_number = ?`).get(boxNumber) as any;
    if (!box) {
      const defaultSo = db.prepare(`SELECT id FROM sales_orders ORDER BY created_at DESC LIMIT 1`).get() as any;
      const boxId = `box-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
      db.prepare(`
        INSERT INTO boxes (id, box_number, sales_order_id, capacity, status, created_at)
        VALUES (?, ?, ?, 12, 'OPEN', ?)
      `).run(boxId, boxNumber || `BX-${Date.now().toString().slice(-6)}`, defaultSo?.id || 'so-auto', now);
      box = { id: boxId, box_number: boxNumber };
    }

    const inspectionId = `aql-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
    db.prepare(`
      INSERT INTO aql_inspections (id, box_id, inspector_id, required_samples, result, failure_reason, started_at, completed_at)
      VALUES (?, ?, ?, 12, ?, ?, ?, ?)
    `).run(inspectionId, box.id, operatorId, result, failureReason || null, now, now);

    const boxStatus = result === 'PASSED' ? 'AQL_PASSED' : 'AQL_FAILED';
    db.prepare(`UPDATE boxes SET status = ?, completed_at = ? WHERE id = ?`).run(boxStatus, now, box.id);

    return res.json({ message: 'AQL Direct Complete finalized', inspectionId, result });
  } catch (err) {
    next(err);
  }
});

// 8. POST /api/aql/inspections/:id/complete - Finalize AQL inspection result
router.post('/aql/inspections/:id/complete', authenticateToken, (req: AuthRequest, res, next) => {
  try {
    let inspectionId = req.params.id;
    if (inspectionId === 'direct-complete') {
      inspectionId = `aql-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
    }

    const { result, failureReason, boxNumber } = req.body;
    const operatorId = req.user!.id;
    const now = new Date().toISOString();

    let insp = db.prepare(`SELECT * FROM aql_inspections WHERE id = ?`).get(inspectionId) as any;
    if (!insp) {
      let box = boxNumber ? db.prepare(`SELECT * FROM boxes WHERE box_number = ?`).get(boxNumber) as any : null;
      if (!box) {
        const defaultSo = db.prepare(`SELECT id FROM sales_orders ORDER BY created_at DESC LIMIT 1`).get() as any;
        const boxId = `box-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
        const bNum = boxNumber || `BX-${Date.now().toString().slice(-6)}`;
        db.prepare(`
          INSERT INTO boxes (id, box_number, sales_order_id, capacity, status, created_at)
          VALUES (?, ?, ?, 12, 'OPEN', ?)
        `).run(boxId, bNum, defaultSo?.id || 'so-auto', now);
        box = { id: boxId, box_number: bNum };
      }

      db.prepare(`
        INSERT INTO aql_inspections (id, box_id, inspector_id, required_samples, result, failure_reason, started_at, completed_at)
        VALUES (?, ?, ?, 12, ?, ?, ?, ?)
      `).run(inspectionId, box.id, operatorId, result, failureReason || null, now, now);
      insp = { id: inspectionId, box_id: box.id };
    } else {
      db.prepare(`
        UPDATE aql_inspections 
        SET result = ?, failure_reason = ?, completed_at = ? 
        WHERE id = ?
      `).run(result, failureReason || null, now, inspectionId);
    }

    const boxStatus = result === 'PASSED' ? 'AQL_PASSED' : 'AQL_FAILED';
    if (insp.box_id) {
      db.prepare(`UPDATE boxes SET status = ?, completed_at = ? WHERE id = ?`).run(boxStatus, now, insp.box_id);
    }

    return res.json({ message: 'AQL Inspection finalized', inspectionId, result });
  } catch (err) {
    next(err);
  }
});

export default router;
