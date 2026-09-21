import { Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { authenticateToken, requireRole, AuthRequest, AuthUser } from '../middleware/auth.js';
import { auditLog } from '../middleware/errorHandler.js';

const router = ExpressRouter();

// Styles API

// GET /api/production/styles (or /api/styles)
router.get('/styles', authenticateToken, async (req, res, next) => {
  try {
    const styles = await db.prepare(`SELECT * FROM styles ORDER BY code ASC`).all();
    return res.json(styles);
  } catch (err) {
    next(err);
  }
});

const createStyleSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  customer: z.string().optional(),
  season: z.string().optional(),
  notes: z.string().optional()
});

// POST /api/production/styles (SUPERVISOR / ADMIN)
router.post('/styles', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const { code, name, customer, season, notes } = createStyleSchema.parse(req.body);
    const existing = await db.prepare(`SELECT * FROM styles WHERE code = ?`).get(code) as any;
    if (existing) {
      return res.status(409).json({ error: 'STYLE_EXISTS', message: `Style with code ${code} already exists`, style: existing });
    }

    const id = `style-${Date.now()}`;
    await db.prepare(`
      INSERT INTO styles (id, code, name, customer, season, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
    `).run(id, code, name, customer || null, season || null, notes || null);

    await auditLog(req.user!.id, 'CREATE_STYLE', 'styles', id, { code, name });

    const created = await db.prepare(`SELECT * FROM styles WHERE id = ?`).get(id);
    return res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// Helper to map DB PO to API contract
async function formatProductionOrder(po: any, reqUser?: AuthUser) {
  const opsRows = await db.prepare(`SELECT operation FROM production_order_operations WHERE production_order_id = ?`).all(po.id) as any[];
  const selectedOperations = opsRows.map(r => {
    switch (r.operation) {
      case 'QC_TEST': return 'QC Test';
      case 'PACKING': return 'Packing';
      case 'AQL': return 'AQL Checker';
      case 'BOX_TRANSFER': return 'Box Transfer';
      default: return r.operation;
    }
  });

  const style = po.style_id ? await db.prepare(`SELECT * FROM styles WHERE id = ?`).get(po.style_id) as any : null;

  let soQuery = `
    SELECT so.*, pl.name as line_name, s.name as shift_name
    FROM sales_orders so
    LEFT JOIN production_lines pl ON pl.id = so.line_id
    LEFT JOIN shifts s ON s.id = so.shift_id
    WHERE so.production_order_id = ?
  `;
  const soRows = await db.prepare(soQuery).all(po.id) as any[];

  const salesOrders = (await Promise.all(soRows.map(async so => {
    // Strictly enforce Operator Visibility Rule using operator_work_assignments ONLY
    if (reqUser && reqUser.role === 'OPERATOR') {
      const isAllocated = await db.prepare(`
        SELECT COUNT(*) as cnt FROM operator_work_assignments
        WHERE sales_order_id = ? AND operator_id = ? AND active = 1
      `).get(so.id, reqUser.id) as any;

      if (!isAllocated || isAllocated.cnt === 0) {
        return null;
      }
    }

    // Progress metrics
    const qcPassedRow = await db.prepare(`
      SELECT COUNT(DISTINCT iu.id) as cnt FROM qc_results qr
      JOIN item_units iu ON iu.id = qr.item_id
      WHERE iu.sales_order_id = ? AND qr.qc_result = 'PASS' AND qr.test_result = 'PASS'
    `).get(so.id) as any;
    const qcPassed = qcPassedRow?.cnt || 0;

    const qcFailedRow = await db.prepare(`
      SELECT COUNT(DISTINCT item_id) as cnt FROM qc_fail_log qf
      JOIN item_units iu ON iu.id = qf.item_id
      WHERE iu.sales_order_id = ?
    `).get(so.id) as any;
    const qcFailed = qcFailedRow?.cnt || 0;

    const packedRow = await db.prepare(`
      SELECT COUNT(DISTINCT bi.item_id) as cnt FROM box_items bi
      JOIN boxes b ON b.id = bi.box_id
      WHERE b.sales_order_id = ? AND bi.active = 1
    `).get(so.id) as any;
    const packed = packedRow?.cnt || 0;

    const aqlPassedRow = await db.prepare(`
      SELECT COUNT(*) as cnt FROM aql_inspections ai
      JOIN boxes b ON b.id = ai.box_id
      WHERE b.sales_order_id = ? AND ai.result = 'PASSED'
    `).get(so.id) as any;
    const aqlPassed = aqlPassedRow?.cnt || 0;

    const allocations = await db.prepare(`
      SELECT owa.id, owa.sales_order_id, owa.shift_id, owa.operator_id, owa.operation, owa.assigned_by, owa.active, owa.created_at, u.full_name as operator_name, u.username as operator_username, s.name as shift_name
      FROM operator_work_assignments owa
      JOIN users u ON u.id = owa.operator_id
      LEFT JOIN shifts s ON s.id = owa.shift_id
      WHERE owa.sales_order_id = ? AND owa.active = 1
    `).all(so.id) as any[];

    const shifts = allocations.map(m => ({
      id: m.id,
      salesOrderId: so.id,
      workerId: m.operator_id,
      workerName: m.operator_name,
      shiftId: m.shift_id,
      shiftName: m.shift_name,
      operation: m.operation || 'ALL',
      date: new Date().toISOString().split('T')[0],
      enabledOperations: [m.operation || 'ALL']
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
      lineId: so.line_name || 'Line 04',
      shiftId: so.shift_id,
      shiftName: so.shift_name,
      boxCapacity: so.box_capacity,
      productQrPrefix: so.product_qr_prefix || undefined,
      productSerialStart: so.product_serial_start != null ? Number(so.product_serial_start) : undefined,
      productSerialEnd: so.product_serial_end != null ? Number(so.product_serial_end) : undefined,
      allocations,
      shifts,
      progress: {
        qcPassed,
        qcFailed,
        testPassed: qcPassed,
        testFailed: qcFailed,
        packed,
        aqlPassed,
        aqlFailed: 0,
        issuesCount: qcFailed,
        status: so.status
      }
    };
  }))).filter(Boolean);

  return {
    id: po.po_number,
    dbId: po.id,
    mapPo: po.map_po,
    customer: po.customer,
    styleId: style ? style.id : null,
    styleCode: style ? style.code : ((salesOrders[0] as any)?.styleCode || 'ST-900'),
    styleName: style ? style.name : 'Standard Style',
    startDate: po.start_date,
    dueDate: po.due_date,
    supervisorId: po.supervisor_id,
    remarks: po.remarks,
    status: po.status === 'CURRENT' ? 'Current' : po.status === 'COMPLETED' ? 'Completed' : 'Draft',
    selectedOperations,
    salesOrders
  };
}

export async function checkQrRangeOverlap(
  prefix: string,
  start: number,
  end: number,
  excludeSoId?: string
): Promise<{ overlap: boolean; overlappingSoNumber?: string }> {
  if (!prefix || start == null || end == null) return { overlap: false };
  const normPrefix = prefix.trim().toUpperCase();

  let query = `
    SELECT id, so_number, product_qr_prefix, product_serial_start, product_serial_end 
    FROM sales_orders 
    WHERE UPPER(TRIM(product_qr_prefix)) = ? AND product_serial_start IS NOT NULL AND product_serial_end IS NOT NULL
  `;
  const params: any[] = [normPrefix];
  if (excludeSoId) {
    query += ` AND id != ? AND so_number != ?`;
    params.push(excludeSoId, excludeSoId);
  }

  const existingRows = await db.prepare(query).all(...params) as any[];

  for (const r of existingRows) {
    const existStart = Number(r.product_serial_start);
    const existEnd = Number(r.product_serial_end);

    if (Math.max(start, existStart) <= Math.min(end, existEnd)) {
      return { overlap: true, overlappingSoNumber: r.so_number || r.id };
    }
  }

  return { overlap: false };
}

// GET /api/production-orders
router.get('/production-orders', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const poRows = await db.prepare(`SELECT * FROM production_orders ORDER BY created_at DESC`).all();
    const role = req.user?.role;

    const formattedOrders = await Promise.all(poRows.map(po => formatProductionOrder(po, req.user)));

    const orders = formattedOrders.filter(po => {
      if (!po) return false;
      if (role === 'SUPERVISOR' || role === 'ADMIN') {
        return true;
      }
      return po.salesOrders && po.salesOrders.length > 0;
    });

    return res.json(orders);
  } catch (err) {
    next(err);
  }
});

// GET /api/production-orders/:id
router.get('/production-orders/:id', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const po = await db.prepare(`SELECT * FROM production_orders WHERE po_number = ? OR id = ?`).get(req.params.id, req.params.id);
    if (!po) {
      return res.status(404).json({ error: 'PO_NOT_FOUND', message: 'Production order not found' });
    }
    const formatted = await formatProductionOrder(po, req.user);
    return res.json(formatted);
  } catch (err) {
    next(err);
  }
});

const addSoStandaloneSchema = z.object({
  id: z.string().optional(),
  soNumber: z.string().optional(),
  mapSo: z.string().optional(),
  product: z.string().optional(),
  styleCode: z.string().optional(),
  colour: z.string().optional(),
  sizeRange: z.string().optional(),
  quantity: z.number().optional(),
  orderQuantity: z.number().optional(),
  lineId: z.string().optional(),
  shiftId: z.string().optional(),
  boxCapacity: z.number().optional(),
  productQrPrefix: z.string().optional(),
  product_qr_prefix: z.string().optional(),
  productSerialStart: z.number().optional(),
  product_serial_start: z.number().optional(),
  productSerialEnd: z.number().optional(),
  product_serial_end: z.number().optional()
});

// POST /api/production-orders/:id/sales-orders (SUPERVISOR / ADMIN)
router.post('/production-orders/:id/sales-orders', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const poParam = req.params.id;
    const po = await db.prepare(`SELECT * FROM production_orders WHERE id = ? OR po_number = ?`).get(poParam, poParam) as any;
    if (!po) {
      return res.status(404).json({ error: 'PO_NOT_FOUND', message: `Parent Production Order '${poParam}' not found` });
    }

    const body = addSoStandaloneSchema.parse(req.body);
    const soNumber = body.soNumber || body.id || `SO-${Math.floor(77000 + Math.random() * 9999)}`;
    const mapSo = body.mapSo || `MAP-${soNumber}`;
    const soDbId = `so-${Date.now()}-${Math.random().toString().slice(2, 6)}`;

    let lineId = 'line-04';
    if (body.lineId === 'Line 01' || body.lineId === 'line-01') lineId = 'line-01';
    else if (body.lineId === 'Line 02' || body.lineId === 'line-02') lineId = 'line-02';
    else if (body.lineId === 'Line 03' || body.lineId === 'line-03') lineId = 'line-03';

    const shiftId = body.shiftId || 'shift-c';
    const qty = body.orderQuantity || body.quantity || 1000;

    const prefix = body.productQrPrefix || body.product_qr_prefix || null;
    const start = body.productSerialStart != null ? Number(body.productSerialStart) : (body.product_serial_start != null ? Number(body.product_serial_start) : null);
    const end = body.productSerialEnd != null ? Number(body.productSerialEnd) : (body.product_serial_end != null ? Number(body.product_serial_end) : null);

    if (prefix && start != null && end != null) {
      if (start > end) {
        return res.status(400).json({ error: 'INVALID_QR_RANGE', message: 'Product Serial Start cannot be greater than Product Serial End' });
      }
      if ((end - start + 1) < qty) {
        return res.status(400).json({ error: 'INSUFFICIENT_QR_RANGE', message: `Product serial range (${end - start + 1}) must cover at least order quantity (${qty}).` });
      }
      const overlapRes = await checkQrRangeOverlap(prefix, start, end, soNumber);
      if (overlapRes.overlap) {
        return res.status(409).json({ error: 'QR_RANGE_OVERLAP', message: `Product QR range overlaps with existing Sales Order ${overlapRes.overlappingSoNumber}.` });
      }
    }

    await db.prepare(`
      INSERT INTO sales_orders (id, production_order_id, so_number, map_so, product, style_code, colour, size_range, order_quantity, line_id, shift_id, box_capacity, product_qr_prefix, product_serial_start, product_serial_end, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'In Progress', NOW(3), NOW(3))
    `).run(
      soDbId,
      po.id,
      soNumber,
      mapSo,
      body.product || 'Garment Product',
      body.styleCode || 'ST-900',
      body.colour || 'Black',
      body.sizeRange || 'S - XL',
      qty,
      lineId,
      shiftId,
      body.boxCapacity || 12,
      prefix ? prefix.trim().toUpperCase() : null,
      start,
      end
    );

    await auditLog(req.user!.id, 'CREATE_SO', 'sales_orders', soDbId, { poId: po.id, soNumber });

    const updatedPo = await formatProductionOrder(po, req.user);
    return res.status(201).json({
      message: `Sales Order ${soNumber} attached to PO ${po.po_number}`,
      soDbId,
      soNumber,
      parentPoId: po.id,
      productionOrder: updatedPo
    });
  } catch (err) {
    next(err);
  }
});

const createPoSchema = z.object({
  id: z.string().min(1),
  mapPo: z.string().min(1),
  customer: z.string().min(1),
  styleId: z.string().optional(),
  style_id: z.string().optional(),
  styleCode: z.string().optional(),
  styleName: z.string().optional(),
  startDate: z.string(),
  dueDate: z.string(),
  supervisorId: z.string(),
  remarks: z.string().optional(),
  status: z.enum(['Current', 'Completed', 'Draft']).optional(),
  selectedOperations: z.array(z.string()),
  salesOrders: z.array(z.any()).optional()
});

async function syncSalesOrderAllocations(
  tx: any,
  soDbId: string,
  requestedAssignments: any[],
  assignedByUserId: string
) {
  if (!requestedAssignments || !Array.isArray(requestedAssignments) || requestedAssignments.length === 0) return;

  const activeOpAssignments: Array<{ operatorId: string; shiftId: string; operation: string }> = [];

  for (const item of requestedAssignments) {
    const rawOp = item.workerId || item.operatorId || item.userId || item.username || item.workerName;
    if (!rawOp) continue;

    const opUser = await tx.prepare(`
      SELECT id FROM users WHERE (id = ? OR username = ? OR full_name = ?) AND role = 'OPERATOR'
    `).get(rawOp, rawOp, rawOp) as any;

    if (!opUser) continue;

    const rawShift = item.shiftId || item.shiftCode || 'shift-c';
    const shiftRow = await tx.prepare(`
      SELECT id FROM shifts WHERE id = ? OR code = ? OR name = ?
    `).get(rawShift, rawShift, rawShift) as any;

    const shiftId = shiftRow ? shiftRow.id : 'shift-c';
    const operation = item.operation || (Array.isArray(item.enabledOperations) ? item.enabledOperations[0] : 'ALL') || 'ALL';

    activeOpAssignments.push({
      operatorId: opUser.id,
      shiftId,
      operation
    });
  }

  const activeOpIds = activeOpAssignments.map(a => a.operatorId);

  if (activeOpIds.length > 0) {
    const placeholders = activeOpIds.map(() => '?').join(',');
    await tx.prepare(`
      UPDATE operator_work_assignments 
      SET active = 0, updated_at = NOW(3)
      WHERE sales_order_id = ? AND active = 1 AND operator_id NOT IN (${placeholders})
    `).run(soDbId, ...activeOpIds);
  } else {
    await tx.prepare(`
      UPDATE operator_work_assignments 
      SET active = 0, updated_at = NOW(3)
      WHERE sales_order_id = ? AND active = 1
    `).run(soDbId);
  }

  for (const assign of activeOpAssignments) {
    const owaId = `owa-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
    await tx.prepare(`
      INSERT INTO operator_work_assignments (id, sales_order_id, shift_id, operator_id, operation, assigned_date, source, assigned_by, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURDATE(), 'SUPERVISOR', ?, 1, NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id), active = 1, updated_at = NOW(3)
    `).run(owaId, soDbId, assign.shiftId, assign.operatorId, assign.operation, assignedByUserId);
  }
}

// POST /api/production-orders (SUPERVISOR / ADMIN)
router.post('/production-orders', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const body = createPoSchema.parse(req.body);
    const poDbId = `po-${Date.now()}`;
    const statusUpper = (body.status || 'CURRENT').toUpperCase();

    const styleId = body.styleId || body.style_id;
    if (!styleId) {
      return res.status(400).json({
        error: 'STYLE_REQUIRED',
        message: 'Please select an existing style or create one first.'
      });
    }

    const existingStyle = await db.prepare(`SELECT id FROM styles WHERE id = ?`).get(styleId) as any;
    if (!existingStyle) {
      return res.status(400).json({
        error: 'STYLE_NOT_FOUND',
        message: 'Selected style does not exist in catalog'
      });
    }

    if (body.salesOrders && body.salesOrders.length > 0) {
      for (const so of body.salesOrders) {
        const prefix = so.productQrPrefix || so.product_qr_prefix;
        const start = so.productSerialStart != null ? Number(so.productSerialStart) : (so.product_serial_start != null ? Number(so.product_serial_start) : null);
        const end = so.productSerialEnd != null ? Number(so.productSerialEnd) : (so.product_serial_end != null ? Number(so.product_serial_end) : null);
        const qty = so.quantity || so.orderQuantity || 1;

        if (prefix && start != null && end != null) {
          if (start > end) {
            return res.status(400).json({
              error: 'INVALID_QR_RANGE',
              message: `Product Serial Start (${start}) cannot be greater than Product Serial End (${end}) for Sales Order ${so.id || so.soNumber}.`
            });
          }
          const rangeCount = end - start + 1;
          if (rangeCount < qty) {
            return res.status(400).json({
              error: 'INSUFFICIENT_QR_RANGE',
              message: `Product serial range (${rangeCount}) must cover at least order quantity (${qty}) for Sales Order ${so.id || so.soNumber}.`
            });
          }
          const overlapRes = await checkQrRangeOverlap(prefix, start, end, so.id || so.soNumber);
          if (overlapRes.overlap) {
            return res.status(409).json({
              error: 'QR_RANGE_OVERLAP',
              message: `Product QR range overlaps with existing Sales Order ${overlapRes.overlappingSoNumber}.`
            });
          }
        }
      }
    }

    await db.transaction(async (tx) => {
      await tx.prepare(`
        INSERT INTO production_orders (id, po_number, map_po, customer, style_id, start_date, due_date, supervisor_id, remarks, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
      `).run(poDbId, body.id, body.mapPo, body.customer, styleId, body.startDate, body.dueDate, req.user!.id, body.remarks || '', statusUpper);

      for (const opStr of body.selectedOperations) {
        let code = 'QC_TEST';
        if (opStr === 'Packing') code = 'PACKING';
        else if (opStr === 'AQL Checker') code = 'AQL';
        else if (opStr === 'Box Transfer') code = 'BOX_TRANSFER';
        await tx.prepare(`INSERT INTO production_order_operations (production_order_id, operation) VALUES (?, ?)`).run(poDbId, code);
      }

      if (body.salesOrders && body.salesOrders.length > 0) {
        for (const so of body.salesOrders) {
          const soDbId = `so-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
          let lineId = 'line-04';
          if (so.lineId === 'Line 01') lineId = 'line-01';
          else if (so.lineId === 'Line 02') lineId = 'line-02';
          else if (so.lineId === 'Line 03') lineId = 'line-03';

          let shiftId = 'shift-c';
          if (so.shiftId) shiftId = so.shiftId;

          const prefix = so.productQrPrefix || so.product_qr_prefix || null;
          const start = so.productSerialStart != null ? Number(so.productSerialStart) : (so.product_serial_start != null ? Number(so.product_serial_start) : null);
          const end = so.productSerialEnd != null ? Number(so.productSerialEnd) : (so.product_serial_end != null ? Number(so.product_serial_end) : null);

          await tx.prepare(`
            INSERT INTO sales_orders (id, production_order_id, so_number, map_so, product, style_code, colour, size_range, order_quantity, line_id, shift_id, box_capacity, product_qr_prefix, product_serial_start, product_serial_end, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'In Progress', NOW(3), NOW(3))
          `).run(
            soDbId,
            poDbId,
            so.id,
            so.mapSo,
            so.product || 'Garment Product',
            body.styleCode || so.styleCode || 'ST-900',
            so.colour || 'Black',
            so.sizeRange || 'S - XL',
            so.quantity || 1000,
            lineId,
            shiftId,
            so.boxCapacity || 12,
            prefix ? prefix.trim().toUpperCase() : null,
            start,
            end
          );

          // Persist operator assignments to operator_work_assignments for THIS SO
          const assignmentsToSync = so.shifts || so.allocations || so.operators || [];
          await syncSalesOrderAllocations(tx, soDbId, assignmentsToSync, req.user!.id);
        }
      }
    });

    await auditLog(req.user!.id, 'CREATE_PO', 'production_orders', poDbId, { poNumber: body.id, styleId });

    const created = await db.prepare(`SELECT * FROM production_orders WHERE id = ?`).get(poDbId);
    const formattedCreated = await formatProductionOrder(created);
    return res.status(201).json(formattedCreated);
  } catch (err) {
    next(err);
  }
});

// Sales Order Operator Allocation endpoints using ONLY operator_work_assignments

const allocSchema = z.object({
  operatorId: z.string().min(1),
  shiftId: z.string().min(1),
  operation: z.string().optional()
});

// POST /api/production/sales-orders/:id/allocations
router.post('/sales-orders/:id/allocations', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const soParam = req.params.id;
    const { operatorId, shiftId, operation } = allocSchema.parse(req.body);

    const so = await db.prepare(`SELECT id, so_number FROM sales_orders WHERE id = ? OR so_number = ?`).get(soParam, soParam) as any;
    if (!so) {
      return res.status(404).json({ error: 'SO_NOT_FOUND', message: 'Sales Order not found' });
    }

    const opUser = await db.prepare(`SELECT id, full_name FROM users WHERE (id = ? OR username = ?) AND role = 'OPERATOR'`).get(operatorId, operatorId) as any;
    if (!opUser) {
      return res.status(404).json({ error: 'OPERATOR_NOT_FOUND', message: 'Operator not found' });
    }

    const shift = await db.prepare(`SELECT id FROM shifts WHERE id = ? OR code = ?`).get(shiftId, shiftId) as any;
    const targetShiftId = shift ? shift.id : shiftId;

    const workAssignId = `owa-${Date.now()}-${Math.random().toString().slice(2, 6)}`;

    await db.prepare(`
      INSERT INTO operator_work_assignments (id, sales_order_id, shift_id, operator_id, operation, assigned_date, source, assigned_by, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURDATE(), 'SUPERVISOR', ?, 1, NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id), active = 1, updated_at = NOW(3)
    `).run(workAssignId, so.id, targetShiftId, opUser.id, operation || 'ALL', req.user!.id);

    await auditLog(req.user!.id, 'ALLOCATE_OPERATOR', 'operator_work_assignments', workAssignId, { soId: so.id, operatorId: opUser.id, shiftId: targetShiftId });

    const allocs = await db.prepare(`
      SELECT owa.id, owa.sales_order_id, owa.shift_id, owa.operator_id, owa.operation, owa.assigned_by, owa.active, owa.created_at, u.full_name as operator_name, u.username as operator_username, s.name as shift_name
      FROM operator_work_assignments owa
      JOIN users u ON u.id = owa.operator_id
      LEFT JOIN shifts s ON s.id = owa.shift_id
      WHERE owa.sales_order_id = ? AND owa.active = 1
    `).all(so.id);

    return res.status(201).json({
      message: `Operator ${opUser.full_name} allocated to SO ${so.so_number}`,
      allocation: { id: workAssignId, salesOrderId: so.id, operatorId: opUser.id, shiftId: targetShiftId },
      allocations: allocs
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/production/sales-orders/:id/allocations/sync (SUPERVISOR / ADMIN)
router.post('/sales-orders/:id/allocations/sync', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const soParam = req.params.id;
    const so = await db.prepare(`SELECT id, so_number FROM sales_orders WHERE id = ? OR so_number = ?`).get(soParam, soParam) as any;
    if (!so) {
      return res.status(404).json({ error: 'SO_NOT_FOUND', message: 'Sales Order not found' });
    }

    const requestedShifts = req.body.shifts || req.body.allocations || (req.body.operatorId ? [req.body] : []);
    await syncSalesOrderAllocations(db, so.id, requestedShifts, req.user!.id);

    const allocs = await db.prepare(`
      SELECT owa.id, owa.sales_order_id, owa.shift_id, owa.operator_id, owa.operation, owa.assigned_by, owa.active, owa.created_at, u.full_name as operator_name, u.username as operator_username, s.name as shift_name
      FROM operator_work_assignments owa
      JOIN users u ON u.id = owa.operator_id
      LEFT JOIN shifts s ON s.id = owa.shift_id
      WHERE owa.sales_order_id = ? AND owa.active = 1
    `).all(so.id);

    return res.status(200).json({
      message: `Allocations synced for SO ${so.so_number}`,
      salesOrderId: so.id,
      allocations: allocs
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/production/sales-orders/:id/allocations
router.get('/sales-orders/:id/allocations', authenticateToken, async (req, res, next) => {
  try {
    const soParam = req.params.id;
    const so = await db.prepare(`SELECT id FROM sales_orders WHERE id = ? OR so_number = ?`).get(soParam, soParam) as any;
    if (!so) {
      return res.status(404).json({ error: 'SO_NOT_FOUND', message: 'Sales Order not found' });
    }

    const allocs = await db.prepare(`
      SELECT owa.id, owa.sales_order_id, owa.shift_id, owa.operator_id, owa.operation, owa.assigned_by, owa.active, owa.created_at, u.full_name as operator_name, u.username as operator_username, s.name as shift_name
      FROM operator_work_assignments owa
      JOIN users u ON u.id = owa.operator_id
      LEFT JOIN shifts s ON s.id = owa.shift_id
      WHERE owa.sales_order_id = ? AND owa.active = 1
    `).all(so.id);

    return res.json(allocs);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/production/sales-orders/:id/allocations/:allocId
router.delete('/sales-orders/:id/allocations/:allocId', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const { allocId } = req.params;

    await db.prepare(`UPDATE operator_work_assignments SET active = 0, updated_at = NOW(3) WHERE id = ?`).run(allocId);
    await auditLog(req.user!.id, 'DEACTIVATE_ALLOCATION', 'operator_work_assignments', allocId);

    return res.json({ message: 'Allocation deactivated successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
