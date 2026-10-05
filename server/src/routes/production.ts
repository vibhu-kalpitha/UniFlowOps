import { Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { authenticateToken, requireRole, AuthRequest, AuthUser } from '../middleware/auth.js';
import { auditLog } from '../middleware/errorHandler.js';

const router = ExpressRouter();

// GET /api/production/styles (or /api/styles)
router.get('/styles', authenticateToken, async (req, res, next) => {
  try {
    let styles = await db.prepare(`SELECT * FROM styles ORDER BY name ASC`).all();
    if (styles.length === 0) {
      const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
      await db.execute(`
        INSERT INTO styles (id, code, name, customer, season, created_at, updated_at)
        VALUES 
          ('style-biotab-2', 'ST-BIOTAB-2', 'BioTab 2 Style', 'BioTab Healthcare', '2026', ?, ?),
          ('style-beacon', 'ST-BEACON', 'Beacon Style', 'Beacon Medical', '2026', ?, ?)
      `, [now, now, now, now]);
      styles = await db.prepare(`SELECT * FROM styles ORDER BY name ASC`).all();
    }
    return res.json(styles);
  } catch (err) {
    next(err);
  }
});

// GET /api/operators — List all active operators (for supervisor PO & shift management)
router.get('/operators', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req, res, next) => {
  try {
    const operators = await db.prepare(`
      SELECT id, full_name, username, employee_no
      FROM users
      WHERE role = 'OPERATOR' AND active = 1
      ORDER BY full_name ASC
    `).all();
    return res.json(operators);
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
  let selectedOperations = opsRows.map(r => {
    switch (r.operation) {
      case 'PRE_QC': return 'Pre QC';
      case 'QC_TEST': return 'QC Test';
      case 'PACKING': return 'Packing';
      case 'AQL': return 'AQL Checker';
      case 'BOX_TRANSFER': return 'Box Transfer';
      default: return r.operation;
    }
  });

  if (selectedOperations.length === 0 && po.operations) {
    try {
      const parsed = typeof po.operations === 'string' ? JSON.parse(po.operations) : po.operations;
      if (Array.isArray(parsed) && parsed.length > 0) {
        selectedOperations = parsed.map((op: string) => {
          if (op === 'PRE_QC' || op === 'PREQC') return 'Pre QC';
          if (op === 'QC_TEST' || op === 'QC') return 'QC Test';
          if (op === 'PACKING' || op === 'PACK') return 'Packing';
          if (op === 'AQL' || op === 'AQL_CHECKER') return 'AQL Checker';
          if (op === 'BOX_TRANSFER') return 'Box Transfer';
          return op;
        });
      }
    } catch (e) {}
  }

  if (selectedOperations.length === 0) {
    selectedOperations = ['Pre QC', 'QC Test', 'Packing', 'AQL Checker', 'Box Transfer'];
  }

  const style = po.style_id ? await db.prepare(`SELECT * FROM styles WHERE id = ?`).get(po.style_id) as any : null;

  // Strictly enforce Operator Visibility Rule using operator_work_assignments
  if (reqUser && reqUser.role === 'OPERATOR') {
    const totalAssignments = await db.prepare(`
      SELECT COUNT(*) as cnt FROM operator_work_assignments
      WHERE (operator_id = ? OR operator_id = ?) AND active = 1
    `).get(reqUser.id, reqUser.username || reqUser.id) as any;

    if (totalAssignments && totalAssignments.cnt > 0) {
      const isAllocated = await db.prepare(`
        SELECT COUNT(*) as cnt FROM operator_work_assignments
        WHERE (production_order_id = ? OR sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
          AND (operator_id = ? OR operator_id = ?) AND active = 1
      `).get(po.id, po.id, reqUser.id, reqUser.username || reqUser.id) as any;

      if (!isAllocated || isAllocated.cnt === 0) {
        return null;
      }
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
    LEFT JOIN item_units iu ON iu.id = bi.item_id
    WHERE (
      b.production_order_id = ? 
      OR iu.production_order_id = ?
      OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?)
      OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?)
    ) AND bi.active = 1
  `).get(po.id, po.id, po.id, po.id) as any;
  const packed = packedRow?.cnt || 0;

  const aqlPassedRow = await db.prepare(`
    SELECT COUNT(*) as cnt FROM aql_inspections ai
    LEFT JOIN boxes b ON (b.id = ai.box_id OR UPPER(TRIM(b.box_code)) = UPPER(TRIM(ai.box_id)) OR UPPER(TRIM(b.box_number)) = UPPER(TRIM(ai.box_id)))
    WHERE (
      ai.production_order_id = ? 
      OR b.production_order_id = ? 
      OR ai.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?)
      OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?)
    ) AND UPPER(TRIM(ai.result)) IN ('PASS', 'PASSED')
  `).get(po.id, po.id, po.id, po.id) as any;
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

  const shiftRow = po.shift_id ? await db.prepare(`SELECT * FROM shifts WHERE id = ? OR code = ?`).get(po.shift_id, po.shift_id) as any : null;
  const resolvedShiftId = po.shift_id || shiftRow?.id || (shifts[0]?.shiftId || undefined);
  const resolvedShiftName = shiftRow?.name || (shifts[0]?.shiftName || undefined);
  const resolvedShiftCode = shiftRow?.code || undefined;

  return {
    id: po.po_number,
    dbId: po.id,
    poName: po.po_name || po.poName || undefined,
    mapPo: po.map_po,
    customer: po.customer || 'Factory Customer',
    styleId: style ? style.id : null,
    styleCode: style ? style.code : 'ST-900',
    styleName: style ? style.name : 'Standard Style',
    startDate: po.start_date,
    dueDate: po.due_date,
    supervisorId: po.supervisor_id,
    shiftId: resolvedShiftId,
    shiftCode: resolvedShiftCode,
    shiftName: resolvedShiftName,
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
  _prefix: string,
  _start: number,
  _end: number,
  _excludePoId?: string
): Promise<{ overlap: boolean; overlappingPoNumber?: string }> {
  // Range overlap checking has been completely removed per business requirements.
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
  productQrPrefix: z.string().optional(),
  productSerialStart: z.number().optional(),
  productSerialEnd: z.number().optional(),
  quantity: z.number().optional()
});

const createPoSchema = z.object({
  id: z.string().min(1),
  poName: z.string().optional(),
  po_name: z.string().optional(),
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
  shiftId: z.string().optional(),
  shift_id: z.string().optional(),
  productConfigurations: z.array(createPoProductConfigSchema).optional(),
  shifts: z.array(z.any()).optional(),
  allocations: z.array(z.any()).optional(),
  salesOrders: z.array(z.any()).optional()
});

async function syncPoAllocations(
  tx: any,
  poDbId: string,
  requestedAssignments: any[],
  assignedByUserId: string,
  fallbackOperations?: string[]
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

    const shiftId = shiftRow ? shiftRow.id : rawShift;

    // Build list of operations for this allocation
    // If the item has enabledOperations array, expand each one; else use single operation or fallback
    const rawOpsArray: string[] = Array.isArray(item.enabledOperations) && item.enabledOperations.length > 0
      ? item.enabledOperations
      : item.operation
        ? [item.operation]
        : fallbackOperations || ['ALL'];

    // Map frontend operation names to DB codes
    for (const opName of rawOpsArray) {
      let opCode = opName;
      if (opName === 'Pre QC') opCode = 'PRE_QC';
      else if (opName === 'QC Test') opCode = 'QC_TEST';
      else if (opName === 'Packing') opCode = 'PACKING';
      else if (opName === 'AQL Checker') opCode = 'AQL';
      else if (opName === 'Box Transfer') opCode = 'BOX_TRANSFER';

      activeOpAssignments.push({ operatorId: opUser.id, shiftId, operation: opCode });
    }
  }

  const activeOpIds = [...new Set(activeOpAssignments.map(a => a.operatorId))];

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

    const rawShiftId = body.shiftId || body.shift_id;
    let poShiftId: string | null = null;
    if (rawShiftId) {
      const shiftRow = await db.prepare(`SELECT id FROM shifts WHERE id = ? OR code = ? OR name = ?`).get(rawShiftId, rawShiftId, rawShiftId) as any;
      poShiftId = shiftRow ? shiftRow.id : rawShiftId;
    }

    const poNameVal = (body.poName || body.po_name || '').trim() || null;

    await db.transaction(async (tx) => {
      await tx.prepare(`
        INSERT INTO production_orders (id, po_number, po_name, map_po, customer, style_id, start_date, due_date, supervisor_id, qc_test_mode, shift_id, remarks, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
      `).run(poDbId, body.id, poNameVal, body.mapPo, body.customer || 'Factory Customer', styleId, body.startDate, body.dueDate, req.user!.id, dbQcTestMode, poShiftId, body.remarks || '', statusUpper);

      for (const opStr of body.selectedOperations) {
        let code = opStr;
        if (opStr === 'Pre QC') code = 'PRE_QC';
        else if (opStr === 'QC Test') code = 'QC_TEST';
        else if (opStr === 'Packing') code = 'PACKING';
        else if (opStr === 'AQL Checker') code = 'AQL';
        else if (opStr === 'Box Transfer') code = 'BOX_TRANSFER';
        await tx.prepare(`INSERT INTO production_order_operations (production_order_id, operation) VALUES (?, ?)`).run(poDbId, code);
      }

      if (body.productConfigurations && body.productConfigurations.length > 0) {
        for (const config of body.productConfigurations) {
          const cfgAny = config as any;
          const pocId = `poc-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
          const code = (config.configCode || cfgAny.config_code || 'CONFIG-1').trim().toUpperCase();
          const pType = config.productType || cfgAny.product_type || null;
          const sz = config.size || null;
          const qty = Number(config.quantity) || 100;
          const prefix = config.productQrPrefix ? config.productQrPrefix.trim().toUpperCase() : code;
          const start = config.productSerialStart != null && !isNaN(Number(config.productSerialStart)) ? Number(config.productSerialStart) : 1;
          const end = config.productSerialEnd != null && !isNaN(Number(config.productSerialEnd)) ? Number(config.productSerialEnd) : qty;

          await tx.prepare(`
            INSERT INTO production_order_configs (id, production_order_id, config_code, product_type, size, product_qr_prefix, product_serial_start, product_serial_end, quantity, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
          `).run(pocId, poDbId, code, pType, sz, prefix, start, end, qty);
        }
      }

      // Sync PO shift allocations
      const assignmentsToSync = body.shifts || body.allocations || [];
      await syncPoAllocations(tx, poDbId, assignmentsToSync, req.user!.id, body.selectedOperations);
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

// ── ADMIN USER MANAGEMENT ENDPOINTS ──────────────────────────────
// GET /api/admin/users
router.get('/admin/users', authenticateToken, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const users = await db.query(`
      SELECT id, employee_no, username, full_name, role, active, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
    `);
    const formatted = users.map((u: any) => ({
      id: u.id,
      employeeNo: u.employee_no || u.id,
      username: u.username,
      name: u.full_name,
      role: u.role.charAt(0).toUpperCase() + u.role.slice(1).toLowerCase(),
      lineId: u.role === 'OPERATOR' ? 'Line 04' : u.role === 'SUPERVISOR' ? 'Line 04 & 02' : 'All Lines',
      status: u.active ? 'Active' : 'Inactive',
      createdAt: u.created_at
    }));
    return res.json(formatted);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users
router.post('/admin/users', authenticateToken, requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const bcrypt = (await import('bcryptjs')).default;
    const { username, password, role, employeeNo } = req.body;
    const fullName = req.body.fullName || req.body.full_name || req.body.name;
    if (!username || !password || !fullName || !role) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Username, password, name, and role are required' });
    }
    const cleanUser = username.trim().toLowerCase();
    const existing = await db.prepare(`SELECT id FROM users WHERE LOWER(username) = ?`).get(cleanUser);
    if (existing) {
      return res.status(409).json({ error: 'USER_EXISTS', message: `User @${cleanUser} already exists` });
    }
    const userId = `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const passwordHash = bcrypt.hashSync(password, 10);
    const empNo = employeeNo || `EMP-${Date.now().toString().slice(-4)}`;
    await db.prepare(`
      INSERT INTO users (id, employee_no, username, password_hash, full_name, role, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, NOW(3), NOW(3))
    `).run(userId, empNo, cleanUser, passwordHash, fullName, role.toUpperCase());
    await auditLog(req.user!.id, 'CREATE_USER', 'users', userId, { username: cleanUser, role });
    return res.status(201).json({ message: 'User created successfully', userId });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/users/:id
router.patch('/admin/users/:id', authenticateToken, requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const { fullName, role, active } = req.body;
    const userId = req.params.id;
    const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as any;
    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
    }
    if (fullName) await db.prepare(`UPDATE users SET full_name = ?, updated_at = NOW(3) WHERE id = ?`).run(fullName, userId);
    if (role) await db.prepare(`UPDATE users SET role = ?, updated_at = NOW(3) WHERE id = ?`).run(role.toUpperCase(), userId);
    if (active !== undefined) await db.prepare(`UPDATE users SET active = ?, updated_at = NOW(3) WHERE id = ?`).run(active ? 1 : 0, userId);
    await auditLog(req.user!.id, 'UPDATE_USER', 'users', userId, { fullName, role, active });
    return res.json({ message: 'User updated successfully' });
  } catch (err) {
    next(err);
  }
});

// ── ADMIN STYLE MANAGEMENT ENDPOINTS ──────────────────────────────
// GET /api/admin/styles
router.get('/admin/styles', authenticateToken, requireRole(['ADMIN', 'SUPERVISOR']), async (req, res, next) => {
  try {
    const styles = await db.query(`
      SELECT s.*,
        (SELECT COUNT(id) FROM production_orders WHERE style_id = s.id) as po_count
      FROM styles s
      ORDER BY s.created_at DESC
    `);
    return res.json(styles);
  } catch (err) {
    next(err);
  }
});

// ── ADMIN PRODUCTION ORDERS & QUANTITY EDITING ────────────────────
// GET /api/admin/orders
router.get('/admin/orders', authenticateToken, requireRole(['ADMIN', 'SUPERVISOR']), async (req, res, next) => {
  try {
    const orders = await db.query(`
      SELECT 
        po.id, po.po_number, po.po_name, po.customer, po.start_date, po.due_date, po.status, po.created_at,
        s.name as style_name, s.code as style_code, u.full_name as supervisor_name,
        (SELECT SUM(quantity) FROM production_order_configs WHERE production_order_id = po.id) as cfg_qty,
        (SELECT COUNT(DISTINCT item_id) FROM qc_results qr JOIN item_units iu ON iu.id = qr.item_id WHERE (iu.production_order_id = po.id OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = po.id)) AND qr.qc_result = 'PASS' AND qr.test_result = 'PASS') as qc_passed_count,
        (SELECT COUNT(DISTINCT bi.item_id) FROM box_items bi JOIN boxes b ON b.id = bi.box_id LEFT JOIN item_units iu ON iu.id = bi.item_id WHERE (b.production_order_id = po.id OR iu.production_order_id = po.id OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = po.id)) AND bi.active = 1) as packed_count
      FROM production_orders po
      LEFT JOIN styles s ON s.id = po.style_id
      LEFT JOIN users u ON u.id = po.supervisor_id
      ORDER BY po.created_at DESC
    `);

    const formatted = orders.map((p: any) => {
      const targetQty = Number(p.cfg_qty || p.total_quantity || 500);
      const packed = Number(p.packed_count || 0);
      const qcPassed = Number(p.qc_passed_count || 0);
      const completionPct = targetQty > 0 ? Math.min(100, Math.round((packed / targetQty) * 100)) : 0;

      return {
        id: p.id,
        poNumber: p.po_number,
        poName: p.po_name || null,
        styleName: p.style_name || p.style_code || 'Standard Style',
        customer: p.customer || 'Standard',
        supervisorName: p.supervisor_name || 'Supervisor',
        startDate: p.start_date,
        dueDate: p.due_date,
        status: p.status,
        configuredQuantity: targetQty,
        qcPassedCount: qcPassed,
        packedCount: packed,
        completionPct,
        displayName: p.style_name 
          ? (p.po_name ? `${p.style_name} - ${p.po_name} - ${p.po_number}` : `${p.style_name} - ${p.po_number}`)
          : (p.po_name ? `${p.po_name} - ${p.po_number}` : p.po_number)
      };
    });

    return res.json(formatted);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/orders/:id/quantity - Edit Configured Quantity with Safety Validation
router.patch('/admin/orders/:id/quantity', authenticateToken, requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const poParam = req.params.id;
    const { newQuantity } = req.body;
    const qty = Number(newQuantity);

    if (!qty || isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'INVALID_QUANTITY', message: 'Configured quantity must be a positive number' });
    }

    const po = await db.prepare(`SELECT * FROM production_orders WHERE id = ? OR po_number = ?`).get(poParam, poParam) as any;
    if (!po) {
      return res.status(404).json({ error: 'PO_NOT_FOUND', message: 'Production Order not found' });
    }

    // Safety check: Verify new quantity >= already processed / packed count
    const packedRow = await db.prepare(`
      SELECT COUNT(DISTINCT bi.item_id) as cnt FROM box_items bi
      JOIN boxes b ON b.id = bi.box_id
      LEFT JOIN item_units iu ON iu.id = bi.item_id
      WHERE (b.production_order_id = ? OR iu.production_order_id = ? OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
        AND bi.active = 1
    `).get(po.id, po.id, po.id) as any;
    const packedCount = Number(packedRow?.cnt || 0);

    const qcRow = await db.prepare(`
      SELECT COUNT(DISTINCT iu.id) as cnt FROM qc_results qr
      JOIN item_units iu ON iu.id = qr.item_id
      WHERE (iu.production_order_id = ? OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
        AND qr.qc_result = 'PASS' AND qr.test_result = 'PASS'
    `).get(po.id, po.id) as any;
    const qcPassedCount = Number(qcRow?.cnt || 0);

    const maxProcessed = Math.max(packedCount, qcPassedCount);

    if (qty < maxProcessed) {
      return res.status(400).json({
        error: 'QUANTITY_SAFETY_VIOLATION',
        message: `Cannot reduce quantity to ${qty}. ${maxProcessed} items have already been processed/packed for this Production Order.`
      });
    }

    // Fetch existing configs
    const configs = await db.prepare(`SELECT * FROM production_order_configs WHERE production_order_id = ?`).all(po.id) as any[];

    if (configs.length > 0) {
      const oldTotal = configs.reduce((sum: number, c: any) => sum + Number(c.quantity || 0), 0);
      const ratio = oldTotal > 0 ? qty / oldTotal : 1;

      for (const cfg of configs) {
        const updatedCfgQty = Math.max(1, Math.round(cfg.quantity * ratio));
        await db.prepare(`UPDATE production_order_configs SET quantity = ?, updated_at = NOW(3) WHERE id = ?`).run(updatedCfgQty, cfg.id);
      }
    }

    await db.prepare(`UPDATE production_orders SET updated_at = NOW(3) WHERE id = ?`).run(po.id);

    await auditLog(req.user!.id, 'UPDATE_PO_QUANTITY', 'production_orders', po.id, {
      poNumber: po.po_number,
      oldQuantity: po.total_quantity || maxProcessed,
      newQuantity: qty
    });

    return res.json({
      message: `Updated configured quantity to ${qty} for PO ${po.po_number}`,
      poId: po.id,
      newQuantity: qty
    });
  } catch (err) {
    next(err);
  }
});

// ── BOX OVERVIEW ENDPOINT ──────────────────────────────────────────
// GET /api/boxes - Query system boxes with capacity, fill count, active product QRs
router.get('/boxes', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const { poId, styleName, search, status } = req.query as { poId?: string; styleName?: string; search?: string; status?: string };

    let whereClauses: string[] = ['1=1'];
    let params: any[] = [];

    if (poId) {
      whereClauses.push(`(b.production_order_id = ? OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))`);
      params.push(poId, poId);
    }
    if (styleName) {
      whereClauses.push(`(UPPER(TRIM(s.name)) = ? OR UPPER(TRIM(s.code)) = ?)`);
      const sUpper = styleName.trim().toUpperCase();
      params.push(sUpper, sUpper);
    }
    if (search) {
      const q = `%${search.trim().toUpperCase()}%`;
      whereClauses.push(`(UPPER(b.box_code) LIKE ? OR UPPER(b.box_number) LIKE ? OR UPPER(po.po_number) LIKE ?)`);
      params.push(q, q, q);
    }
    if (status) {
      whereClauses.push(`UPPER(TRIM(b.status)) = ?`);
      params.push(status.trim().toUpperCase());
    }

    const boxes = await db.query(`
      SELECT 
        b.id, b.box_code, b.box_number, b.capacity, b.status, b.created_at, b.production_order_id,
        po.po_number, po.po_name, s.name as style_name,
        (SELECT COUNT(bi.id) FROM box_items bi WHERE bi.box_id = b.id AND bi.active = 1) as active_count
      FROM boxes b
      LEFT JOIN production_orders po ON po.id = b.production_order_id
      LEFT JOIN styles s ON s.id = po.style_id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY b.created_at DESC
      LIMIT 100
    `, params);

    const formattedBoxes = await Promise.all(boxes.map(async (b: any) => {
      const activeItems = await db.prepare(`
        SELECT u.id, u.qr_code, u.size, bi.packed_at, usr.full_name as packed_by_name
        FROM box_items bi
        JOIN item_units u ON u.id = bi.item_id
        LEFT JOIN users usr ON usr.id = bi.packed_by
        WHERE bi.box_id = ? AND bi.active = 1
        ORDER BY bi.packed_at ASC
      `).all(b.id) as any[];

      const activeCount = Number(b.active_count || activeItems.length || 0);
      const capacity = Number(b.capacity || 12);
      const remainingCapacity = Math.max(0, capacity - activeCount);

      const aqlRow = await db.prepare(`SELECT result FROM aql_inspections WHERE box_id = ? ORDER BY completed_at DESC LIMIT 1`).get(b.id) as any;
      const transferRow = await db.prepare(`SELECT * FROM box_transfers WHERE source_box_id = ? OR destination_box_id = ? ORDER BY transferred_at DESC LIMIT 1`).get(b.id, b.id) as any;

      return {
        id: b.id,
        boxCode: b.box_code || b.box_number,
        boxNumber: b.box_number || b.box_code,
        poId: b.production_order_id,
        poNumber: b.po_number || b.production_order_id,
        poName: b.po_name || null,
        styleName: b.style_name || 'Standard Style',
        capacity,
        activeFilledCount: activeCount,
        remainingCapacity,
        status: b.status || (activeCount >= capacity ? 'COMPLETED' : 'OPEN'),
        aqlStatus: aqlRow?.result || 'PENDING',
        transferStatus: transferRow ? `Transferred (${transferRow.item_count} items)` : 'NONE',
        items: activeItems
      };
    }));

    return res.json(formattedBoxes);
  } catch (err) {
    next(err);
  }
});

export default router;
