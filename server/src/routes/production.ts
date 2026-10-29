import { Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { authenticateToken, requireRole, AuthRequest, AuthUser } from '../middleware/auth.js';
import { auditLog } from '../middleware/errorHandler.js';

const router = ExpressRouter();

// ── Customer CRUD Endpoints ──────────────────────────────────────────
const createCustomerSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  contact_person: z.string().optional(),
  contactPerson: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional()
});

router.get('/customers', authenticateToken, async (req, res, next) => {
  try {
    const customers = await db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM styles s WHERE s.customer_id = c.id OR LOWER(TRIM(s.customer)) = LOWER(TRIM(c.name))) as styles_count,
        (SELECT COUNT(*) FROM production_orders po WHERE po.customer_id = c.id OR LOWER(TRIM(po.customer)) = LOWER(TRIM(c.name))) as pos_count
      FROM customers c
      ORDER BY c.name ASC
    `).all();
    return res.json(customers);
  } catch (err) {
    next(err);
  }
});

router.get('/admin/customers', authenticateToken, requireRole(['ADMIN', 'SUPERVISOR']), async (req, res, next) => {
  try {
    const customers = await db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM styles s WHERE s.customer_id = c.id OR LOWER(TRIM(s.customer)) = LOWER(TRIM(c.name))) as styles_count,
        (SELECT COUNT(*) FROM production_orders po WHERE po.customer_id = c.id OR LOWER(TRIM(po.customer)) = LOWER(TRIM(c.name))) as pos_count
      FROM customers c
      ORDER BY c.name ASC
    `).all();
    return res.json(customers);
  } catch (err) {
    next(err);
  }
});

router.post('/customers', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const b = createCustomerSchema.parse(req.body);
    const code = b.code.trim().toUpperCase();
    const name = b.name.trim();
    const existing = await db.prepare(`SELECT * FROM customers WHERE code = ? OR LOWER(name) = LOWER(?)`).get(code, name) as any;
    if (existing) {
      return res.status(409).json({ error: 'CUSTOMER_EXISTS', message: `Customer with name "${name}" or code "${code}" already exists`, customer: existing });
    }

    const id = `cust-${Date.now()}`;
    await db.prepare(`
      INSERT INTO customers (id, name, code, contact_person, email, phone, address, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
    `).run(id, name, code, b.contact_person || b.contactPerson || null, b.email || null, b.phone || null, b.address || null, b.notes || null);

    await auditLog(req.user!.id, 'CREATE_CUSTOMER', 'customers', id, { code, name });
    const created = await db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id);
    return res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.put('/customers/:id', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const existing = await db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
    }
    await db.prepare(`
      UPDATE customers SET
        name = COALESCE(?, name),
        code = COALESCE(?, code),
        contact_person = COALESCE(?, contact_person),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        address = COALESCE(?, address),
        notes = COALESCE(?, notes),
        updated_at = NOW(3)
      WHERE id = ?
    `).run(b.name || null, b.code || null, b.contact_person || b.contactPerson || null, b.email || null, b.phone || null, b.address || null, b.notes || null, id);

    const updated = await db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id);
    return res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/customers/:id', authenticateToken, requireRole(['ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    await db.prepare(`DELETE FROM customers WHERE id = ?`).run(id);
    return res.json({ message: 'Customer deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// ── Styles Endpoints ──────────────────────────────────────────────────
// GET /api/production/styles (or /api/styles)
router.get('/styles', authenticateToken, async (req, res, next) => {
  try {
    const customerId = (req.query.customerId || req.query.customer_id) as string;
    let sql = `
      SELECT s.*,
        COALESCE(c.name, s.customer) as customer_name,
        c.code as customer_code,
        (SELECT COUNT(*) FROM production_orders po WHERE po.style_id = s.id) as pos_count
      FROM styles s
      LEFT JOIN customers c ON c.id = s.customer_id OR LOWER(TRIM(c.name)) = LOWER(TRIM(s.customer))
    `;
    const params: any[] = [];
    if (customerId) {
      sql += ` WHERE s.customer_id = ? OR c.id = ?`;
      params.push(customerId, customerId);
    }
    sql += ` ORDER BY s.name ASC`;
    const styles = await db.prepare(sql).all(...params);
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
  customer_id: z.string().optional(),
  customerId: z.string().optional(),
  season: z.string().optional(),
  notes: z.string().optional()
});

// POST /api/production/styles (SUPERVISOR / ADMIN)
router.post('/styles', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const { code, name, customer, customer_id, customerId, season, notes } = createStyleSchema.parse(req.body);
    const existing = await db.prepare(`SELECT * FROM styles WHERE code = ?`).get(code) as any;
    if (existing) {
      return res.status(409).json({ error: 'STYLE_EXISTS', message: `Style with code ${code} already exists`, style: existing });
    }

    let resolvedCustomerId = customer_id || customerId || null;
    let resolvedCustomerName = customer || null;

    if (resolvedCustomerId && !resolvedCustomerName) {
      const custRow = await db.prepare(`SELECT name FROM customers WHERE id = ?`).get(resolvedCustomerId) as any;
      if (custRow) resolvedCustomerName = custRow.name;
    } else if (resolvedCustomerName && !resolvedCustomerId) {
      const custRow = await db.prepare(`SELECT id FROM customers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))`).get(resolvedCustomerName) as any;
      if (custRow) resolvedCustomerId = custRow.id;
    }

    const id = `style-${Date.now()}`;
    await db.prepare(`
      INSERT INTO styles (id, code, name, customer, customer_id, season, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
    `).run(id, code, name, resolvedCustomerName, resolvedCustomerId, season || null, notes || null);

    await auditLog(req.user!.id, 'CREATE_STYLE', 'styles', id, { code, name });

    const created = await db.prepare(`
      SELECT s.*, COALESCE(c.name, s.customer) as customer_name, c.code as customer_code
      FROM styles s
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.id = ?
    `).get(id);
    return res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// ── Sales Orders Endpoints ───────────────────────────────────────────
router.get('/sales-orders', authenticateToken, async (req, res, next) => {
  try {
    const poId = req.query.poId as string;
    let sql = `
      SELECT so.*,
        po.po_number, po.po_name, po.customer, po.customer_id, po.style_id,
        s.name as style_name, s.code as style_code_from_style,
        pl.name as line_name, sh.name as shift_name,
        c.name as customer_name, c.code as customer_code
      FROM sales_orders so
      LEFT JOIN production_orders po ON (po.id = so.production_order_id OR po.po_number = so.production_order_id)
      LEFT JOIN styles s ON s.id = po.style_id
      LEFT JOIN customers c ON c.id = po.customer_id OR LOWER(TRIM(c.name)) = LOWER(TRIM(po.customer))
      LEFT JOIN production_lines pl ON pl.id = so.line_id
      LEFT JOIN shifts sh ON sh.id = so.shift_id
    `;
    const params: any[] = [];
    if (poId) {
      sql += ` WHERE (so.production_order_id = ? OR po.po_number = ?)`;
      params.push(poId, poId);
    }
    sql += ` ORDER BY so.created_at DESC`;
    const soList = await db.prepare(sql).all(...params);
    return res.json(soList);
  } catch (err) {
    next(err);
  }
});

router.get('/admin/sales-orders', authenticateToken, requireRole(['ADMIN', 'SUPERVISOR']), async (req, res, next) => {
  try {
    const sql = `
      SELECT so.*,
        po.po_number, po.po_name, po.customer, po.customer_id, po.style_id,
        s.name as style_name, s.code as style_code_from_style,
        pl.name as line_name, sh.name as shift_name,
        c.name as customer_name, c.code as customer_code
      FROM sales_orders so
      LEFT JOIN production_orders po ON (po.id = so.production_order_id OR po.po_number = so.production_order_id)
      LEFT JOIN styles s ON s.id = po.style_id
      LEFT JOIN customers c ON c.id = po.customer_id OR LOWER(TRIM(c.name)) = LOWER(TRIM(po.customer))
      LEFT JOIN production_lines pl ON pl.id = so.line_id
      LEFT JOIN shifts sh ON sh.id = so.shift_id
      ORDER BY so.created_at DESC
    `;
    const soList = await db.prepare(sql).all();
    return res.json(soList);
  } catch (err) {
    next(err);
  }
});

const createSoSchema = z.object({
  production_order_id: z.string().optional(),
  productionOrderId: z.string().optional(),
  so_number: z.string().min(1),
  map_so: z.string().optional(),
  product: z.string().optional(),
  style_code: z.string().optional(),
  colour: z.string().optional(),
  size_range: z.string().optional(),
  order_quantity: z.number().min(1),
  line_id: z.string().optional(),
  shift_id: z.string().optional(),
  box_capacity: z.number().optional()
});

router.post('/sales-orders', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const b = createSoSchema.parse(req.body);
    const poId = b.production_order_id || b.productionOrderId;
    if (!poId) {
      return res.status(400).json({ error: 'PO_REQUIRED', message: 'Production Order ID is required for Sales Order' });
    }
    const po = await db.prepare(`SELECT * FROM production_orders WHERE id = ? OR po_number = ?`).get(poId, poId) as any;
    if (!po) {
      return res.status(404).json({ error: 'PO_NOT_FOUND', message: 'Production Order not found' });
    }

    const existing = await db.prepare(`SELECT * FROM sales_orders WHERE UPPER(TRIM(so_number)) = UPPER(TRIM(?))`).get(b.so_number) as any;
    if (existing) {
      await db.prepare(`
        UPDATE sales_orders SET
          production_order_id = ?,
          map_so = COALESCE(?, map_so),
          product = COALESCE(?, product),
          style_code = COALESCE(?, style_code),
          colour = COALESCE(?, colour),
          size_range = COALESCE(?, size_range),
          order_quantity = COALESCE(?, order_quantity),
          line_id = COALESCE(?, line_id),
          shift_id = COALESCE(?, shift_id),
          box_capacity = COALESCE(?, box_capacity),
          updated_at = NOW(3)
        WHERE id = ?
      `).run(
        po.id,
        b.map_so || b.so_number,
        b.product || po.style_code || 'Standard Garment',
        b.style_code || po.style_code || 'STD',
        b.colour || 'Default',
        b.size_range || 'ALL',
        b.order_quantity,
        b.line_id || null,
        b.shift_id || po.shift_id || null,
        b.box_capacity || 12,
        existing.id
      );
      const updated = await db.prepare(`SELECT * FROM sales_orders WHERE id = ?`).get(existing.id);
      return res.status(200).json(updated);
    }

    const id = `so-${Date.now()}`;
    await db.prepare(`
      INSERT INTO sales_orders (
        id, production_order_id, so_number, map_so, product, style_code, colour,
        size_range, order_quantity, line_id, shift_id, box_capacity, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CURRENT', NOW(3), NOW(3))
    `).run(
      id,
      po.id,
      b.so_number,
      b.map_so || b.so_number,
      b.product || po.style_code || 'Standard Garment',
      b.style_code || po.style_code || 'STD',
      b.colour || 'Default',
      b.size_range || 'ALL',
      b.order_quantity,
      b.line_id || null,
      b.shift_id || po.shift_id || null,
      b.box_capacity || 12
    );

    await auditLog(req.user!.id, 'CREATE_SALES_ORDER', 'sales_orders', id, { so_number: b.so_number, poId: po.id });
    const created = await db.prepare(`SELECT * FROM sales_orders WHERE id = ?`).get(id);
    return res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.put('/sales-orders/:id', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const { so_number, map_so, colour, order_quantity, box_capacity, remarks, notes } = req.body;
    const finalRemarks = remarks !== undefined ? remarks : (notes !== undefined ? notes : null);
    await db.prepare(`
      UPDATE sales_orders
      SET so_number = COALESCE(?, so_number),
          map_so = COALESCE(?, map_so),
          colour = COALESCE(?, colour),
          order_quantity = COALESCE(?, order_quantity),
          box_capacity = COALESCE(?, box_capacity),
          remarks = COALESCE(?, remarks),
          updated_at = NOW(3)
      WHERE id = ?
    `).run(so_number || null, map_so || null, colour || null, order_quantity || null, box_capacity || null, finalRemarks, id);
    const updated = await db.prepare(`SELECT * FROM sales_orders WHERE id = ?`).get(id);
    return res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/sales-orders/:id', authenticateToken, requireRole(['ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    await db.prepare(`DELETE FROM sales_orders WHERE id = ?`).run(id);
    return res.json({ message: 'Sales Order deleted successfully' });
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

  // Legacy SO rows if present
  const soRows = await db.prepare(`
    SELECT so.*, pl.name as line_name, s.name as shift_name
    FROM sales_orders so
    LEFT JOIN production_lines pl ON pl.id = so.line_id
    LEFT JOIN shifts s ON s.id = so.shift_id
    WHERE so.production_order_id = ?
  `).all(po.id) as any[];

  // Load PO Product Configurations
  const configRows = await db.prepare(`
    SELECT * FROM production_order_configs WHERE production_order_id = ? ORDER BY config_code ASC
  `).all(po.id) as any[];

  let productConfigurations = configRows.map(c => ({
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

  if (productConfigurations.length === 0 && soRows.length > 0) {
    productConfigurations = soRows.map((so, idx) => ({
      id: so.id,
      productionOrderId: po.id,
      configCode: so.so_number || `CFG-${String(idx + 1).padStart(3, '0')}`,
      productType: so.product || undefined,
      size: so.size_range || undefined,
      productQrPrefix: so.product_qr_prefix || '',
      productSerialStart: so.product_serial_start != null ? Number(so.product_serial_start) : 1,
      productSerialEnd: so.product_serial_end != null ? Number(so.product_serial_end) : Number(so.order_quantity || 0),
      quantity: Number(so.order_quantity || 0)
    }));
  }

  // Load PO Box Configurations
  const boxConfigRows = await db.prepare(`
    SELECT * FROM production_order_box_configs WHERE production_order_id = ? ORDER BY prefix ASC, size ASC
  `).all(po.id) as any[];

  let boxConfigurations = boxConfigRows.map(c => ({
    id: c.id,
    productionOrderId: c.production_order_id,
    prefix: c.prefix,
    size: c.size,
    capacity: Number(c.capacity)
  }));

  if (boxConfigurations.length === 0 && soRows.length > 0) {
    const firstSoWithCap = soRows.find(s => s.box_capacity && Number(s.box_capacity) > 0);
    if (firstSoWithCap) {
      boxConfigurations = [{
        id: `box-fallback-${po.id}`,
        productionOrderId: po.id,
        prefix: 'BX',
        size: 'STANDARD',
        capacity: Number(firstSoWithCap.box_capacity)
      }];
    }
  }

  const totalQuantity = productConfigurations.length > 0
    ? productConfigurations.reduce((sum, c) => sum + c.quantity, 0)
    : 0;

  // Parse dynamic QC and Pre-QC tests with robust backwards compatibility
  let parsedQcTests: string[] | undefined;
  if (po.qc_tests) {
    try {
      const parsed = typeof po.qc_tests === 'string' ? JSON.parse(po.qc_tests) : po.qc_tests;
      if (Array.isArray(parsed) && parsed.length > 0) parsedQcTests = parsed;
    } catch (_) {}
  }
  if (!parsedQcTests || parsedQcTests.length === 0) {
    if (po.qc_test_mode === 'QC_ONLY') parsedQcTests = ['Endline QC'];
    else if (po.qc_test_mode === 'TEST_ONLY') parsedQcTests = ['Functional Test'];
    else parsedQcTests = ['Endline QC', 'Functional Test'];
  }

  let parsedPreQcTests: string[] | undefined;
  if (po.pre_qc_tests) {
    try {
      const parsed = typeof po.pre_qc_tests === 'string' ? JSON.parse(po.pre_qc_tests) : po.pre_qc_tests;
      if (Array.isArray(parsed) && parsed.length > 0) parsedPreQcTests = parsed;
    } catch (_) {}
  }
  if (!parsedPreQcTests || parsedPreQcTests.length === 0) {
    parsedPreQcTests = ['Pre-QC Inspection'];
  }

  const preQcStationCount = Math.max(1, Number(po.pre_qc_station_count) || 1);

  // QC Test Mode
  let qcTestMode: string = 'QC & Test';
  if (parsedQcTests.length === 1 && (parsedQcTests[0] === 'Endline QC' || parsedQcTests[0] === 'QC')) qcTestMode = 'QC Only';
  else if (parsedQcTests.length === 1 && (parsedQcTests[0] === 'Functional Test' || parsedQcTests[0] === 'Test')) qcTestMode = 'Functional Test Only';
  else if (po.qc_test_mode === 'QC_ONLY') qcTestMode = 'QC Only';
  else if (po.qc_test_mode === 'TEST_ONLY') qcTestMode = 'Functional Test Only';

  const qcStationCount = Math.max(1, Number(po.qc_station_count) || 1);

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
    operatorId: m.operator_id,
    operatorName: m.operator_name,
    workerId: m.operator_id,
    workerName: m.operator_name,
    shiftId: m.shift_id,
    shiftName: m.shift_name,
    shiftCode: m.shift_name ? m.shift_name.replace(/[^A-Za-z0-9]/g, '').slice(-1).toUpperCase() : 'A',
    operation: m.operation || 'ALL',
    date: new Date().toISOString().split('T')[0],
    enabledOperations: [m.operation || 'ALL']
  }));

  const mappedAllocations = poAllocations.map(m => ({
    id: m.id,
    productionOrderId: po.id,
    salesOrderId: m.sales_order_id || undefined,
    operatorId: m.operator_id,
    operatorName: m.operator_name,
    workerId: m.operator_id,
    workerName: m.operator_name,
    shiftId: m.shift_id,
    shiftName: m.shift_name,
    shiftCode: m.shift_name ? m.shift_name.replace(/[^A-Za-z0-9]/g, '').slice(-1).toUpperCase() : 'A',
    operation: m.operation || 'ALL'
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
      AND (qf.failure_type IS NULL OR qf.failure_type != 'PERMANENTLY_REMOVED')
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

  // Legacy SO rows mapping

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
    plant: po.plant || undefined,
    lineNumber: po.line_number || undefined,
    line_number: po.line_number || undefined,
    shiftId: resolvedShiftId,
    shiftCode: resolvedShiftCode,
    shiftName: resolvedShiftName,
    remarks: po.remarks || '',
    status: po.status === 'CURRENT' ? 'Current' : po.status === 'COMPLETED' ? 'Completed' : 'Draft',
    orderPathway: po.order_pathway || (po.po_number?.startsWith('STYLE-') ? 'STYLE_DIRECT' : 'PO_DIRECT'),
    order_pathway: po.order_pathway || (po.po_number?.startsWith('STYLE-') ? 'STYLE_DIRECT' : 'PO_DIRECT'),
    selectedOperations,
    qcTestMode,
    qcStationCount,
    qc_station_count: qcStationCount,
    stationCount: qcStationCount,
    qcTests: parsedQcTests,
    qc_tests: parsedQcTests,
    preQcTests: parsedPreQcTests,
    pre_qc_tests: parsedPreQcTests,
    preQcStationCount,
    pre_qc_station_count: preQcStationCount,
    productConfigurations,
    boxConfigurations,
    allowNoProductPrefix: Boolean(po.allow_no_product_prefix),
    allowNoBoxPrefix: Boolean(po.allow_no_box_prefix),
    totalQuantity: calcTotalQty,
    allocations: mappedAllocations,
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
    const role = req.user?.role;
    const userPlant = req.user?.plant;
    const queryPlant = (req.query.plant || '').toString().trim();

    let poRows: any[];
    if (role === 'SUPERVISOR' && userPlant && userPlant.trim() !== '') {
      poRows = await db.prepare(`
        SELECT * FROM production_orders 
        WHERE LOWER(TRIM(plant)) = LOWER(TRIM(?))
        ORDER BY created_at DESC
      `).all(userPlant.trim());
    } else if (queryPlant) {
      poRows = await db.prepare(`
        SELECT * FROM production_orders 
        WHERE LOWER(TRIM(plant)) = LOWER(TRIM(?))
        ORDER BY created_at DESC
      `).all(queryPlant);
    } else {
      poRows = await db.prepare(`SELECT * FROM production_orders ORDER BY created_at DESC`).all();
    }

    const formattedOrders = await Promise.all(poRows.map(po => formatProductionOrder(po, req.user)));

    const orders = formattedOrders.filter(po => {
      if (!po) return false;
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

const createPoBoxConfigSchema = z.object({
  prefix: z.string().min(1),
  size: z.string().min(1),
  capacity: z.number().int().positive()
});

const createPoSchema = z.object({
  id: z.string().min(1),
  poName: z.string().optional(),
  po_name: z.string().optional(),
  mapPo: z.string().min(1),
  customer: z.string().optional(),
  customerId: z.string().optional(),
  customer_id: z.string().optional(),
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
  qcStationCount: z.union([z.number(), z.string()]).optional(),
  qc_station_count: z.union([z.number(), z.string()]).optional(),
  stationCount: z.union([z.number(), z.string()]).optional(),
  qcTests: z.union([z.array(z.string()), z.string()]).optional(),
  qc_tests: z.union([z.array(z.string()), z.string()]).optional(),
  preQcTests: z.union([z.array(z.string()), z.string()]).optional(),
  pre_qc_tests: z.union([z.array(z.string()), z.string()]).optional(),
  preQcStationCount: z.union([z.number(), z.string()]).optional(),
  pre_qc_station_count: z.union([z.number(), z.string()]).optional(),
  shiftId: z.string().optional(),
  shift_id: z.string().optional(),
  plant: z.string().optional(),
  lineNumber: z.string().optional(),
  line_number: z.string().optional(),
  allowNoProductPrefix: z.boolean().optional(),
  allow_no_product_prefix: z.union([z.boolean(), z.number()]).optional(),
  allowNoBoxPrefix: z.boolean().optional(),
  allow_no_box_prefix: z.union([z.boolean(), z.number()]).optional(),
  productConfigurations: z.array(createPoProductConfigSchema).optional(),
  boxConfigurations: z.array(createPoBoxConfigSchema).optional(),
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
      if (opName === 'Pre QC' || opName === 'PRE_QC') opCode = 'PRE_QC';
      else if (opName === 'QC Test' || opName === 'QC_TEST' || opName === 'QC') opCode = 'QC_TEST';
      else if (opName === 'Packing' || opName === 'PACKING') opCode = 'PACKING';
      else if (opName === 'AQL Checker' || opName === 'AQL' || opName === 'Normal AQL') opCode = 'AQL';
      else if (opName === 'FINAL AQL' || opName === 'Final AQL' || opName === 'FINAL_AQL') opCode = 'FINAL_AQL';
      else if (opName === 'Box Transfer' || opName === 'BOX_TRANSFER') opCode = 'BOX_TRANSFER';

      activeOpAssignments.push({ operatorId: opUser.id, shiftId, operation: opCode });
    }
  }

  // Step 1: Deactivate all active assignments for this PO so unselected shifts are completely cleared
  await tx.prepare(`
    UPDATE operator_work_assignments 
    SET active = 0, updated_at = NOW(3)
    WHERE production_order_id = ? AND active = 1
  `).run(poDbId);

  // Step 2: Reactivate or insert the currently active assignments
  for (const assign of activeOpAssignments) {
    const existing = await tx.prepare(`
      SELECT id FROM operator_work_assignments 
      WHERE production_order_id = ? AND operator_id = ? AND operation = ? AND shift_id = ?
    `).get(poDbId, assign.operatorId, assign.operation, assign.shiftId) as any;

    if (existing) {
      await tx.prepare(`
        UPDATE operator_work_assignments 
        SET active = 1, updated_at = NOW(3)
        WHERE id = ?
      `).run(existing.id);
    } else {
      const owaId = `owa-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
      await tx.prepare(`
        INSERT INTO operator_work_assignments (id, production_order_id, shift_id, operator_id, operation, assigned_date, source, assigned_by, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, CURDATE(), 'SUPERVISOR', ?, 1, NOW(3), NOW(3))
        ON DUPLICATE KEY UPDATE active = 1, updated_at = NOW(3)
      `).run(owaId, poDbId, assign.shiftId, assign.operatorId, assign.operation, assignedByUserId);
    }
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

    // QC Tests array
    let dbQcTests: string[] = [];
    const rawQcTests = body.qcTests || (req.body as any)?.qc_tests;
    if (Array.isArray(rawQcTests)) {
      dbQcTests = rawQcTests.map(t => String(t).trim()).filter(Boolean);
    }
    if (dbQcTests.length === 0) {
      if (dbQcTestMode === 'QC_ONLY') dbQcTests = ['Endline QC'];
      else if (dbQcTestMode === 'TEST_ONLY') dbQcTests = ['Functional Test'];
      else dbQcTests = ['Endline QC', 'Functional Test'];
    }

    // Pre-QC Tests array
    let dbPreQcTests: string[] = [];
    const rawPreQcTests = body.preQcTests || (req.body as any)?.pre_qc_tests;
    if (Array.isArray(rawPreQcTests)) {
      dbPreQcTests = rawPreQcTests.map(t => String(t).trim()).filter(Boolean);
    }
    if (dbPreQcTests.length === 0 && (body.selectedOperations.includes('Pre QC') || body.selectedOperations.includes('PRE_QC'))) {
      dbPreQcTests = ['Pre-QC Inspection'];
    }

    const rawStationCount = (req.body as any)?.qcStationCount ?? (req.body as any)?.qc_station_count ?? (req.body as any)?.stationCount ?? body.qcStationCount ?? body.qc_station_count ?? body.stationCount;
    const dbQcStationCount = Math.max(1, Math.min(10, Number(rawStationCount) || 1));

    const rawPreQcStationCount = (req.body as any)?.preQcStationCount ?? (req.body as any)?.pre_qc_station_count ?? body.preQcStationCount ?? body.pre_qc_station_count;
    const dbPreQcStationCount = Math.max(1, Math.min(10, Number(rawPreQcStationCount) || 1));

    const qcTestsJson = JSON.stringify(dbQcTests);
    const preQcTestsJson = dbPreQcTests.length > 0 ? JSON.stringify(dbPreQcTests) : null;

    const rawShiftId = body.shiftId || body.shift_id;
    let poShiftId: string | null = null;
    if (rawShiftId) {
      const shiftRow = await db.prepare(`SELECT id FROM shifts WHERE id = ? OR code = ? OR name = ?`).get(rawShiftId, rawShiftId, rawShiftId) as any;
      poShiftId = shiftRow ? shiftRow.id : rawShiftId;
    }

    const poNameVal = (body.poName || body.po_name || '').trim() || null;
    const poPlantVal = (body.plant || (req.body as any)?.plant || '').trim() || (req.user?.role === 'SUPERVISOR' ? req.user.plant || null : null);
    const poLineNumber = ((body as any).lineNumber || (body as any).line_number || '').trim() || null;
    const allowNoProductPrefix = (body.allowNoProductPrefix || (body as any).allow_no_product_prefix) ? 1 : 0;
    const allowNoBoxPrefix = (body.allowNoBoxPrefix || (body as any).allow_no_box_prefix) ? 1 : 0;

    const poCustomerIdVal = (body.customerId || body.customer_id || (req.body as any)?.customerId || (req.body as any)?.customer_id || '').trim() || null;
    const orderPathwayVal = (req.body as any)?.orderPathway || (req.body as any)?.order_pathway || (body.id.startsWith('STYLE-') ? 'STYLE_DIRECT' : 'PO_DIRECT');

    // Dynamically check and ensure order_pathway column exists in production_orders
    let hasOrderPathway = false;
    try {
      const colCheck: any = await db.prepare(
        `SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_NAME = 'production_orders' AND COLUMN_NAME = 'order_pathway' AND (TABLE_SCHEMA = DATABASE() OR TABLE_SCHEMA = ?)`
      ).get(process.env.DB_NAME || 'uniflow_ops');
      hasOrderPathway = Number(colCheck?.cnt || 0) > 0;
      if (!hasOrderPathway) {
        try {
          await db.exec(`ALTER TABLE production_orders ADD COLUMN order_pathway VARCHAR(50) NULL DEFAULT 'PO_DIRECT' AFTER status;`);
          hasOrderPathway = true;
        } catch {
          hasOrderPathway = false;
        }
      }
    } catch {
      hasOrderPathway = false;
    }

    // Check if a production order with this po_number or id already exists
    const existingPo = await db.prepare(`SELECT * FROM production_orders WHERE po_number = ? OR id = ?`).get(body.id, body.id) as any;
    const targetPoDbId = existingPo ? existingPo.id : poDbId;

    await db.transaction(async (tx) => {
      if (existingPo) {
        // Safe UPDATE existing PO to avoid duplicate entry conflict
        if (hasOrderPathway) {
          await tx.prepare(`
            UPDATE production_orders SET
              po_name = COALESCE(?, po_name),
              map_po = COALESCE(?, map_po),
              customer = COALESCE(?, customer),
              customer_id = COALESCE(?, customer_id),
              style_id = COALESCE(?, style_id),
              start_date = COALESCE(?, start_date),
              due_date = COALESCE(?, due_date),
              supervisor_id = COALESCE(?, supervisor_id),
              plant = COALESCE(?, plant),
              line_number = COALESCE(?, line_number),
              qc_test_mode = COALESCE(?, qc_test_mode),
              qc_station_count = COALESCE(?, qc_station_count),
              qc_tests = COALESCE(?, qc_tests),
              pre_qc_tests = COALESCE(?, pre_qc_tests),
              pre_qc_station_count = COALESCE(?, pre_qc_station_count),
              shift_id = COALESCE(?, shift_id),
              allow_no_product_prefix = ?,
              allow_no_box_prefix = ?,
              remarks = COALESCE(?, remarks),
              status = ?,
              order_pathway = ?,
              updated_at = NOW(3)
            WHERE id = ?
          `).run(poNameVal, body.mapPo, body.customer || 'Factory Customer', poCustomerIdVal, styleId, body.startDate, body.dueDate, req.user!.id, poPlantVal, poLineNumber, dbQcTestMode, dbQcStationCount, qcTestsJson, preQcTestsJson, dbPreQcStationCount, poShiftId, allowNoProductPrefix, allowNoBoxPrefix, body.remarks || '', statusUpper, orderPathwayVal, targetPoDbId);
        } else {
          await tx.prepare(`
            UPDATE production_orders SET
              po_name = COALESCE(?, po_name),
              map_po = COALESCE(?, map_po),
              customer = COALESCE(?, customer),
              customer_id = COALESCE(?, customer_id),
              style_id = COALESCE(?, style_id),
              start_date = COALESCE(?, start_date),
              due_date = COALESCE(?, due_date),
              supervisor_id = COALESCE(?, supervisor_id),
              plant = COALESCE(?, plant),
              line_number = COALESCE(?, line_number),
              qc_test_mode = COALESCE(?, qc_test_mode),
              qc_station_count = COALESCE(?, qc_station_count),
              qc_tests = COALESCE(?, qc_tests),
              pre_qc_tests = COALESCE(?, pre_qc_tests),
              pre_qc_station_count = COALESCE(?, pre_qc_station_count),
              shift_id = COALESCE(?, shift_id),
              allow_no_product_prefix = ?,
              allow_no_box_prefix = ?,
              remarks = COALESCE(?, remarks),
              status = ?,
              updated_at = NOW(3)
            WHERE id = ?
          `).run(poNameVal, body.mapPo, body.customer || 'Factory Customer', poCustomerIdVal, styleId, body.startDate, body.dueDate, req.user!.id, poPlantVal, poLineNumber, dbQcTestMode, dbQcStationCount, qcTestsJson, preQcTestsJson, dbPreQcStationCount, poShiftId, allowNoProductPrefix, allowNoBoxPrefix, body.remarks || '', statusUpper, targetPoDbId);
        }
        await tx.prepare(`DELETE FROM production_order_operations WHERE production_order_id = ?`).run(targetPoDbId);
      } else {
        // Normal INSERT for new PO
        if (hasOrderPathway) {
          await tx.prepare(`
            INSERT INTO production_orders (id, po_number, po_name, map_po, customer, customer_id, style_id, start_date, due_date, supervisor_id, plant, line_number, qc_test_mode, qc_station_count, qc_tests, pre_qc_tests, pre_qc_station_count, shift_id, allow_no_product_prefix, allow_no_box_prefix, remarks, status, order_pathway, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
          `).run(targetPoDbId, body.id, poNameVal, body.mapPo, body.customer || 'Factory Customer', poCustomerIdVal, styleId, body.startDate, body.dueDate, req.user!.id, poPlantVal, poLineNumber, dbQcTestMode, dbQcStationCount, qcTestsJson, preQcTestsJson, dbPreQcStationCount, poShiftId, allowNoProductPrefix, allowNoBoxPrefix, body.remarks || '', statusUpper, orderPathwayVal);
        } else {
          await tx.prepare(`
            INSERT INTO production_orders (id, po_number, po_name, map_po, customer, customer_id, style_id, start_date, due_date, supervisor_id, plant, line_number, qc_test_mode, qc_station_count, qc_tests, pre_qc_tests, pre_qc_station_count, shift_id, allow_no_product_prefix, allow_no_box_prefix, remarks, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
          `).run(targetPoDbId, body.id, poNameVal, body.mapPo, body.customer || 'Factory Customer', poCustomerIdVal, styleId, body.startDate, body.dueDate, req.user!.id, poPlantVal, poLineNumber, dbQcTestMode, dbQcStationCount, qcTestsJson, preQcTestsJson, dbPreQcStationCount, poShiftId, allowNoProductPrefix, allowNoBoxPrefix, body.remarks || '', statusUpper);
        }
      }

      for (const opStr of body.selectedOperations) {
        let code = opStr;
        if (opStr === 'Pre QC') code = 'PRE_QC';
        else if (opStr === 'QC Test') code = 'QC_TEST';
        else if (opStr === 'Packing') code = 'PACKING';
        else if (opStr === 'AQL Checker') code = 'AQL';
        else if (opStr === 'Box Transfer') code = 'BOX_TRANSFER';
        await tx.prepare(`INSERT INTO production_order_operations (production_order_id, operation) VALUES (?, ?)`).run(targetPoDbId, code);
      }

      if (body.productConfigurations && body.productConfigurations.length > 0) {
        if (existingPo) {
          await tx.prepare(`DELETE FROM production_order_configs WHERE production_order_id = ?`).run(targetPoDbId);
        }
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
          `).run(pocId, targetPoDbId, code, pType, sz, prefix, start, end, qty);
        }
      }

      if (body.boxConfigurations && body.boxConfigurations.length > 0) {
        for (const bCfg of body.boxConfigurations) {
          const pbcId = `pbc-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
          const prefix = (bCfg.prefix || 'BX').trim().toUpperCase();
          const size = (bCfg.size || '').trim().toUpperCase();
          const capacity = Number(bCfg.capacity) || 12;

          await tx.prepare(`
            INSERT INTO production_order_box_configs (id, production_order_id, prefix, size, capacity, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, NOW(3), NOW(3))
            ON DUPLICATE KEY UPDATE capacity = VALUES(capacity), updated_at = NOW(3)
          `).run(pbcId, targetPoDbId, prefix, size, capacity);
        }
      }

      // Sync PO shift allocations
      const assignmentsToSync = (body.allocations && Array.isArray(body.allocations) && body.allocations.length > 0)
        ? body.allocations
        : (body.shifts || []);
      await syncPoAllocations(tx, targetPoDbId, assignmentsToSync, req.user!.id, body.selectedOperations);
    });

    await auditLog(req.user!.id, existingPo ? 'UPDATE_PO' : 'CREATE_PO', 'production_orders', targetPoDbId, { poNumber: body.id, styleId });

    const updatedOrCreated = await db.prepare(`SELECT * FROM production_orders WHERE id = ?`).get(targetPoDbId);
    const formattedResult = await formatProductionOrder(updatedOrCreated);
    return res.status(existingPo ? 200 : 201).json(formattedResult);
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

    let targetOp = operation || 'ALL';
    if (targetOp === 'AQL Checker' || targetOp === 'Normal AQL' || targetOp === 'NORMAL_AQL') targetOp = 'AQL';
    else if (targetOp === 'FINAL AQL' || targetOp === 'Final AQL') targetOp = 'FINAL_AQL';
    else if (targetOp === 'QC Test' || targetOp === 'QC') targetOp = 'QC_TEST';
    else if (targetOp === 'Pre QC' || targetOp === 'PREQC') targetOp = 'PRE_QC';
    else if (targetOp === 'Packing' || targetOp === 'PACK') targetOp = 'PACKING';

    const existingAlloc = await db.prepare(`
      SELECT * FROM operator_work_assignments 
      WHERE production_order_id = ? AND operator_id = ? AND UPPER(TRIM(operation)) = UPPER(TRIM(?))
    `).get(po.id, opUser.id, targetOp) as any;

    let workAssignId = existingAlloc ? existingAlloc.id : `owa-${Date.now()}-${Math.random().toString().slice(2, 6)}`;

    if (existingAlloc) {
      await db.prepare(`
        UPDATE operator_work_assignments 
        SET shift_id = ?, active = 1, updated_at = NOW(3) 
        WHERE id = ?
      `).run(targetShiftId, existingAlloc.id);
    } else {
      await db.prepare(`
        INSERT INTO operator_work_assignments (id, production_order_id, shift_id, operator_id, operation, assigned_date, source, assigned_by, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, CURDATE(), 'SUPERVISOR', ?, 1, NOW(3), NOW(3))
      `).run(workAssignId, po.id, targetShiftId, opUser.id, targetOp, req.user!.id);
    }

    await auditLog(req.user!.id, 'ALLOCATE_OPERATOR_PO', 'operator_work_assignments', workAssignId, { poId: po.id, operatorId: opUser.id, shiftId: targetShiftId, operation: targetOp });

    const allocs = await db.prepare(`
      SELECT owa.id, owa.production_order_id, owa.shift_id, owa.operator_id, owa.operation, owa.assigned_by, owa.active, owa.created_at, u.full_name as operator_name, u.username as operator_username, s.name as shift_name
      FROM operator_work_assignments owa
      JOIN users u ON u.id = owa.operator_id
      LEFT JOIN shifts s ON s.id = owa.shift_id
      WHERE owa.production_order_id = ? AND owa.active = 1
    `).all(po.id);

    return res.status(201).json({
      message: `Operator ${opUser.full_name} allocated to PO ${po.po_number} for ${targetOp}`,
      allocation: { id: workAssignId, productionOrderId: po.id, operatorId: opUser.id, shiftId: targetShiftId, operation: targetOp },
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

// ── ADMIN & SUPERVISOR USER MANAGEMENT ENDPOINTS ──────────────────────────────
// GET /api/admin/users
router.get('/admin/users', authenticateToken, requireRole(['ADMIN', 'SUPERVISOR']), async (req, res, next) => {
  try {
    const users = await db.query(`
      SELECT id, employee_no, username, full_name, role, plant, active, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
    `);
    const formatted = users.map((u: any) => ({
      id: u.id,
      employeeNo: u.employee_no || u.id,
      username: u.username,
      name: u.full_name,
      role: u.role.charAt(0).toUpperCase() + u.role.slice(1).toLowerCase(),
      plant: u.plant || null,
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
router.post('/admin/users', authenticateToken, requireRole(['ADMIN', 'SUPERVISOR']), async (req: AuthRequest, res, next) => {
  try {
    const bcrypt = (await import('bcryptjs')).default;
    const { username, password, role, employeeNo } = req.body;
    const fullName = req.body.fullName || req.body.full_name || req.body.name;
    const plant = req.body.plant ? String(req.body.plant).trim() : (req.user?.role === 'SUPERVISOR' ? req.user.plant || null : null);
    if (!username || !password || !fullName || !role) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Username, password, name, and role are required' });
    }

    const roleUpper = role.toUpperCase();
    if (req.user?.role === 'SUPERVISOR' && roleUpper !== 'OPERATOR') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Supervisors are only authorized to create Operator accounts.' });
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
      INSERT INTO users (id, employee_no, username, password_hash, full_name, role, plant, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(3), NOW(3))
    `).run(userId, empNo, cleanUser, passwordHash, fullName, roleUpper, plant);
    await auditLog(req.user!.id, 'CREATE_USER', 'users', userId, { username: cleanUser, role: roleUpper, plant });
    return res.status(201).json({ message: 'User created successfully', userId });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/users/:id
router.patch('/admin/users/:id', authenticateToken, requireRole(['ADMIN', 'SUPERVISOR']), async (req: AuthRequest, res, next) => {
  try {
    const { fullName, role, active, plant } = req.body;
    const userId = req.params.id;
    const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as any;
    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
    }
    if (req.user?.role === 'SUPERVISOR' && user.role !== 'OPERATOR') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Supervisors are only authorized to manage Operator accounts.' });
    }
    if (fullName) await db.prepare(`UPDATE users SET full_name = ?, updated_at = NOW(3) WHERE id = ?`).run(fullName, userId);
    if (role) {
      const nextRoleUpper = role.toUpperCase();
      if (req.user?.role === 'SUPERVISOR' && nextRoleUpper !== 'OPERATOR') {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Supervisors are only authorized to assign the Operator role.' });
      }
      await db.prepare(`UPDATE users SET role = ?, updated_at = NOW(3) WHERE id = ?`).run(nextRoleUpper, userId);
    }
    if (active !== undefined) await db.prepare(`UPDATE users SET active = ?, updated_at = NOW(3) WHERE id = ?`).run(active ? 1 : 0, userId);
    if (plant !== undefined) await db.prepare(`UPDATE users SET plant = ?, updated_at = NOW(3) WHERE id = ?`).run(plant ? String(plant).trim() : null, userId);
    await auditLog(req.user!.id, 'UPDATE_USER', 'users', userId, { fullName, role, active, plant });
    return res.json({ message: 'User updated successfully' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/users/:id - Permanently delete user from database
router.delete('/admin/users/:id', authenticateToken, requireRole(['ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const userId = req.params.id;
    if (req.user?.id === userId) {
      return res.status(400).json({ error: 'CANNOT_DELETE_SELF', message: 'You cannot delete your own active administrator account.' });
    }
    const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as any;
    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found in database' });
    }

    // Clean up dependent child references
    try {
      await db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).run(userId);
    } catch (_) {}
    try {
      await db.prepare(`DELETE FROM shift_members WHERE operator_id = ?`).run(userId);
    } catch (_) {}
    try {
      await db.prepare(`DELETE FROM operator_work_assignments WHERE operator_id = ?`).run(userId);
    } catch (_) {}

    await db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);

    await auditLog(req.user!.id, 'PERMANENTLY_DELETE_USER', 'users', userId, {
      username: user.username,
      employee_no: user.employee_no,
      role: user.role,
      name: user.full_name
    });

    return res.json({ message: `User @${user.username} was permanently deleted from database` });
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

// DELETE /api/admin/styles/:id & DELETE /api/styles/:id
const deleteStyleHandler = async (req: AuthRequest, res: any, next: any) => {
  try {
    const { id } = req.params;
    const style = await db.prepare(`SELECT * FROM styles WHERE id = ? OR code = ?`).get(id, id) as any;
    if (!style) {
      return res.status(404).json({ error: 'Style not found' });
    }

    const poCountRow = await db.prepare(`SELECT COUNT(*) as cnt FROM production_orders WHERE style_id = ?`).get(style.id) as any;
    const poCount = Number(poCountRow?.cnt || 0);

    const force = req.query.force === 'true' || req.body?.force === true;

    if (poCount > 0 && !force) {
      return res.status(400).json({
        error: `Cannot delete style '${style.name} (${style.code})' because it is linked to ${poCount} production order(s). Confirm unlink and delete to proceed.`,
        poCount,
        requiresForce: true
      });
    }

    if (poCount > 0) {
      await db.prepare(`UPDATE production_orders SET style_id = NULL WHERE style_id = ?`).run(style.id);
    }

    await db.prepare(`DELETE FROM styles WHERE id = ?`).run(style.id);
    await auditLog(req.user!.id, 'DELETE_STYLE', 'styles', style.id, { code: style.code, name: style.name, poCount });

    return res.json({ success: true, message: `Style '${style.name} (${style.code})' deleted successfully.` });
  } catch (err) {
    next(err);
  }
};

router.delete('/admin/styles/:id', authenticateToken, requireRole(['ADMIN']), deleteStyleHandler);
router.delete('/styles/:id', authenticateToken, requireRole(['ADMIN']), deleteStyleHandler);

router.put('/styles/:id', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const { code, name, customer, notes } = req.body;
    await db.prepare(`
      UPDATE styles
      SET code = COALESCE(?, code),
          name = COALESCE(?, name),
          customer = COALESCE(?, customer),
          notes = COALESCE(?, notes),
          updated_at = NOW(3)
      WHERE id = ?
    `).run(code || null, name || null, customer || null, notes || null, id);
    const updated = await db.prepare(`SELECT * FROM styles WHERE id = ?`).get(id);
    return res.json(updated);
  } catch (err) {
    next(err);
  }
});
router.put('/admin/styles/:id', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const { code, name, customer, notes } = req.body;
    await db.prepare(`
      UPDATE styles
      SET code = COALESCE(?, code),
          name = COALESCE(?, name),
          customer = COALESCE(?, customer),
          notes = COALESCE(?, notes),
          updated_at = NOW(3)
      WHERE id = ?
    `).run(code || null, name || null, customer || null, notes || null, id);
    const updated = await db.prepare(`SELECT * FROM styles WHERE id = ?`).get(id);
    return res.json(updated);
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
        po.id, po.po_number, po.po_name, po.map_po, po.customer, po.start_date, po.due_date, po.status, po.remarks, po.qc_test_mode, po.shift_id, po.supervisor_id, po.created_at,
        po.allow_no_product_prefix, po.allow_no_box_prefix, po.plant, po.line_number,
        s.id as style_id, s.name as style_name, s.code as style_code, u.full_name as supervisor_name,
        (SELECT SUM(quantity) FROM production_order_configs WHERE production_order_id = po.id) as cfg_qty,
        (SELECT COUNT(DISTINCT item_id) FROM qc_results qr JOIN item_units iu ON iu.id = qr.item_id WHERE (iu.production_order_id = po.id OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = po.id)) AND qr.qc_result = 'PASS' AND qr.test_result = 'PASS') as qc_passed_count,
        (SELECT COUNT(DISTINCT bi.item_id) FROM box_items bi JOIN boxes b ON b.id = bi.box_id LEFT JOIN item_units iu ON iu.id = bi.item_id WHERE (b.production_order_id = po.id OR iu.production_order_id = po.id OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = po.id)) AND bi.active = 1) as packed_count
      FROM production_orders po
      LEFT JOIN styles s ON s.id = po.style_id
      LEFT JOIN users u ON u.id = po.supervisor_id
      ORDER BY po.created_at DESC
    `);

    const allConfigs = await db.prepare(`
      SELECT id, production_order_id, config_code, product_type, size, quantity, product_qr_prefix, product_serial_start, product_serial_end
      FROM production_order_configs
      ORDER BY id ASC
    `).all() as any[];

    const configsByPoId: Record<string, any[]> = {};
    for (const c of allConfigs) {
      if (!configsByPoId[c.production_order_id]) {
        configsByPoId[c.production_order_id] = [];
      }
      configsByPoId[c.production_order_id].push({
        id: c.id,
        config_code: c.config_code,
        configCode: c.config_code,
        product_type: c.product_type,
        productType: c.product_type,
        size: c.size,
        quantity: Number(c.quantity) || 0,
        product_qr_prefix: c.product_qr_prefix,
        productQrPrefix: c.product_qr_prefix,
        product_serial_start: c.product_serial_start,
        product_serial_end: c.product_serial_end
      });
    }

    const allBoxConfigs = await db.prepare(`
      SELECT id, production_order_id, prefix, size, capacity
      FROM production_order_box_configs
      ORDER BY prefix ASC, size ASC
    `).all() as any[];

    const boxConfigsByPoId: Record<string, any[]> = {};
    for (const b of allBoxConfigs) {
      if (!boxConfigsByPoId[b.production_order_id]) {
        boxConfigsByPoId[b.production_order_id] = [];
      }
      boxConfigsByPoId[b.production_order_id].push({
        id: b.id,
        prefix: b.prefix,
        size: b.size,
        capacity: Number(b.capacity) || 12
      });
    }

    const formatted = orders.map((p: any) => {
      const orderConfigs = configsByPoId[p.id] || [];
      const orderBoxConfigs = boxConfigsByPoId[p.id] || [];
      const sumConfigQty = orderConfigs.reduce((sum, c) => sum + c.quantity, 0);
      const targetQty = Number(p.cfg_qty || (sumConfigQty > 0 ? sumConfigQty : (p.total_quantity || 500)));
      const packed = Number(p.packed_count || 0);
      const qcPassed = Number(p.qc_passed_count || 0);
      const completionPct = targetQty > 0 ? Math.min(100, Math.round((packed / targetQty) * 100)) : 0;

      return {
        id: p.id,
        poNumber: p.po_number,
        po_number: p.po_number,
        poName: p.po_name || null,
        po_name: p.po_name || null,
        mapPo: p.map_po,
        map_po: p.map_po,
        styleId: p.style_id,
        style_id: p.style_id,
        styleName: p.style_name || p.style_code || 'Standard Style',
        style_name: p.style_name || p.style_code || 'Standard Style',
        styleCode: p.style_code,
        style_code: p.style_code,
        customer: p.customer || 'Standard',
        supervisorId: p.supervisor_id,
        supervisor_id: p.supervisor_id,
        supervisorName: p.supervisor_name || 'Supervisor',
        supervisor_name: p.supervisor_name || 'Supervisor',
        startDate: p.start_date,
        start_date: p.start_date,
        dueDate: p.due_date,
        due_date: p.due_date,
        status: p.status,
        orderPathway: p.order_pathway || (p.po_number?.startsWith('STYLE-') ? 'STYLE_DIRECT' : 'PO_DIRECT'),
        order_pathway: p.order_pathway || (p.po_number?.startsWith('STYLE-') ? 'STYLE_DIRECT' : 'PO_DIRECT'),
        remarks: p.remarks || '',
        qcTestMode: p.qc_test_mode,
        qc_test_mode: p.qc_test_mode,
        shiftId: p.shift_id,
        shift_id: p.shift_id,
        allowNoProductPrefix: Boolean(p.allow_no_product_prefix),
        allowNoBoxPrefix: Boolean(p.allow_no_box_prefix),
        plant: p.plant || null,
        lineNumber: p.line_number || null,
        line_number: p.line_number || null,
        configuredQuantity: targetQty,
        total_quantity: targetQty,
        qcPassedCount: qcPassed,
        qc_passed_count: qcPassed,
        packedCount: packed,
        packed_count: packed,
        completionPct,
        configs: orderConfigs,
        boxConfigurations: orderBoxConfigs,
        boxConfigs: orderBoxConfigs,
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
router.patch('/admin/orders/:id/quantity', authenticateToken, requireRole(['ADMIN', 'SUPERVISOR']), async (req: AuthRequest, res, next) => {
  try {
    const poParam = req.params.id;
    const { newQuantity, configs: submittedConfigs } = req.body;
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

    let effectiveQuantity = Number(newQuantity);

    // If specific configs were submitted with individual quantities
    if (Array.isArray(submittedConfigs) && submittedConfigs.length > 0) {
      const sumSubmitted = submittedConfigs.reduce((sum: number, c: any) => sum + (Number(c.quantity) || 0), 0);
      if (sumSubmitted > 0) {
        effectiveQuantity = sumSubmitted;
      }

      if (effectiveQuantity < maxProcessed) {
        return res.status(400).json({
          error: 'QUANTITY_SAFETY_VIOLATION',
          message: `Cannot reduce total quantity to ${effectiveQuantity}. ${maxProcessed} items have already been processed/packed for this Production Order.`
        });
      }

      for (const sc of submittedConfigs) {
        const scQty = Number(sc.quantity);
        if (sc.id && scQty > 0) {
          await db.prepare(`UPDATE production_order_configs SET quantity = ?, updated_at = NOW(3) WHERE id = ? AND production_order_id = ?`).run(scQty, sc.id, po.id);
        }
      }
    } else {
      if (!effectiveQuantity || isNaN(effectiveQuantity) || effectiveQuantity <= 0) {
        return res.status(400).json({ error: 'INVALID_QUANTITY', message: 'Configured quantity must be a positive number' });
      }

      if (effectiveQuantity < maxProcessed) {
        return res.status(400).json({
          error: 'QUANTITY_SAFETY_VIOLATION',
          message: `Cannot reduce quantity to ${effectiveQuantity}. ${maxProcessed} items have already been processed/packed for this Production Order.`
        });
      }

      // Fetch existing configs and distribute proportionally
      const configs = await db.prepare(`SELECT * FROM production_order_configs WHERE production_order_id = ?`).all(po.id) as any[];

      if (configs.length > 0) {
        const oldTotal = configs.reduce((sum: number, c: any) => sum + Number(c.quantity || 0), 0);
        const ratio = oldTotal > 0 ? effectiveQuantity / oldTotal : 1;

        for (const cfg of configs) {
          const updatedCfgQty = Math.max(1, Math.round(cfg.quantity * ratio));
          await db.prepare(`UPDATE production_order_configs SET quantity = ?, updated_at = NOW(3) WHERE id = ?`).run(updatedCfgQty, cfg.id);
        }
      }
    }

    await db.prepare(`UPDATE production_orders SET updated_at = NOW(3) WHERE id = ?`).run(po.id);

    await auditLog(req.user!.id, 'UPDATE_PO_QUANTITY', 'production_orders', po.id, {
      poNumber: po.po_number,
      oldQuantity: po.total_quantity || maxProcessed,
      newQuantity: effectiveQuantity
    });

    return res.json({
      message: `Updated configured quantity to ${effectiveQuantity} for PO ${po.po_number}`,
      poId: po.id,
      newQuantity: effectiveQuantity
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/orders/:id - Edit Full PO (ADMIN & SUPERVISOR)
router.patch('/admin/orders/:id', authenticateToken, requireRole(['ADMIN', 'SUPERVISOR']), async (req: AuthRequest, res, next) => {
  try {
    const poParam = req.params.id;
    const po = await db.prepare(`SELECT * FROM production_orders WHERE id = ? OR po_number = ?`).get(poParam, poParam) as any;
    if (!po) {
      return res.status(404).json({ error: 'PO_NOT_FOUND', message: 'Production Order not found' });
    }

    const {
      poNumber, poName, mapPo, customer, styleId, startDate, dueDate,
      supervisorId, shiftId, qcTestMode, remarks, notes, status,
      allowNoProductPrefix, allowNoBoxPrefix, configs, boxConfigs, totalQuantity
    } = req.body;

    // Check duplicate po_number if changed
    if (poNumber && poNumber.trim() !== po.po_number) {
      const dup = await db.prepare(`SELECT id FROM production_orders WHERE po_number = ? AND id != ?`).get(poNumber.trim(), po.id) as any;
      if (dup) {
        return res.status(409).json({ error: 'PO_NUMBER_EXISTS', message: `Production Order number "${poNumber.trim()}" already exists` });
      }
    }

    // Validate style if provided
    if (styleId) {
      const st = await db.prepare(`SELECT id FROM styles WHERE id = ?`).get(styleId) as any;
      if (!st) {
        return res.status(400).json({ error: 'STYLE_NOT_FOUND', message: 'Selected garment style does not exist' });
      }
    }

    // Safety checks for processed count
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
    `).get(po.id, po.id, po.id) as any;
    const qcPassedCount = Number(qcRow?.cnt || 0);

    const maxProcessed = Math.max(packedCount, qcPassedCount);

    const submittedProductConfigs = req.body.productConfigurations || configs;
    if (Array.isArray(submittedProductConfigs) && submittedProductConfigs.length > 0) {
      const newTotal = submittedProductConfigs.reduce((sum: number, c: any) => sum + (Number(c.quantity) || 0), 0);
      if (newTotal < maxProcessed) {
        return res.status(400).json({
          error: 'QUANTITY_SAFETY_VIOLATION',
          message: `Cannot reduce total quantity to ${newTotal}. At least ${maxProcessed} items have already been processed/packed for this PO.`
        });
      }

      const existingConfigs = await db.prepare(`SELECT * FROM production_order_configs WHERE production_order_id = ?`).all(po.id) as any[];
      const sentIds = new Set(submittedProductConfigs.filter((c: any) => c.id).map((c: any) => c.id));

      if (sentIds.size === 0 && existingConfigs.length > 0) {
        // Full replace from configure page where items don't have existing IDs
        try {
          await db.prepare(`DELETE FROM production_order_configs WHERE production_order_id = ?`).run(po.id);
        } catch (e) {}
      } else if (sentIds.size > 0) {
        for (const ec of existingConfigs) {
          if (!sentIds.has(ec.id)) {
            try {
              await db.prepare(`DELETE FROM production_order_configs WHERE id = ?`).run(ec.id);
            } catch (e) {}
          }
        }
      }

      for (const cfg of submittedProductConfigs) {
        if (cfg.id && sentIds.has(cfg.id)) {
          const qty = Number(cfg.quantity);
          if (qty > 0) {
            await db.prepare(`
              UPDATE production_order_configs 
              SET quantity = ?, 
                  size = COALESCE(?, size),
                  product_type = COALESCE(?, product_type),
                  config_code = COALESCE(?, config_code),
                  updated_at = NOW(3)
              WHERE id = ? AND production_order_id = ?
            `).run(qty, cfg.size || null, cfg.productType || cfg.product_type || null, cfg.configCode || cfg.config_code || null, cfg.id, po.id);
          }
        } else {
          // Newly added configuration in edit form
          const newCfgId = `poc-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
          const cfgCode = (cfg.configCode || cfg.config_code || '').trim().toUpperCase() || 'STD';
          const pType = (cfg.productType || cfg.product_type || 'GARMENT').trim();
          const sz = (cfg.size || 'STD').trim();
          const qty = Number(cfg.quantity) || 100;
          await db.prepare(`
            INSERT INTO production_order_configs (id, production_order_id, config_code, product_type, size, quantity, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
          `).run(newCfgId, po.id, cfgCode, pType, sz, qty);
        }
      }
    }

    // Process box configurations if provided
    const submittedBoxConfigs = req.body.boxConfigurations || boxConfigs;
    if (Array.isArray(submittedBoxConfigs)) {
      const existingBoxConfigs = await db.prepare(`SELECT * FROM production_order_box_configs WHERE production_order_id = ?`).all(po.id) as any[];
      const sentIds = new Set(submittedBoxConfigs.filter((b: any) => b.id).map((b: any) => b.id));

      if (sentIds.size === 0 && existingBoxConfigs.length > 0) {
        // Full replace from configure page
        try {
          await db.prepare(`DELETE FROM production_order_box_configs WHERE production_order_id = ?`).run(po.id);
        } catch (e) {}
      } else if (sentIds.size > 0) {
        // Remove deleted box configs that are not in the update payload
        for (const eb of existingBoxConfigs) {
          if (!sentIds.has(eb.id)) {
            try {
              await db.prepare(`DELETE FROM production_order_box_configs WHERE id = ?`).run(eb.id);
            } catch (e) {
              // Ignore if in use
            }
          }
        }
      }

      // Update or insert box configs
      for (const bCfg of submittedBoxConfigs) {
        const pfx = (bCfg.prefix || '').trim().toUpperCase();
        const sz = (bCfg.size || 'STANDARD').trim().toUpperCase();
        const cap = Number(bCfg.capacity) || 12;

        if (bCfg.id && sentIds.has(bCfg.id)) {
          await db.prepare(`
            UPDATE production_order_box_configs
            SET prefix = ?, size = ?, capacity = ?, updated_at = NOW(3)
            WHERE id = ? AND production_order_id = ?
          `).run(pfx, sz, cap, bCfg.id, po.id);
        } else {
          const newBoxCfgId = `pbc-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
          await db.prepare(`
            INSERT INTO production_order_box_configs (id, production_order_id, prefix, size, capacity, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, NOW(3), NOW(3))
            ON DUPLICATE KEY UPDATE capacity = VALUES(capacity), updated_at = NOW(3)
          `).run(newBoxCfgId, po.id, pfx, sz, cap);
        }
      }
    } else if (totalQuantity != null && !isNaN(Number(totalQuantity))) {
      const qty = Number(totalQuantity);
      if (qty < maxProcessed) {
        return res.status(400).json({
          error: 'QUANTITY_SAFETY_VIOLATION',
          message: `Cannot reduce quantity to ${qty}. At least ${maxProcessed} items have already been processed/packed.`
        });
      }
      const existingConfigs = await db.prepare(`SELECT * FROM production_order_configs WHERE production_order_id = ?`).all(po.id) as any[];
      if (existingConfigs.length > 0) {
        const oldTotal = existingConfigs.reduce((sum: number, c: any) => sum + Number(c.quantity || 0), 0);
        const ratio = oldTotal > 0 ? qty / oldTotal : 1;
        for (const cfg of existingConfigs) {
          const updatedCfgQty = Math.max(1, Math.round(cfg.quantity * ratio));
          await db.prepare(`UPDATE production_order_configs SET quantity = ?, updated_at = NOW(3) WHERE id = ?`).run(updatedCfgQty, cfg.id);
        }
      }
    }

    // Build update parameters for production_orders table
    const updates: string[] = ['updated_at = NOW(3)'];
    const params: any[] = [];

    if (poNumber !== undefined && poNumber.trim()) {
      updates.push('po_number = ?');
      params.push(poNumber.trim());
    }
    if (poName !== undefined) {
      updates.push('po_name = ?');
      params.push(poName ? poName.trim() : null);
    }
    if (mapPo !== undefined && mapPo.trim()) {
      updates.push('map_po = ?');
      params.push(mapPo.trim());
    }
    if (customer !== undefined && customer.trim()) {
      updates.push('customer = ?');
      params.push(customer.trim());
    }
    if (styleId !== undefined) {
      updates.push('style_id = ?');
      params.push(styleId || null);
    }
    if (startDate !== undefined && startDate.trim()) {
      updates.push('start_date = ?');
      params.push(startDate.trim());
    }
    if (dueDate !== undefined && dueDate.trim()) {
      updates.push('due_date = ?');
      params.push(dueDate.trim());
    }
    if (supervisorId !== undefined) {
      updates.push('supervisor_id = ?');
      params.push(supervisorId || null);
    }
    if (shiftId !== undefined) {
      updates.push('shift_id = ?');
      params.push(shiftId || null);
    }
    if (qcTestMode !== undefined) {
      let dbQc = po.qc_test_mode || 'QC_AND_TEST';
      if (qcTestMode === 'QC Only' || qcTestMode === 'QC_ONLY') dbQc = 'QC_ONLY';
      else if (qcTestMode === 'Test Only' || qcTestMode === 'TEST_ONLY') dbQc = 'TEST_ONLY';
      else if (qcTestMode === 'QC & Test' || qcTestMode === 'QC_AND_TEST') dbQc = 'QC_AND_TEST';
      updates.push('qc_test_mode = ?');
      params.push(dbQc);
    }
    const finalRemarks = remarks !== undefined ? remarks : (notes !== undefined ? notes : undefined);
    if (finalRemarks !== undefined) {
      updates.push('remarks = ?');
      params.push(finalRemarks != null ? finalRemarks.trim() : '');
    }
    if (status !== undefined && status.trim()) {
      updates.push('status = ?');
      params.push(status.trim().toUpperCase());
    }
    if (allowNoProductPrefix !== undefined) {
      updates.push('allow_no_product_prefix = ?');
      params.push(allowNoProductPrefix ? 1 : 0);
    }
    if (allowNoBoxPrefix !== undefined) {
      updates.push('allow_no_box_prefix = ?');
      params.push(allowNoBoxPrefix ? 1 : 0);
    }
    if ((req.body as any).plant !== undefined) {
      updates.push('plant = ?');
      params.push((req.body as any).plant ? String((req.body as any).plant).trim() : null);
    }
    if ((req.body as any).lineNumber !== undefined) {
      updates.push('line_number = ?');
      params.push((req.body as any).lineNumber ? String((req.body as any).lineNumber).trim() : null);
    }
    const rawQcStationCount = (req.body as any)?.qcStationCount ?? (req.body as any)?.qc_station_count;
    if (rawQcStationCount !== undefined) {
      updates.push('qc_station_count = ?');
      params.push(Math.max(1, Math.min(10, Number(rawQcStationCount) || 1)));
    }
    const rawPreQcStationCount = (req.body as any)?.preQcStationCount ?? (req.body as any)?.pre_qc_station_count;
    if (rawPreQcStationCount !== undefined) {
      updates.push('pre_qc_station_count = ?');
      params.push(Math.max(1, Math.min(10, Number(rawPreQcStationCount) || 1)));
    }
    const rawQcTests = (req.body as any)?.qcTests ?? (req.body as any)?.qc_tests;
    if (rawQcTests !== undefined) {
      const dbQcTests = Array.isArray(rawQcTests) ? rawQcTests.map((t: any) => String(t).trim()).filter(Boolean) : [];
      updates.push('qc_tests = ?');
      params.push(JSON.stringify(dbQcTests));
    }
    const rawPreQcTests = (req.body as any)?.preQcTests ?? (req.body as any)?.pre_qc_tests;
    if (rawPreQcTests !== undefined) {
      const dbPreQcTests = Array.isArray(rawPreQcTests) ? rawPreQcTests.map((t: any) => String(t).trim()).filter(Boolean) : [];
      updates.push('pre_qc_tests = ?');
      params.push(dbPreQcTests.length > 0 ? JSON.stringify(dbPreQcTests) : null);
    }

    params.push(po.id);
    await db.prepare(`UPDATE production_orders SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    if (Array.isArray((req.body as any).selectedOperations)) {
      await db.prepare(`DELETE FROM production_order_operations WHERE production_order_id = ?`).run(po.id);
      for (const opStr of (req.body as any).selectedOperations) {
        let code = opStr;
        if (opStr === 'Pre QC') code = 'PRE_QC';
        else if (opStr === 'QC Test') code = 'QC_TEST';
        else if (opStr === 'Packing') code = 'PACKING';
        else if (opStr === 'AQL Checker') code = 'AQL';
        else if (opStr === 'FINAL AQL' || opStr === 'Final AQL') code = 'FINAL_AQL';
        else if (opStr === 'Box Transfer') code = 'BOX_TRANSFER';
        await db.prepare(`INSERT INTO production_order_operations (production_order_id, operation) VALUES (?, ?)`).run(po.id, code);
      }
    }

    const submittedAllocs = req.body.shifts || req.body.allocations;
    if (Array.isArray(submittedAllocs)) {
      await syncPoAllocations(db, po.id, submittedAllocs, req.user!.id, req.body.selectedOperations);
    }

    await auditLog(req.user!.id, 'UPDATE_FULL_PO', 'production_orders', po.id, {
      poNumber: poNumber || po.po_number,
      changes: req.body
    });

    const updatedPo = await db.prepare(`SELECT * FROM production_orders WHERE id = ?`).get(po.id) as any;
    const formatted = await formatProductionOrder(updatedPo, req.user);

    return res.json({
      message: `Production Order ${updatedPo.po_number} successfully updated`,
      order: formatted
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/orders/:id - Permanently delete PO from database (ADMIN)
router.delete('/admin/orders/:id', authenticateToken, requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const poParam = req.params.id;
    const po = await db.prepare(`SELECT * FROM production_orders WHERE id = ? OR po_number = ?`).get(poParam, poParam) as any;
    if (!po) {
      return res.status(404).json({ error: 'PO_NOT_FOUND', message: 'Production Order not found in database' });
    }

    await db.transaction(async (tx) => {
      // 1. Boxes and box items
      const boxRows = await tx.prepare(`
        SELECT id FROM boxes 
        WHERE production_order_id = ? OR sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?)
      `).all(po.id, po.id) as any[];
      const boxIds = boxRows.map(b => b.id);
      if (boxIds.length > 0) {
        const ph = boxIds.map(() => '?').join(',');
        await tx.prepare(`DELETE FROM box_items WHERE box_id IN (${ph})`).run(...boxIds);
        await tx.prepare(`DELETE FROM aql_inspections WHERE box_id IN (${ph})`).run(...boxIds);
        await tx.prepare(`DELETE FROM boxes WHERE id IN (${ph})`).run(...boxIds);
      }

      // 2. Items and inspections
      const itemRows = await tx.prepare(`
        SELECT id FROM item_units 
        WHERE production_order_id = ? OR sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?)
      `).all(po.id, po.id) as any[];
      const itemIds = itemRows.map(i => i.id);
      if (itemIds.length > 0) {
        const ph = itemIds.map(() => '?').join(',');
        await tx.prepare(`DELETE FROM qc_results WHERE item_id IN (${ph})`).run(...itemIds);
        await tx.prepare(`DELETE FROM qc_fail_log WHERE item_id IN (${ph})`).run(...itemIds);
        await tx.prepare(`DELETE FROM box_items WHERE item_id IN (${ph})`).run(...itemIds);
        await tx.prepare(`DELETE FROM item_units WHERE id IN (${ph})`).run(...itemIds);
      }

      // 3. Child tables referencing production_order_id
      await tx.prepare(`DELETE FROM aql_inspections WHERE production_order_id = ?`).run(po.id);
      await tx.prepare(`DELETE FROM operator_work_assignments WHERE production_order_id = ?`).run(po.id);
      await tx.prepare(`DELETE FROM production_order_box_configs WHERE production_order_id = ?`).run(po.id);
      await tx.prepare(`DELETE FROM production_order_configs WHERE production_order_id = ?`).run(po.id);
      await tx.prepare(`DELETE FROM production_order_operations WHERE production_order_id = ?`).run(po.id);
      await tx.prepare(`DELETE FROM sales_orders WHERE production_order_id = ?`).run(po.id);

      // 4. Finally delete the PO record
      await tx.prepare(`DELETE FROM production_orders WHERE id = ?`).run(po.id);
    });

    await auditLog(req.user!.id, 'DELETE_PRODUCTION_ORDER', 'production_orders', po.id, {
      poNumber: po.po_number,
      poName: po.po_name,
      customer: po.customer
    });

    return res.json({ message: `Production Order ${po.po_number} was permanently deleted from database` });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/production-orders/:id/no-prefix-config (SUPERVISOR / ADMIN)
router.patch('/production-orders/:id/no-prefix-config', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const poParam = req.params.id;
    const { allowNoProductPrefix, allowNoBoxPrefix } = req.body;

    const po = await db.prepare(`SELECT * FROM production_orders WHERE id = ? OR po_number = ?`).get(poParam, poParam) as any;
    if (!po) {
      return res.status(404).json({ error: 'PO_NOT_FOUND', message: 'Production Order not found' });
    }

    const updates: string[] = ['updated_at = NOW(3)'];
    const params: any[] = [];

    if (allowNoProductPrefix !== undefined) {
      updates.push('allow_no_product_prefix = ?');
      params.push(allowNoProductPrefix ? 1 : 0);
    }
    if (allowNoBoxPrefix !== undefined) {
      updates.push('allow_no_box_prefix = ?');
      params.push(allowNoBoxPrefix ? 1 : 0);
    }

    params.push(po.id);
    await db.prepare(`UPDATE production_orders SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    await auditLog(req.user!.id, 'UPDATE_PO_NO_PREFIX_CONFIG', 'production_orders', po.id, {
      poNumber: po.po_number,
      allowNoProductPrefix,
      allowNoBoxPrefix
    });

    const updated = await db.prepare(`SELECT * FROM production_orders WHERE id = ?`).get(po.id);
    const formatted = await formatProductionOrder(updated);

    return res.json({
      message: `Updated validation rules for PO ${po.po_number || po.id}`,
      productionOrder: formatted
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

// DELETE /api/boxes/:id — Delete a box and release its packed items (Admin & Supervisor)
router.delete('/boxes/:id', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const role = (req.user?.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'supervisor') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Only Admins and Supervisors can delete boxes.' });
    }

    const boxId = req.params.id;
    const box = await db.prepare(`SELECT * FROM boxes WHERE id = ? OR box_code = ? OR box_number = ?`).get(boxId, boxId, boxId) as any;
    if (!box) {
      return res.status(404).json({ error: 'BOX_NOT_FOUND', message: 'Box not found.' });
    }

    await db.transaction(async (tx) => {
      // 1. Reset status of packed items back to 'PASSED' (if passed QC) or 'CREATED'
      await tx.prepare(`
        UPDATE item_units 
        SET status = CASE 
          WHEN id IN (SELECT qr.item_id FROM qc_results qr WHERE qr.qc_result = 'PASS') THEN 'PASSED' 
          ELSE 'CREATED' 
        END, 
        updated_at = NOW(3)
        WHERE id IN (SELECT item_id FROM box_items WHERE box_id = ?)
      `).run(box.id);

      // 2. Delete box transfer items and transfers if any
      await tx.prepare(`DELETE FROM box_transfer_items WHERE source_box_item_id IN (SELECT id FROM box_items WHERE box_id = ?) OR destination_box_item_id IN (SELECT id FROM box_items WHERE box_id = ?)`).run(box.id, box.id).catch(() => {});
      await tx.prepare(`DELETE FROM box_transfers WHERE source_box_id = ? OR destination_box_id = ?`).run(box.id, box.id).catch(() => {});

      // 3. Delete AQL samples and inspections if any
      await tx.prepare(`DELETE FROM aql_samples WHERE inspection_id IN (SELECT id FROM aql_inspections WHERE box_id = ?)`).run(box.id).catch(() => {});
      await tx.prepare(`DELETE FROM aql_inspections WHERE box_id = ?`).run(box.id).catch(() => {});

      // 4. Delete box items
      await tx.prepare(`DELETE FROM box_items WHERE box_id = ?`).run(box.id);

      // 5. Delete the box
      await tx.prepare(`DELETE FROM boxes WHERE id = ?`).run(box.id);
    });

    await auditLog(req.user!.id, 'DELETE_BOX', 'boxes', box.id, {
      boxCode: box.box_code || box.box_number,
      poId: box.production_order_id
    });

    return res.json({
      success: true,
      message: `Box ${box.box_code || box.box_number} deleted successfully.`
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/boxes/:boxId/items/:qrCode — Delete a specific item from a box (Admin & Supervisor)
router.delete('/boxes/:boxId/items/:qrCode', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const role = (req.user?.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'supervisor') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Only Admins and Supervisors can remove items from boxes.' });
    }

    const { boxId, qrCode } = req.params;
    const box = await db.prepare(`SELECT * FROM boxes WHERE id = ? OR box_code = ? OR box_number = ?`).get(boxId, boxId, boxId) as any;
    if (!box) {
      return res.status(404).json({ error: 'BOX_NOT_FOUND', message: 'Box not found.' });
    }

    const item = await db.prepare(`SELECT * FROM item_units WHERE UPPER(TRIM(qr_code)) = ?`).get(qrCode.trim().toUpperCase()) as any;
    if (!item) {
      return res.status(404).json({ error: 'ITEM_NOT_FOUND', message: `Item '${qrCode}' not found.` });
    }

    const boxItem = await db.prepare(`SELECT * FROM box_items WHERE box_id = ? AND item_id = ? AND active = 1`).get(box.id, item.id) as any;
    if (!boxItem) {
      return res.status(404).json({ error: 'ITEM_NOT_IN_BOX', message: `Item '${qrCode}' is not in Box ${box.box_code || box.box_number}.` });
    }

    await db.transaction(async (tx) => {
      // 1. Delete item from box_items
      await tx.prepare(`DELETE FROM box_items WHERE id = ?`).run(boxItem.id);

      // 2. Reset item status back to 'QC_PASSED' if it passed QC, else 'CREATED'
      const qcPass = await tx.prepare(`SELECT id FROM qc_results WHERE item_id = ? AND qc_result = 'PASS' AND test_result = 'PASS'`).get(item.id) as any;
      const newStatus = qcPass ? 'QC_PASSED' : 'CREATED';
      await tx.prepare(`UPDATE item_units SET status = ?, updated_at = NOW(3) WHERE id = ?`).run(newStatus, item.id);

      // 3. Re-open box if count is below capacity
      const remainingRow = await tx.prepare(`SELECT COUNT(*) as cnt FROM box_items WHERE box_id = ? AND active = 1`).get(box.id) as any;
      const remainingCount = Number(remainingRow?.cnt || 0);
      if (remainingCount < box.capacity) {
        await tx.prepare(`UPDATE boxes SET status = 'OPEN', updated_at = NOW(3) WHERE id = ?`).run(box.id);
      }
    });

    await auditLog(req.user!.id, 'REMOVE_BOX_ITEM', 'boxes', box.id, {
      boxCode: box.box_code || box.box_number,
      itemQr: qrCode
    });

    return res.json({
      success: true,
      message: `Item '${qrCode}' removed from Box ${box.box_code || box.box_number} successfully.`
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/qc-logs/:id — Delete a QC inspection log entry
router.delete('/admin/qc-logs/:id', authenticateToken, requireRole(['ADMIN', 'SUPERVISOR']), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    await db.transaction(async (tx) => {
      await tx.prepare(`DELETE FROM qc_results WHERE id = ?`).run(id);
      await tx.prepare(`DELETE FROM qc_fail_log WHERE id = ?`).run(id);
    });
    await auditLog(req.user!.id, 'DELETE_QC_LOG', 'qc_results', id, {});
    return res.json({ success: true, message: 'QC inspection log deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/pre-qc-logs/:id — Delete a Pre-QC validation log entry
router.delete('/admin/pre-qc-logs/:id', authenticateToken, requireRole(['ADMIN', 'SUPERVISOR']), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    await db.prepare(`DELETE FROM pre_qc_results WHERE id = ?`).run(id);
    await auditLog(req.user!.id, 'DELETE_PRE_QC_LOG', 'pre_qc_results', id, {});
    return res.json({ success: true, message: 'Pre-QC validation log deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/aql-logs/:id — Delete an AQL inspection log entry
router.delete('/admin/aql-logs/:id', authenticateToken, requireRole(['ADMIN', 'SUPERVISOR']), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    await db.transaction(async (tx) => {
      await tx.prepare(`DELETE FROM aql_samples WHERE inspection_id = ?`).run(id).catch(() => {});
      await tx.prepare(`DELETE FROM aql_inspections WHERE id = ?`).run(id);
    });
    await auditLog(req.user!.id, 'DELETE_AQL_LOG', 'aql_inspections', id, {});
    return res.json({ success: true, message: 'AQL inspection log deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/scrapped/:id — Delete a scrapped item entry
router.delete('/admin/scrapped/:id', authenticateToken, requireRole(['ADMIN', 'SUPERVISOR']), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    await db.prepare(`DELETE FROM permanently_removed_items WHERE id = ?`).run(id);
    await auditLog(req.user!.id, 'DELETE_SCRAPPED_ITEM', 'permanently_removed_items', id, {});
    return res.json({ success: true, message: 'Scrapped item log deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// PRODUCT CONFIGURATION MASTER-DATA ENDPOINTS (FULLY DYNAMIC / USER-MANAGED)
// =========================================================================

// GET /api/product-config-types — List configuration types with associated sizes
router.get('/product-config-types', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const showAll = req.query.all === '1' || req.query.all === 'true';
    const typesQuery = showAll
      ? `SELECT * FROM product_configuration_types ORDER BY created_at ASC`
      : `SELECT * FROM product_configuration_types WHERE active = 1 ORDER BY created_at ASC`;

    const types = await db.query<any>(typesQuery);

    const result = await Promise.all(
      types.map(async (t) => {
        const sizesQuery = showAll
          ? `SELECT id, configuration_type_id as configurationTypeId, size_code as sizeCode, active FROM product_configuration_sizes WHERE configuration_type_id = ? ORDER BY created_at ASC`
          : `SELECT id, configuration_type_id as configurationTypeId, size_code as sizeCode, active FROM product_configuration_sizes WHERE configuration_type_id = ? AND active = 1 ORDER BY created_at ASC`;
        const sizes = await db.query<any>(sizesQuery, [t.id]);

        return {
          id: t.id,
          name: t.name,
          prefix: t.prefix || '',
          usesSizes: Boolean(t.uses_sizes),
          active: Boolean(t.active),
          createdAt: t.created_at,
          updatedAt: t.updated_at,
          sizes: sizes.map(s => ({
            id: s.id,
            configurationTypeId: s.configurationTypeId,
            sizeCode: s.sizeCode,
            active: Boolean(s.active)
          }))
        };
      })
    );

    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/product-config-types — Create new Product Configuration Type (SUPERVISOR / ADMIN)
router.post('/product-config-types', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const { name, prefix, usesSizes } = req.body;
    const cleanName = (name || '').trim();

    if (!cleanName) {
      return res.status(400).json({ error: 'NAME_REQUIRED', message: 'Configuration Type Name is required.' });
    }

    const cleanPrefix = prefix ? prefix.trim().toUpperCase() : null;
    const usesSizesVal = usesSizes === false || usesSizes === 0 || usesSizes === 'false' ? 0 : 1;

    // Check duplicate active name
    const existing = await db.queryOne<any>(
      `SELECT * FROM product_configuration_types WHERE UPPER(TRIM(name)) = UPPER(TRIM(?)) AND active = 1`,
      [cleanName]
    );

    if (existing) {
      return res.status(400).json({
        error: 'DUPLICATE_TYPE',
        message: `A configuration type named '${cleanName}' already exists.`
      });
    }

    const id = `pct-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
    await db.execute(
      `INSERT INTO product_configuration_types (id, name, prefix, uses_sizes, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, NOW(3), NOW(3))`,
      [id, cleanName, cleanPrefix, usesSizesVal]
    );

    await auditLog(req.user!.id, 'CREATE_CONFIG_TYPE', 'product_configuration_types', id, { name: cleanName, prefix: cleanPrefix, usesSizes: usesSizesVal });

    return res.status(201).json({
      id,
      name: cleanName,
      prefix: cleanPrefix || '',
      usesSizes: Boolean(usesSizesVal),
      active: true,
      sizes: []
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/product-config-types/:id — Update Configuration Type details
router.put('/product-config-types/:id', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const { name, prefix, usesSizes } = req.body;

    const existingType = await db.queryOne<any>(`SELECT * FROM product_configuration_types WHERE id = ?`, [id]);
    if (!existingType) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Configuration type not found.' });
    }

    const cleanName = name ? name.trim() : existingType.name;
    const cleanPrefix = prefix !== undefined ? (prefix ? prefix.trim().toUpperCase() : null) : existingType.prefix;
    const usesSizesVal = usesSizes !== undefined ? (usesSizes ? 1 : 0) : existingType.uses_sizes;

    // Check duplicate active name excluding this ID
    const dup = await db.queryOne<any>(
      `SELECT * FROM product_configuration_types WHERE UPPER(TRIM(name)) = UPPER(TRIM(?)) AND id != ? AND active = 1`,
      [cleanName, id]
    );

    if (dup) {
      return res.status(400).json({
        error: 'DUPLICATE_TYPE',
        message: `Another active configuration type named '${cleanName}' already exists.`
      });
    }

    await db.execute(
      `UPDATE product_configuration_types SET name = ?, prefix = ?, uses_sizes = ?, updated_at = NOW(3) WHERE id = ?`,
      [cleanName, cleanPrefix, usesSizesVal, id]
    );

    await auditLog(req.user!.id, 'UPDATE_CONFIG_TYPE', 'product_configuration_types', id, { name: cleanName, prefix: cleanPrefix, usesSizes: usesSizesVal });

    const updated = await db.queryOne<any>(`SELECT * FROM product_configuration_types WHERE id = ?`, [id]);
    const sizes = await db.query<any>(`SELECT id, configuration_type_id as configurationTypeId, size_code as sizeCode, active FROM product_configuration_sizes WHERE configuration_type_id = ? AND active = 1`, [id]);

    return res.json({
      id: updated.id,
      name: updated.name,
      prefix: updated.prefix || '',
      usesSizes: Boolean(updated.uses_sizes),
      active: Boolean(updated.active),
      sizes: sizes.map(s => ({ id: s.id, configurationTypeId: s.configurationTypeId, sizeCode: s.sizeCode, active: Boolean(s.active) }))
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/product-config-types/:id/toggle — Activate/Deactivate Configuration Type
router.patch('/product-config-types/:id/toggle', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const { active } = req.body;

    const existingType = await db.queryOne<any>(`SELECT * FROM product_configuration_types WHERE id = ?`, [id]);
    if (!existingType) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Configuration type not found.' });
    }

    const newActive = active ? 1 : 0;
    await db.execute(`UPDATE product_configuration_types SET active = ?, updated_at = NOW(3) WHERE id = ?`, [newActive, id]);
    await auditLog(req.user!.id, newActive ? 'ACTIVATE_CONFIG_TYPE' : 'DEACTIVATE_CONFIG_TYPE', 'product_configuration_types', id, { active: newActive });

    return res.json({ id, active: Boolean(newActive), message: `Configuration type ${newActive ? 'activated' : 'deactivated'}` });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/product-config-types/:id — Delete or Deactivate Configuration Type
router.delete('/product-config-types/:id', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;

    const existingType = await db.queryOne<any>(`SELECT * FROM product_configuration_types WHERE id = ?`, [id]);
    if (!existingType) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Configuration type not found.' });
    }

    // Check if referenced in historical PO configurations
    const usedRow = await db.queryOne<any>(
      `SELECT COUNT(*) as cnt FROM production_order_configs WHERE UPPER(TRIM(product_type)) = UPPER(TRIM(?))`,
      [existingType.name]
    );

    const isUsed = (usedRow?.cnt || 0) > 0;

    if (isUsed) {
      // Safely deactivate instead of deleting to protect historical production data
      await db.execute(`UPDATE product_configuration_types SET active = 0, updated_at = NOW(3) WHERE id = ?`, [id]);
      await auditLog(req.user!.id, 'DEACTIVATE_CONFIG_TYPE', 'product_configuration_types', id, { isUsed: true });
      return res.json({ id, active: false, deactivated: true, message: `Configuration type '${existingType.name}' is referenced by historical PO records. It has been deactivated to preserve traceability.` });
    }

    // Unused: Safe to delete
    await db.execute(`DELETE FROM product_configuration_sizes WHERE configuration_type_id = ?`, [id]);
    await db.execute(`DELETE FROM product_configuration_types WHERE id = ?`, [id]);
    await auditLog(req.user!.id, 'DELETE_CONFIG_TYPE', 'product_configuration_types', id, { deleted: true });

    return res.json({ id, deleted: true, message: `Configuration type '${existingType.name}' deleted.` });
  } catch (err) {
    next(err);
  }
});

// POST /api/product-config-types/:id/sizes — Add Size under Configuration Type
router.post('/product-config-types/:id/sizes', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const { sizeCode } = req.body;

    const configType = await db.queryOne<any>(`SELECT * FROM product_configuration_types WHERE id = ?`, [id]);
    if (!configType) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Configuration type not found.' });
    }

    const cleanSize = (sizeCode || '').trim().toUpperCase();
    if (!cleanSize) {
      return res.status(400).json({ error: 'SIZE_REQUIRED', message: 'Size code is required.' });
    }

    // Check duplicate active size code under THIS configuration type
    const dup = await db.queryOne<any>(
      `SELECT * FROM product_configuration_sizes WHERE configuration_type_id = ? AND UPPER(TRIM(size_code)) = ? AND active = 1`,
      [id, cleanSize]
    );

    if (dup) {
      return res.status(400).json({
        error: 'DUPLICATE_SIZE',
        message: `Size '${cleanSize}' already exists for configuration type '${configType.name}'.`
      });
    }

    const sizeId = `pcs-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
    await db.execute(
      `INSERT INTO product_configuration_sizes (id, configuration_type_id, size_code, active, created_at, updated_at)
       VALUES (?, ?, ?, 1, NOW(3), NOW(3))`,
      [sizeId, id, cleanSize]
    );

    await auditLog(req.user!.id, 'CREATE_CONFIG_SIZE', 'product_configuration_sizes', sizeId, { configurationTypeId: id, sizeCode: cleanSize });

    return res.status(201).json({
      id: sizeId,
      configurationTypeId: id,
      sizeCode: cleanSize,
      active: true
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/product-config-types/sizes/:sizeId — Update Size code
router.put('/product-config-types/sizes/:sizeId', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const { sizeId } = req.params;
    const { sizeCode } = req.body;

    const existingSize = await db.queryOne<any>(`SELECT * FROM product_configuration_sizes WHERE id = ?`, [sizeId]);
    if (!existingSize) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Size not found.' });
    }

    const cleanSize = (sizeCode || '').trim().toUpperCase();
    if (!cleanSize) {
      return res.status(400).json({ error: 'SIZE_REQUIRED', message: 'Size code is required.' });
    }

    // Duplicate check under same configuration type
    const dup = await db.queryOne<any>(
      `SELECT * FROM product_configuration_sizes WHERE configuration_type_id = ? AND UPPER(TRIM(size_code)) = ? AND id != ? AND active = 1`,
      [existingSize.configuration_type_id, cleanSize, sizeId]
    );

    if (dup) {
      return res.status(400).json({
        error: 'DUPLICATE_SIZE',
        message: `Size '${cleanSize}' already exists for this configuration type.`
      });
    }

    await db.execute(`UPDATE product_configuration_sizes SET size_code = ?, updated_at = NOW(3) WHERE id = ?`, [cleanSize, sizeId]);
    await auditLog(req.user!.id, 'UPDATE_CONFIG_SIZE', 'product_configuration_sizes', sizeId, { sizeCode: cleanSize });

    return res.json({ id: sizeId, configurationTypeId: existingSize.configuration_type_id, sizeCode: cleanSize, active: Boolean(existingSize.active) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/product-config-types/sizes/:sizeId/toggle — Activate/Deactivate Size
router.patch('/product-config-types/sizes/:sizeId/toggle', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const { sizeId } = req.params;
    const { active } = req.body;

    const existingSize = await db.queryOne<any>(`SELECT * FROM product_configuration_sizes WHERE id = ?`, [sizeId]);
    if (!existingSize) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Size not found.' });
    }

    const newActive = active ? 1 : 0;
    await db.execute(`UPDATE product_configuration_sizes SET active = ?, updated_at = NOW(3) WHERE id = ?`, [newActive, sizeId]);
    await auditLog(req.user!.id, newActive ? 'ACTIVATE_CONFIG_SIZE' : 'DEACTIVATE_CONFIG_SIZE', 'product_configuration_sizes', sizeId, { active: newActive });

    return res.json({ id: sizeId, active: Boolean(newActive), message: `Size ${newActive ? 'activated' : 'deactivated'}` });
  } catch (err) {
    next(err);
  }
});

// GET /api/scans/po-line-history — Live inspection & completed QRs history for specific PO & Line
router.get('/scans/po-line-history', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const poId = (req.query.poId as string || '').trim();
    const line = (req.query.line as string || '').trim();
    const operation = (req.query.operation as string || 'QC').toUpperCase().trim();

    if (!poId) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Production order ID (poId) is required' });
    }

    const po = await db.queryOne<any>(`
      SELECT id, po_number, po_name, line_number
      FROM production_orders
      WHERE id = ? OR po_number = ?
    `, [poId, poId]);

    if (!po) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Production order not found' });
    }

    // Safely calculate target quantity from production_order_configs
    const cfgQtyRow = await db.queryOne<any>(`
      SELECT COALESCE(SUM(quantity), 0) as totalQty
      FROM production_order_configs
      WHERE production_order_id = ?
    `, [po.id]);
    const targetQuantity = Number(cfgQtyRow?.totalQty || 0);

    const effectiveLine = line || po.line_number || 'Line 1';

    if (operation === 'PRE_QC' || operation === 'PRE-QC') {
      const rows = await db.prepare(`
        SELECT pq.id, iu.qr_code, pq.pre_qc_result as result, pq.failure_reason, pq.scanned_at,
               u.full_name as operator_name, iu.size,
               COALESCE(pq.line_number, po.line_number, 'Line 1') as line_number
        FROM pre_qc_results pq
        JOIN item_units iu ON iu.id = pq.item_id
        LEFT JOIN production_orders po ON (po.id = pq.production_order_id OR po.id = iu.production_order_id)
        LEFT JOIN users u ON u.id = pq.operator_id
        WHERE (pq.production_order_id = ? OR iu.production_order_id = ?)
          ${line ? "AND (pq.line_number = ? OR (pq.line_number IS NULL AND po.line_number LIKE ?))" : ""}
        ORDER BY pq.scanned_at DESC
      `).all(...(line ? [po.id, po.id, line, `%${line}%`] : [po.id, po.id])) as any[];

      const passCount = rows.filter(r => r.result === 'PASS').length;
      const failCount = rows.filter(r => r.result === 'FAIL').length;

      return res.json({
        poId: po.id,
        poNumber: po.po_number,
        selectedLine: effectiveLine,
        operation: 'PRE_QC',
        summary: {
          total: rows.length,
          passCount,
          failCount,
          targetQuantity
        },
        records: rows
      });
    }

    if (operation === 'QC' || operation === 'QC_TEST' || operation === 'QC TEST') {
      const rows = await db.prepare(`
        SELECT qr.id, iu.qr_code, qr.qc_result, qr.test_result, qr.failure_reason, qr.scanned_at,
               u.full_name as operator_name, iu.size,
               COALESCE(qr.line_number, po.line_number, 'Line 1') as line_number
        FROM qc_results qr
        JOIN item_units iu ON iu.id = qr.item_id
        LEFT JOIN production_orders po ON po.id = iu.production_order_id
        LEFT JOIN users u ON u.id = qr.operator_id
        WHERE iu.production_order_id = ?
          ${line ? "AND (qr.line_number = ? OR (qr.line_number IS NULL AND po.line_number LIKE ?))" : ""}
        ORDER BY qr.scanned_at DESC
      `).all(...(line ? [po.id, line, `%${line}%`] : [po.id])) as any[];

      const passCount = rows.filter(r => r.qc_result === 'PASS' && r.test_result === 'PASS').length;
      const failCount = rows.filter(r => r.qc_result === 'FAIL' || r.test_result === 'FAIL').length;

      return res.json({
        poId: po.id,
        poNumber: po.po_number,
        selectedLine: effectiveLine,
        operation: 'QC',
        summary: {
          total: rows.length,
          passCount,
          failCount,
          targetQuantity
        },
        records: rows
      });
    }

    if (operation === 'PACKING') {
      const boxRows = await db.prepare(`
        SELECT b.id, b.box_code, b.box_number, b.capacity, b.status, b.created_at, b.completed_at,
               COALESCE(b.line_number, po.line_number, 'Line 1') as line_number,
               (SELECT COUNT(*) FROM box_items bi WHERE bi.box_id = b.id) as item_count
        FROM boxes b
        LEFT JOIN production_orders po ON po.id = b.production_order_id
        WHERE b.production_order_id = ?
          ${line ? "AND (b.line_number = ? OR (b.line_number IS NULL AND po.line_number LIKE ?))" : ""}
        ORDER BY b.created_at DESC
      `).all(...(line ? [po.id, line, `%${line}%`] : [po.id])) as any[];

      const boxIds = boxRows.map(b => b.id);
      let itemsByBox: Record<string, string[]> = {};
      if (boxIds.length > 0) {
        const placeholders = boxIds.map(() => '?').join(',');
        const itemRows = await db.prepare(`
          SELECT bi.box_id, iu.qr_code
          FROM box_items bi
          JOIN item_units iu ON iu.id = bi.item_id
          WHERE bi.box_id IN (${placeholders})
          ORDER BY bi.packed_at ASC
        `).all(...boxIds) as any[];

        for (const ir of itemRows) {
          if (!itemsByBox[ir.box_id]) itemsByBox[ir.box_id] = [];
          itemsByBox[ir.box_id].push(ir.qr_code);
        }
      }

      const totalPackedUnits = boxRows.reduce((acc, b) => acc + Number(b.item_count || 0), 0);
      const records = boxRows.map(b => ({
        ...b,
        qrs: itemsByBox[b.id] || []
      }));

      return res.json({
        poId: po.id,
        poNumber: po.po_number,
        selectedLine: effectiveLine,
        operation: 'PACKING',
        summary: {
          totalBoxes: boxRows.length,
          totalPackedUnits,
          targetQuantity
        },
        records
      });
    }

    if (operation === 'AQL' || operation === 'FINAL_AQL' || operation === 'FINAL AQL') {
      const rows = await db.prepare(`
        SELECT ai.id, ai.box_id, b.box_code, b.box_number, ai.result, ai.failure_reason,
               ai.required_samples, ai.started_at, ai.completed_at,
               COALESCE(ai.line_number, b.line_number, po.line_number, 'Line 1') as line_number,
               u.full_name as inspector_name,
               (SELECT COUNT(*) FROM aql_samples WHERE inspection_id = ai.id) as sampled_count
        FROM aql_inspections ai
        JOIN boxes b ON b.id = ai.box_id
        LEFT JOIN production_orders po ON (po.id = ai.production_order_id OR po.id = b.production_order_id)
        LEFT JOIN users u ON u.id = ai.inspector_id
        WHERE (ai.production_order_id = ? OR b.production_order_id = ?)
          ${line ? "AND (ai.line_number = ? OR b.line_number = ? OR (ai.line_number IS NULL AND po.line_number LIKE ?))" : ""}
        ORDER BY COALESCE(ai.completed_at, ai.started_at) DESC
        LIMIT 200
      `).all(...(line ? [po.id, po.id, line, line, `%${line}%`] : [po.id, po.id])) as any[];

      const passCount = rows.filter(r => r.result === 'PASS').length;
      const failCount = rows.filter(r => r.result === 'FAIL').length;

      return res.json({
        poId: po.id,
        poNumber: po.po_number,
        selectedLine: effectiveLine,
        operation: 'AQL',
        summary: {
          total: rows.length,
          passCount,
          failCount,
          targetQuantity
        },
        records: rows
      });
    }

    return res.status(400).json({ error: 'INVALID_OPERATION', message: `Unsupported operation: ${operation}` });
  } catch (err) {
    next(err);
  }
});

export default router;
