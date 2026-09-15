import { Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { db } from '../db/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { auditLog } from '../middleware/errorHandler';

const router = ExpressRouter();

// Helper to map DB PO to API contract
function formatProductionOrder(po: any) {
  const opsRows = db.prepare(`SELECT operation FROM production_order_operations WHERE production_order_id = ?`).all(po.id) as any[];
  const selectedOperations = opsRows.map(r => {
    switch (r.operation) {
      case 'QC_TEST': return 'QC Test';
      case 'PACKING': return 'Packing';
      case 'AQL': return 'AQL Checker';
      case 'BOX_TRANSFER': return 'Box Transfer';
      default: return r.operation;
    }
  });

  const soRows = db.prepare(`
    SELECT so.*, pl.name as line_name, s.name as shift_name
    FROM sales_orders so
    JOIN production_lines pl ON pl.id = so.line_id
    JOIN shifts s ON s.id = so.shift_id
    WHERE so.production_order_id = ?
  `).all(po.id) as any[];

  const salesOrders = soRows.map(so => {
    // Progress metrics
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

    const aqlPassed = (db.prepare(`
      SELECT COUNT(*) as cnt FROM aql_inspections ai
      JOIN boxes b ON b.id = ai.box_id
      WHERE b.sales_order_id = ? AND ai.result = 'PASSED'
    `).get(so.id) as any)?.cnt || 0;

    const members = db.prepare(`
      SELECT sm.*, u.full_name as worker_name, s.start_time, s.end_time
      FROM shift_members sm
      JOIN users u ON u.id = sm.operator_id
      JOIN shifts s ON s.id = sm.shift_id
      WHERE sm.shift_id = ? AND sm.active = 1
    `).all(so.shift_id) as any[];

    const shifts = members.map(m => ({
      id: m.id,
      salesOrderId: so.id,
      workerId: m.operator_id,
      workerName: m.worker_name,
      startTime: m.start_time,
      endTime: m.end_time,
      date: new Date().toISOString().split('T')[0],
      enabledOperations: selectedOperations
    }));

    return {
      id: so.so_number,
      dbId: so.id,
      mapSo: so.map_so,
      product: so.product,
      styleCode: so.style_code,
      colour: so.colour,
      sizeRange: so.size_range,
      quantity: so.order_quantity,
      lineId: so.line_name,
      boxCapacity: so.box_capacity,
      shifts,
      progress: {
        qcPassed,
        qcFailed: 0,
        testPassed: qcPassed,
        testFailed: 0,
        packed,
        aqlPassed,
        aqlFailed: 0,
        issuesCount: 0,
        status: so.status
      }
    };
  });

  return {
    id: po.po_number,
    dbId: po.id,
    mapPo: po.map_po,
    customer: po.customer,
    startDate: po.start_date,
    dueDate: po.due_date,
    supervisorId: po.supervisor_id,
    remarks: po.remarks,
    status: po.status === 'CURRENT' ? 'Current' : po.status === 'COMPLETED' ? 'Completed' : 'Draft',
    selectedOperations,
    salesOrders
  };
}

// GET /api/production-orders
router.get('/production-orders', authenticateToken, (req, res, next) => {
  try {
    const poRows = db.prepare(`SELECT * FROM production_orders ORDER BY created_at DESC`).all();
    const orders = poRows.map(po => formatProductionOrder(po));
    return res.json(orders);
  } catch (err) {
    next(err);
  }
});

// GET /api/production-orders/:id
router.get('/production-orders/:id', authenticateToken, (req, res, next) => {
  try {
    const po = db.prepare(`SELECT * FROM production_orders WHERE po_number = ? OR id = ?`).get(req.params.id, req.params.id);
    if (!po) {
      return res.status(404).json({ error: 'PO_NOT_FOUND', message: 'Production order not found' });
    }
    return res.json(formatProductionOrder(po));
  } catch (err) {
    next(err);
  }
});

const createPoSchema = z.object({
  id: z.string().min(1),
  mapPo: z.string().min(1),
  customer: z.string().min(1),
  startDate: z.string(),
  dueDate: z.string(),
  supervisorId: z.string(),
  remarks: z.string().optional(),
  status: z.enum(['Current', 'Completed', 'Draft']).optional(),
  selectedOperations: z.array(z.string()),
  salesOrders: z.array(z.any()).optional()
});

// POST /api/production-orders (SUPERVISOR / ADMIN)
router.post('/production-orders', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), (req: AuthRequest, res, next) => {
  try {
    const body = createPoSchema.parse(req.body);
    const now = new Date().toISOString();
    const poDbId = `po-${Date.now()}`;
    const statusUpper = (body.status || 'CURRENT').toUpperCase();

    db.transaction(() => {
      // 1. Insert PO
      db.prepare(`
        INSERT INTO production_orders (id, po_number, map_po, customer, start_date, due_date, supervisor_id, remarks, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(poDbId, body.id, body.mapPo, body.customer, body.startDate, body.dueDate, req.user!.id, body.remarks || '', statusUpper, now, now);

      // 2. Insert Operations
      const insertOp = db.prepare(`INSERT INTO production_order_operations (production_order_id, operation) VALUES (?, ?)`);
      body.selectedOperations.forEach(opStr => {
        let code = 'QC_TEST';
        if (opStr === 'Packing') code = 'PACKING';
        else if (opStr === 'AQL Checker') code = 'AQL';
        else if (opStr === 'Box Transfer') code = 'BOX_TRANSFER';
        insertOp.run(poDbId, code);
      });

      // 3. Insert Sales Orders if provided
      if (body.salesOrders && body.salesOrders.length > 0) {
        const insertSo = db.prepare(`
          INSERT INTO sales_orders (id, production_order_id, so_number, map_so, product, style_code, colour, size_range, order_quantity, line_id, shift_id, box_capacity, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'In Progress', ?, ?)
        `);

        body.salesOrders.forEach(so => {
          const soDbId = `so-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
          let lineId = 'line-04';
          if (so.lineId === 'Line 01') lineId = 'line-01';
          else if (so.lineId === 'Line 02') lineId = 'line-02';
          else if (so.lineId === 'Line 03') lineId = 'line-03';

          let shiftId = 'shift-c';
          if (so.shiftId) shiftId = so.shiftId;

          insertSo.run(
            soDbId,
            poDbId,
            so.id,
            so.mapSo,
            so.product || 'Garment Product',
            so.styleCode || 'ST-900',
            so.colour || 'Black',
            so.sizeRange || 'S - XL',
            so.quantity || 1000,
            lineId,
            shiftId,
            so.boxCapacity || 12,
            now,
            now
          );
        });
      }
    })();

    auditLog(req.user!.id, 'CREATE_PO', 'production_orders', poDbId, { poNumber: body.id });

    const created = db.prepare(`SELECT * FROM production_orders WHERE id = ?`).get(poDbId);
    return res.status(201).json(formatProductionOrder(created));
  } catch (err) {
    next(err);
  }
});

export default router;
