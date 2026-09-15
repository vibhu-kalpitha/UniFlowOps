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

// 1. POST /api/qc/results
const qcResultSchema = z.object({
  idempotencyKey: z.string().optional(),
  itemQr: z.string().min(1),
  salesOrderNumber: z.string().min(1),
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

    // Resolve Sales Order
    const so = db.prepare(`SELECT id FROM sales_orders WHERE so_number = ? OR id = ?`).get(salesOrderNumber, salesOrderNumber) as any;
    if (!so) {
      recordScanEvent(idempotencyKey || '', operatorId, 'QC_TEST', itemQr, 'REJECTED', 'SO_NOT_FOUND', 'Sales Order not found');
      return res.status(404).json({ error: 'SO_NOT_FOUND', message: 'Sales Order not found' });
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

    // Check duplicate QC result
    const existingQc = db.prepare(`SELECT * FROM qc_results WHERE item_id = ?`).get(item.id);
    if (existingQc) {
      recordScanEvent(idempotencyKey || '', operatorId, 'QC_TEST', itemQr, 'DUPLICATE', 'DUPLICATE_QC', 'QC already logged for item');
      return res.status(409).json({ error: 'DUPLICATE_QC', message: 'QC result already logged for this item unit' });
    }

    const qcId = `qc-${Date.now()}`;
    const finalItemStatus = (qcResult === 'PASS' && testResult === 'PASS') ? 'QC_PASSED' : 'QC_FAILED';

    db.transaction(() => {
      db.prepare(`
        INSERT INTO qc_results (id, item_id, operator_id, qc_result, test_result, failure_reason, scanned_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(qcId, item.id, operatorId, qcResult, testResult, failureReason || null, now);

      db.prepare(`UPDATE item_units SET status = ?, updated_at = ? WHERE id = ?`).run(finalItemStatus, now, item.id);
    })();

    recordScanEvent(idempotencyKey || '', operatorId, 'QC_TEST', itemQr, 'ACCEPTED');
    auditLog(operatorId, 'QC_RESULT_SAVED', 'item_units', item.id, { qcResult, testResult });

    return res.status(201).json({
      message: 'QC & Test result recorded successfully',
      itemQr,
      status: finalItemStatus
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
    const so = db.prepare(`SELECT id FROM sales_orders WHERE so_number = ? OR id = ?`).get(salesOrderNumber, salesOrderNumber) as any;
    if (!so) {
      return res.status(404).json({ error: 'SO_NOT_FOUND', message: 'Sales Order not found' });
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

export default router;
