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

// 0. POST /api/qc/scan
router.post('/qc/scan', authenticateToken, (req: AuthRequest, res, next) => {
  try {
    const code = req.body.code || req.body.itemQr;
    if (!code) {
      return res.status(400).json({ error: 'INVALID_QR', message: 'Barcode is required' });
    }

    const item = db.prepare(`SELECT * FROM item_units WHERE qr_code = ?`).get(code) as any;
    if (item && (item.status === 'QC_PASSED' || item.status === 'PACKED')) {
      return res.json({
        status: 'DUPLICATE',
        message: 'Already processed QC',
        item: { qr_code: item.qr_code, size: item.size || 'L' }
      });
    }

    return res.json({
      status: 'VALID',
      message: 'Barcode valid for QC',
      item: item ? { qr_code: item.qr_code, size: item.size || 'L' } : { qr_code: code, size: 'L' }
    });
  } catch (err) {
    next(err);
  }
});

// 1. POST /api/qc/results
const qcResultSchema = z.object({
  idempotencyKey: z.string().optional(),
  itemQr: z.string().min(1),
  salesOrderNumber: z.string().optional(),
  qcResult: z.enum(['PASS', 'FAIL']),
  testResult: z.enum(['PASS', 'FAIL']),
  failureReason: z.string().optional()
});

router.post('/qc/results', authenticateToken, (req: AuthRequest, res, next) => {
  try {
    const { idempotencyKey, itemQr, salesOrderNumber, qcResult, testResult, failureReason } = qcResultSchema.parse(req.body);
    const operatorId = req.user!.id;
    const now = new Date().toISOString();

    if (idempotencyKey) {
      const existing = checkIdempotency(idempotencyKey, operatorId, 'QC_TEST', itemQr);
      if (existing && existing.result === 'ACCEPTED') {
        return res.json({ status: 'DUPLICATE_PROCESSED', message: 'Scan already processed idempotently.' });
      }
    }

    // Resolve Sales Order safely without passing undefined
    const targetSo = salesOrderNumber || null;
    let so = targetSo ? (db.prepare(`SELECT id FROM sales_orders WHERE so_number = ? OR id = ?`).get(targetSo, targetSo) as any) : null;
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

    // Find or create item unit
    let item = db.prepare(`SELECT * FROM item_units WHERE qr_code = ?`).get(itemQr) as any;
    if (!item) {
      const itemId = `itm-${itemQr}`;
      db.prepare(`
        INSERT INTO item_units (id, qr_code, sales_order_id, size, status, created_at, updated_at)
        VALUES (?, ?, ?, 'L', 'CREATED', ?, ?)
      `).run(itemId, itemQr, so.id, now, now);
      item = { id: itemId, qr_code: itemQr, sales_order_id: so.id };
    }

    const isPass = qcResult === 'PASS' && testResult === 'PASS';
    const finalItemStatus = isPass ? 'QC_PASSED' : 'QC_FAILED';

    const existingQc = db.prepare(`SELECT * FROM qc_results WHERE item_id = ?`).get(item.id) as any;
    const existingFails = (db.prepare(`SELECT COUNT(*) as cnt FROM qc_fail_log WHERE item_id = ?`).get(item.id) as any)?.cnt || 0;
    let failCount = existingFails;
    let retryCount = 0;

    db.transaction(() => {
      if (!isPass) {
        failCount += 1;
        const failLogId = `qcfail-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
        db.prepare(`
          INSERT INTO qc_fail_log (id, item_id, operator_id, qc_result, test_result, failure_reason, attempt_number, scanned_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(failLogId, item.id, operatorId, qcResult, testResult, failureReason || null, failCount, now);
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

    return res.status(200).json({
      message: isPass ? (retryCount > 0 ? `QC Passed after ${retryCount} attempt(s)!` : 'QC Passed!') : `QC Failed (Attempt #${failCount})`,
      itemQr,
      status: finalItemStatus,
      retryCount,
      totalFails: failCount
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
