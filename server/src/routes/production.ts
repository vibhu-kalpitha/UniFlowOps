import { Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { db } from '../db/connection';
import { authenticateToken, requireRole, AuthRequest, AuthUser } from '../middleware/auth';
import { auditLog } from '../middleware/errorHandler';

const router = ExpressRouter();

// Styles API

// GET /api/production/styles (or /api/styles)
router.get('/styles', authenticateToken, (req, res, next) => {
  try {
    const styles = db.prepare(`SELECT * FROM styles ORDER BY code ASC`).all();
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
router.post('/styles', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), (req: AuthRequest, res, next) => {
  try {
    const { code, name, customer, season, notes } = createStyleSchema.parse(req.body);
    const existing = db.prepare(`SELECT * FROM styles WHERE code = ?`).get(code) as any;
    if (existing) {
      return res.status(409).json({ error: 'STYLE_EXISTS', message: `Style with code ${code} already exists`, style: existing });
    }

    const id = `style-${Date.now()}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO styles (id, code, name, customer, season, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, code, name, customer || null, season || null, notes || null, now, now);

    auditLog(req.user!.id, 'CREATE_STYLE', 'styles', id, { code, name });

    const created = db.prepare(`SELECT * FROM styles WHERE id = ?`).get(id);
    return res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// Helper to map DB PO to API contract
function formatProductionOrder(po: any, reqUser?: AuthUser) {
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

  const style = po.style_id ? db.prepare(`SELECT * FROM styles WHERE id = ?`).get(po.style_id) as any : null;

  let soQuery = `
    SELECT so.*, pl.name as line_name, s.name as shift_name
    FROM sales_orders so
    LEFT JOIN production_lines pl ON pl.id = so.line_id
    LEFT JOIN shifts s ON s.id = so.shift_id
    WHERE so.production_order_id = ?
  `;
  const soRows = db.prepare(soQuery).all(po.id) as any[];

  const salesOrders = soRows.map(so => {
    // Check if user is OPERATOR and if they are allocated
    if (reqUser && reqUser.role === 'OPERATOR') {
      const isAllocated = db.prepare(`
        SELECT COUNT(*) as cnt FROM (
          SELECT id FROM so_operator_allocations WHERE sales_order_id = ? AND operator_id = ? AND active = 1
          UNION
          SELECT id FROM operator_work_assignments WHERE sales_order_id = ? AND operator_id = ? AND active = 1
          UNION
          SELECT sm.id FROM shift_members sm WHERE sm.shift_id = ? AND sm.operator_id = ? AND sm.active = 1
        )
      `).get(so.id, reqUser.id, so.id, reqUser.id, so.shift_id, reqUser.id) as any;

      if (!isAllocated || isAllocated.cnt === 0) {
        return null;
      }
    }

    // Progress metrics
    const qcPassed = (db.prepare(`
      SELECT COUNT(*) as cnt FROM qc_results qr
      JOIN item_units iu ON iu.id = qr.item_id
      WHERE iu.sales_order_id = ? AND qr.qc_result = 'PASS' AND qr.test_result = 'PASS'
    `).get(so.id) as any)?.cnt || 0;

    const qcFailed = (db.prepare(`
      SELECT COUNT(DISTINCT item_id) as cnt FROM qc_fail_log qf
      JOIN item_units iu ON iu.id = qf.item_id
      WHERE iu.sales_order_id = ?
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

    const allocations = db.prepare(`
      SELECT oa.*, u.full_name as operator_name, u.username as operator_username, s.name as shift_name
      FROM so_operator_allocations oa
      JOIN users u ON u.id = oa.operator_id
      LEFT JOIN shifts s ON s.id = oa.shift_id
      WHERE oa.sales_order_id = ? AND oa.active = 1
    `).all(so.id) as any[];

    const shifts = allocations.map(m => ({
      id: m.id,
      salesOrderId: so.id,
      workerId: m.operator_id,
      workerName: m.operator_name,
      shiftId: m.shift_id,
      shiftName: m.shift_name,
      operation: m.operation,
      date: new Date().toISOString().split('T')[0],
      enabledOperations: [m.operation]
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
  }).filter(Boolean);

  return {
    id: po.po_number,
    dbId: po.id,
    mapPo: po.map_po,
    customer: po.customer,
    styleId: style ? style.id : null,
    styleCode: style ? style.code : (salesOrders[0]?.styleCode || 'ST-900'),
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

// GET /api/production-orders
router.get('/production-orders', authenticateToken, (req: AuthRequest, res, next) => {
  try {
    const poRows = db.prepare(`SELECT * FROM production_orders ORDER BY created_at DESC`).all();
    const role = req.user?.role;

    const orders = poRows
      .map(po => formatProductionOrder(po, req.user))
      .filter(po => {
        if (!po) return false;
        // Supervisors and Admins see ALL production orders, even if they have 0 sales orders
        if (role === 'SUPERVISOR' || role === 'ADMIN') {
          return true;
        }
        // Operators see only POs that have allocated sales orders
        return po.salesOrders && po.salesOrders.length > 0;
      });

    return res.json(orders);
  } catch (err) {
    next(err);
  }
});

// GET /api/production-orders/:id
router.get('/production-orders/:id', authenticateToken, (req: AuthRequest, res, next) => {
  try {
    const po = db.prepare(`SELECT * FROM production_orders WHERE po_number = ? OR id = ?`).get(req.params.id, req.params.id);
    if (!po) {
      return res.status(404).json({ error: 'PO_NOT_FOUND', message: 'Production order not found' });
    }
    return res.json(formatProductionOrder(po, req.user));
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
  boxCapacity: z.number().optional()
});

// POST /api/production-orders/:id/sales-orders (SUPERVISOR / ADMIN)
router.post('/production-orders/:id/sales-orders', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), (req: AuthRequest, res, next) => {
  try {
    const poParam = req.params.id;
    const po = db.prepare(`SELECT * FROM production_orders WHERE id = ? OR po_number = ?`).get(poParam, poParam) as any;
    if (!po) {
      return res.status(404).json({ error: 'PO_NOT_FOUND', message: `Parent Production Order '${poParam}' not found` });
    }

    const body = addSoStandaloneSchema.parse(req.body);
    const soNumber = body.soNumber || body.id || `SO-${Math.floor(77000 + Math.random() * 9999)}`;
    const mapSo = body.mapSo || `MAP-${soNumber}`;
    const now = new Date().toISOString();
    const soDbId = `so-${Date.now()}-${Math.random().toString().slice(2, 6)}`;

    let lineId = 'line-04';
    if (body.lineId === 'Line 01' || body.lineId === 'line-01') lineId = 'line-01';
    else if (body.lineId === 'Line 02' || body.lineId === 'line-02') lineId = 'line-02';
    else if (body.lineId === 'Line 03' || body.lineId === 'line-03') lineId = 'line-03';

    const shiftId = body.shiftId || 'shift-c';
    const qty = body.orderQuantity || body.quantity || 1000;

    db.prepare(`
      INSERT INTO sales_orders (id, production_order_id, so_number, map_so, product, style_code, colour, size_range, order_quantity, line_id, shift_id, box_capacity, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'In Progress', ?, ?)
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
      now,
      now
    );

    auditLog(req.user!.id, 'CREATE_SO', 'sales_orders', soDbId, { poId: po.id, soNumber });

    const updatedPo = formatProductionOrder(po, req.user);
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

// POST /api/production-orders (SUPERVISOR / ADMIN)
router.post('/production-orders', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), (req: AuthRequest, res, next) => {
  try {
    const body = createPoSchema.parse(req.body);
    const now = new Date().toISOString();
    const poDbId = `po-${Date.now()}`;
    const statusUpper = (body.status || 'CURRENT').toUpperCase();

    let styleId = body.styleId || null;
    if (!styleId && body.styleCode) {
      let existingStyle = db.prepare(`SELECT id FROM styles WHERE code = ?`).get(body.styleCode) as any;
      if (!existingStyle) {
        const newStyleId = `style-${Date.now()}`;
        db.prepare(`
          INSERT INTO styles (id, code, name, customer, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(newStyleId, body.styleCode, body.styleName || `Style ${body.styleCode}`, body.customer, now, now);
        styleId = newStyleId;
      } else {
        styleId = existingStyle.id;
      }
    }

    db.transaction(() => {
      // 1. Insert PO
      db.prepare(`
        INSERT INTO production_orders (id, po_number, map_po, customer, style_id, start_date, due_date, supervisor_id, remarks, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(poDbId, body.id, body.mapPo, body.customer, styleId, body.startDate, body.dueDate, req.user!.id, body.remarks || '', statusUpper, now, now);

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
            body.styleCode || so.styleCode || 'ST-900',
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

    auditLog(req.user!.id, 'CREATE_PO', 'production_orders', poDbId, { poNumber: body.id, styleId });

    const created = db.prepare(`SELECT * FROM production_orders WHERE id = ?`).get(poDbId);
    return res.status(201).json(formatProductionOrder(created));
  } catch (err) {
    next(err);
  }
});

// Sales Order Operator Allocation endpoints (SUPERVISOR / ADMIN)

const allocSchema = z.object({
  operatorId: z.string().min(1),
  shiftId: z.string().min(1),
  operation: z.enum(['QC_TEST', 'PACKING', 'AQL', 'BOX_TRANSFER'])
});

// POST /api/production/sales-orders/:id/allocations
router.post('/sales-orders/:id/allocations', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), (req: AuthRequest, res, next) => {
  try {
    const soParam = req.params.id;
    const { operatorId, shiftId, operation } = allocSchema.parse(req.body);

    const so = db.prepare(`SELECT id, so_number FROM sales_orders WHERE id = ? OR so_number = ?`).get(soParam, soParam) as any;
    if (!so) {
      return res.status(404).json({ error: 'SO_NOT_FOUND', message: 'Sales Order not found' });
    }

    const opUser = db.prepare(`SELECT id, full_name FROM users WHERE (id = ? OR username = ?) AND role = 'OPERATOR'`).get(operatorId, operatorId) as any;
    if (!opUser) {
      return res.status(404).json({ error: 'OPERATOR_NOT_FOUND', message: 'Operator not found' });
    }

    const allocId = `alloc-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(`
        INSERT INTO so_operator_allocations (id, sales_order_id, shift_id, operator_id, operation, created_by, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(allocId, so.id, shiftId, opUser.id, operation, req.user!.id, now, now);

      const workAssignId = `owa-${Date.now()}`;
      db.prepare(`
        INSERT INTO operator_work_assignments (id, operator_id, sales_order_id, operation, assigned_date, source, active, created_at)
        VALUES (?, ?, ?, ?, ?, 'SUPERVISOR', 1, ?)
      `).run(workAssignId, opUser.id, so.id, operation, now.split('T')[0], now);
    })();

    auditLog(req.user!.id, 'ALLOCATE_OPERATOR', 'so_operator_allocations', allocId, { soId: so.id, operatorId: opUser.id, operation });

    return res.status(201).json({
      message: `Operator ${opUser.full_name} allocated to SO ${so.so_number} for ${operation}`,
      allocation: { id: allocId, salesOrderId: so.id, operatorId: opUser.id, shiftId, operation }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/production/sales-orders/:id/allocations
router.get('/sales-orders/:id/allocations', authenticateToken, (req, res, next) => {
  try {
    const soParam = req.params.id;
    const so = db.prepare(`SELECT id FROM sales_orders WHERE id = ? OR so_number = ?`).get(soParam, soParam) as any;
    if (!so) {
      return res.status(404).json({ error: 'SO_NOT_FOUND', message: 'Sales Order not found' });
    }

    const allocs = db.prepare(`
      SELECT oa.*, u.full_name as operator_name, u.username as operator_username, s.name as shift_name
      FROM so_operator_allocations oa
      JOIN users u ON u.id = oa.operator_id
      LEFT JOIN shifts s ON s.id = oa.shift_id
      WHERE oa.sales_order_id = ? AND oa.active = 1
    `).all(so.id);

    return res.json(allocs);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/production/sales-orders/:id/allocations/:allocId
router.delete('/sales-orders/:id/allocations/:allocId', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), (req: AuthRequest, res, next) => {
  try {
    const { allocId } = req.params;
    const now = new Date().toISOString();

    db.prepare(`UPDATE so_operator_allocations SET active = 0, updated_at = ? WHERE id = ?`).run(now, allocId);
    auditLog(req.user!.id, 'DEACTIVATE_ALLOCATION', 'so_operator_allocations', allocId);

    return res.json({ message: 'Allocation deactivated successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
