import { Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { authenticateToken, requireRole, AuthRequest, AuthUser } from '../middleware/auth.js';
import { auditLog } from '../middleware/errorHandler.js';

const router = ExpressRouter();

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
export async function formatProductionOrder(po: any, reqUser?: AuthUser) {
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

  // Strictly enforce Operator Visibility Rule using operator_work_assignments
  if (reqUser && reqUser.role === 'OPERATOR') {
    const isAllocated = await db.prepare(`
      SELECT COUNT(*) as cnt FROM operator_work_assignments
      WHERE (production_order_id = ? OR sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
        AND operator_id = ? AND active = 1
    `).get(po.id, po.id, reqUser.id) as any;

    if (!isAllocated || isAllocated.cnt === 0) {
      return null;
    }
  }

  // Load PO Product Configurations
  const configRows = await db.prepare(`
    SELECT * FROM production_order_configs WHERE production_order_id = ? ORDER BY config_code ASC
  `).all(po.id) as any[];

  const productConfigurations = configRows.map(c => ({
    id: c.id,
    productionOrderId: c.production_order_id,
    configCode: c.config_code,
    productType: c.product_type || undefined,
    size: c.size || undefined,
    productQrPrefix: c.product_qr_prefix,
    productSerialStart: Number(c.product_serial_start),
    productSerialEnd: Number(c.product_serial_end),
    quantity: c.quantity
  }));

  const totalQuantity = productConfigurations.length > 0
    ? productConfigurations.reduce((sum, c) => sum + c.quantity, 0)
    : 0;

  // QC Test Mode
  let qcTestMode: string = 'QC & Test';
  if (po.qc_test_mode === 'QC_ONLY') qcTestMode = 'QC Only';
  else if (po.qc_test_mode === 'TEST_ONLY') qcTestMode = 'Test Only';

  // Load PO-level allocations
  const poAllocations = await db.prepare(`
    SELECT owa.id, owa.production_order_id, owa.sales_order_id, owa.shift_id, owa.operator_id, owa.operation, owa.assigned_by, owa.active, owa.created_at, u.full_name as operator_name, u.username as operator_username, s.name as shift_name
    FROM operator_work_assignments owa
    JOIN users u ON u.id = owa.operator_id
    LEFT JOIN shifts s ON s.id = owa.shift_id
    WHERE (owa.production_order_id = ? OR owa.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?)) AND owa.active = 1
  `).all(po.id, po.id) as any[];

  const shifts = poAllocations.map(m => ({
    id: m.id,
    productionOrderId: po.id,
    salesOrderId: m.sales_order_id || undefined,
    workerId: m.operator_id,
    workerName: m.operator_name,
    shiftId: m.shift_id,
    shiftName: m.shift_name,
    operation: m.operation || 'ALL',
    date: new Date().toISOString().split('T')[0],
    enabledOperations: [m.operation || 'ALL']
  }));

  // Aggregated progress metrics
  const qcPassedRow = await db.prepare(`
    SELECT COUNT(DISTINCT iu.id) as cnt FROM qc_results qr
    JOIN item_units iu ON iu.id = qr.item_id
    WHERE (iu.production_order_id = ? OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
      AND qr.qc_result = 'PASS' AND qr.test_result = 'PASS'
  `).get(po.id, po.id) as any;
  const qcPassed = qcPassedRow?.cnt || 0;

  const qcFailedRow = await db.prepare(`
    SELECT COUNT(DISTINCT item_id) as cnt FROM qc_fail_log qf
    JOIN item_units iu ON iu.id = qf.item_id
    WHERE (iu.production_order_id = ? OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
  `).get(po.id, po.id) as any;
  const qcFailed = qcFailedRow?.cnt || 0;

  const packedRow = await db.prepare(`
    SELECT COUNT(DISTINCT bi.item_id) as cnt FROM box_items bi
    JOIN boxes b ON b.id = bi.box_id
    WHERE (b.production_order_id = ? OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?)) AND bi.active = 1
  `).get(po.id, po.id) as any;
  const packed = packedRow?.cnt || 0;

  const aqlPassedRow = await db.prepare(`
    SELECT COUNT(*) as cnt FROM aql_inspections ai
    JOIN boxes b ON b.id = ai.box_id
    WHERE (b.production_order_id = ? OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?)) AND ai.result = 'PASSED'
  `).get(po.id, po.id) as any;
  const aqlPassed = aqlPassedRow?.cnt || 0;

  // Legacy SO rows if present
  const soRows = await db.prepare(`
    SELECT so.*, pl.name as line_name, s.name as shift_name
    FROM sales_orders so
    LEFT JOIN production_lines pl ON pl.id = so.line_id
    LEFT JOIN shifts s ON s.id = so.shift_id
    WHERE so.production_order_id = ?
  `).all(po.id) as any[];

  const salesOrders = soRows.map(so => ({
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
  }));

  const calcTotalQty = totalQuantity || (salesOrders.reduce((sum, s) => sum + (s.quantity || 0), 0)) || 1000;

  return {
    id: po.po_number,
    dbId: po.id,
    mapPo: po.map_po,
    customer: po.customer || 'Factory Customer',
    styleId: style ? style.id : null,
    styleCode: style ? style.code : 'ST-900',
    styleName: style ? style.name : 'Standard Style',
    startDate: po.start_date,
    dueDate: po.due_date,
    supervisorId: po.supervisor_id,
    remarks: po.remarks || '',
    status: po.status === 'CURRENT' ? 'Current' : po.status === 'COMPLETED' ? 'Completed' : 'Draft',
    selectedOperations,
    qcTestMode,
    productConfigurations,
    totalQuantity: calcTotalQty,
    allocations: poAllocations,
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
      status: po.status === 'CURRENT' ? 'In Progress' : po.status
    },
    salesOrders
  };
}

export async function checkQrRangeOverlap(
  prefix: string,
  start: number,
  end: number,
  excludePoId?: string
): Promise<{ overlap: boolean; overlappingPoNumber?: string }> {
  if (!prefix || start == null || end == null) return { overlap: false };
  const normPrefix = prefix.trim().toUpperCase();

  // 1. Check production_order_configs
  let pocQuery = `
    SELECT poc.id, po.po_number, poc.product_qr_prefix, poc.product_serial_start, poc.product_serial_end
    FROM production_order_configs poc
    JOIN production_orders po ON po.id = poc.production_order_id
    WHERE UPPER(TRIM(poc.product_qr_prefix)) = ?
  `;
  const pocParams: any[] = [normPrefix];
  if (excludePoId) {
    pocQuery += ` AND po.id != ? AND po.po_number != ?`;
    pocParams.push(excludePoId, excludePoId);
  }
  const pocRows = await db.prepare(pocQuery).all(...pocParams) as any[];
  for (const r of pocRows) {
    const existStart = Number(r.product_serial_start);
    const existEnd = Number(r.product_serial_end);
    if (Math.max(start, existStart) <= Math.min(end, existEnd)) {
      return { overlap: true, overlappingPoNumber: r.po_number || r.id };
    }
  }

  // 2. Check sales_orders (for historical compatibility)
  let soQuery = `
    SELECT id, so_number, product_qr_prefix, product_serial_start, product_serial_end 
    FROM sales_orders 
    WHERE UPPER(TRIM(product_qr_prefix)) = ? AND product_serial_start IS NOT NULL AND product_serial_end IS NOT NULL
  `;
  const soParams: any[] = [normPrefix];
  if (excludePoId) {
    soQuery += ` AND production_order_id != ? AND id != ? AND so_number != ?`;
    soParams.push(excludePoId, excludePoId, excludePoId);
  }
  const soRows = await db.prepare(soQuery).all(...soParams) as any[];
  for (const r of soRows) {
    const existStart = Number(r.product_serial_start);
    const existEnd = Number(r.product_serial_end);
    if (Math.max(start, existStart) <= Math.min(end, existEnd)) {
      return { overlap: true, overlappingPoNumber: r.so_number || r.id };
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
      return true;
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

const createPoProductConfigSchema = z.object({
  configCode: z.string().min(1),
  productType: z.string().optional(),
  size: z.string().optional(),
  productQrPrefix: z.string().min(1),
  productSerialStart: z.number(),
  productSerialEnd: z.number(),
  quantity: z.number().optional()
});

const createPoSchema = z.object({
  id: z.string().min(1),
  mapPo: z.string().min(1),
  customer: z.string().optional(),
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
  qcTestMode: z.string().optional(),
  productConfigurations: z.array(createPoProductConfigSchema).optional(),
  shifts: z.array(z.any()).optional(),
  allocations: z.array(z.any()).optional(),
  salesOrders: z.array(z.any()).optional()
});

async function syncPoAllocations(
  tx: any,
  poDbId: string,
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
      WHERE production_order_id = ? AND active = 1 AND operator_id NOT IN (${placeholders})
    `).run(poDbId, ...activeOpIds);
  } else {
    await tx.prepare(`
      UPDATE operator_work_assignments 
      SET active = 0, updated_at = NOW(3)
      WHERE production_order_id = ? AND active = 1
    `).run(poDbId);
  }

  for (const assign of activeOpAssignments) {
    const owaId = `owa-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
    await tx.prepare(`
      INSERT INTO operator_work_assignments (id, production_order_id, shift_id, operator_id, operation, assigned_date, source, assigned_by, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURDATE(), 'SUPERVISOR', ?, 1, NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id), active = 1, updated_at = NOW(3)
    `).run(owaId, poDbId, assign.shiftId, assign.operatorId, assign.operation, assignedByUserId);
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

    // QC Test Mode format mapping
    let dbQcTestMode = 'QC_AND_TEST';
    if (body.qcTestMode === 'QC Only' || body.qcTestMode === 'QC_ONLY') dbQcTestMode = 'QC_ONLY';
    else if (body.qcTestMode === 'Test Only' || body.qcTestMode === 'TEST_ONLY') dbQcTestMode = 'TEST_ONLY';

    // Validate product configurations
    if (body.productConfigurations && body.productConfigurations.length > 0) {
      for (const config of body.productConfigurations) {
        const prefix = config.productQrPrefix;
        const start = Number(config.productSerialStart);
        const end = Number(config.productSerialEnd);

        if (start > end) {
          return res.status(400).json({
            error: 'INVALID_QR_RANGE',
            message: `Serial Start (${start}) cannot be greater than Serial End (${end}) for product config ${config.configCode}.`
          });
        }

        const overlapRes = await checkQrRangeOverlap(prefix, start, end, body.id);
        if (overlapRes.overlap) {
          return res.status(409).json({
            error: 'QR_RANGE_OVERLAP',
            message: `Product QR range (${prefix}) overlaps with existing Production Order ${overlapRes.overlappingPoNumber}.`
          });
        }
      }
    }

    await db.transaction(async (tx) => {
      await tx.prepare(`
        INSERT INTO production_orders (id, po_number, map_po, customer, style_id, start_date, due_date, supervisor_id, qc_test_mode, remarks, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
      `).run(poDbId, body.id, body.mapPo, body.customer || 'Factory Customer', styleId, body.startDate, body.dueDate, req.user!.id, dbQcTestMode, body.remarks || '', statusUpper);

      for (const opStr of body.selectedOperations) {
        let code = 'QC_TEST';
        if (opStr === 'Packing') code = 'PACKING';
        else if (opStr === 'AQL Checker') code = 'AQL';
        else if (opStr === 'Box Transfer') code = 'BOX_TRANSFER';
        await tx.prepare(`INSERT INTO production_order_operations (production_order_id, operation) VALUES (?, ?)`).run(poDbId, code);
      }

      // Insert product configurations
      if (body.productConfigurations && body.productConfigurations.length > 0) {
        for (const config of body.productConfigurations) {
          const pocId = `poc-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
          const prefix = config.productQrPrefix.trim().toUpperCase();
          const start = Number(config.productSerialStart);
          const end = Number(config.productSerialEnd);
          const qty = config.quantity || (end - start + 1);

          await tx.prepare(`
            INSERT INTO production_order_configs (id, production_order_id, config_code, product_type, size, product_qr_prefix, product_serial_start, product_serial_end, quantity, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
          `).run(pocId, poDbId, config.configCode, config.productType || null, config.size || null, prefix, start, end, qty);
        }
      }

      // Sync PO shift allocations
      const assignmentsToSync = body.shifts || body.allocations || [];
      await syncPoAllocations(tx, poDbId, assignmentsToSync, req.user!.id);
    });

    await auditLog(req.user!.id, 'CREATE_PO', 'production_orders', poDbId, { poNumber: body.id, styleId });

    const created = await db.prepare(`SELECT * FROM production_orders WHERE id = ?`).get(poDbId);
    const formattedCreated = await formatProductionOrder(created);
    return res.status(201).json(formattedCreated);
  } catch (err) {
    next(err);
  }
});

// POST /api/production-orders/:id/allocations
const poAllocSchema = z.object({
  operatorId: z.string().min(1),
  shiftId: z.string().min(1),
  operation: z.string().optional()
});

router.post('/production-orders/:id/allocations', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const poParam = req.params.id;
    const { operatorId, shiftId, operation } = poAllocSchema.parse(req.body);

    const po = await db.prepare(`SELECT id, po_number FROM production_orders WHERE id = ? OR po_number = ?`).get(poParam, poParam) as any;
    if (!po) {
      return res.status(404).json({ error: 'PO_NOT_FOUND', message: 'Production Order not found' });
    }

    const opUser = await db.prepare(`SELECT id, full_name FROM users WHERE (id = ? OR username = ?) AND role = 'OPERATOR'`).get(operatorId, operatorId) as any;
    if (!opUser) {
      return res.status(404).json({ error: 'OPERATOR_NOT_FOUND', message: 'Operator not found' });
    }

    const shift = await db.prepare(`SELECT id FROM shifts WHERE id = ? OR code = ?`).get(shiftId, shiftId) as any;
    const targetShiftId = shift ? shift.id : shiftId;

    const workAssignId = `owa-${Date.now()}-${Math.random().toString().slice(2, 6)}`;

    await db.prepare(`
      INSERT INTO operator_work_assignments (id, production_order_id, shift_id, operator_id, operation, assigned_date, source, assigned_by, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURDATE(), 'SUPERVISOR', ?, 1, NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id), active = 1, updated_at = NOW(3)
    `).run(workAssignId, po.id, targetShiftId, opUser.id, operation || 'ALL', req.user!.id);

    await auditLog(req.user!.id, 'ALLOCATE_OPERATOR_PO', 'operator_work_assignments', workAssignId, { poId: po.id, operatorId: opUser.id, shiftId: targetShiftId });

    const allocs = await db.prepare(`
      SELECT owa.id, owa.production_order_id, owa.shift_id, owa.operator_id, owa.operation, owa.assigned_by, owa.active, owa.created_at, u.full_name as operator_name, u.username as operator_username, s.name as shift_name
      FROM operator_work_assignments owa
      JOIN users u ON u.id = owa.operator_id
      LEFT JOIN shifts s ON s.id = owa.shift_id
      WHERE owa.production_order_id = ? AND owa.active = 1
    `).all(po.id);

    return res.status(201).json({
      message: `Operator ${opUser.full_name} allocated to PO ${po.po_number}`,
      allocation: { id: workAssignId, productionOrderId: po.id, operatorId: opUser.id, shiftId: targetShiftId },
      allocations: allocs
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/production-orders/:id/allocations
router.get('/production-orders/:id/allocations', authenticateToken, async (req, res, next) => {
  try {
    const poParam = req.params.id;
    const po = await db.prepare(`SELECT id FROM production_orders WHERE id = ? OR po_number = ?`).get(poParam, poParam) as any;
    if (!po) {
      return res.status(404).json({ error: 'PO_NOT_FOUND', message: 'Production Order not found' });
    }

    const allocs = await db.prepare(`
      SELECT owa.id, owa.production_order_id, owa.sales_order_id, owa.shift_id, owa.operator_id, owa.operation, owa.assigned_by, owa.active, owa.created_at, u.full_name as operator_name, u.username as operator_username, s.name as shift_name
      FROM operator_work_assignments owa
      JOIN users u ON u.id = owa.operator_id
      LEFT JOIN shifts s ON s.id = owa.shift_id
      WHERE (owa.production_order_id = ? OR owa.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?)) AND owa.active = 1
    `).all(po.id, po.id);

    return res.json(allocs);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/production-orders/:id/allocations/:allocId
router.delete('/production-orders/:id/allocations/:allocId', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
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
