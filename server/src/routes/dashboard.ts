import { Router as ExpressRouter } from 'express';
import { db, ensureDbConnected } from '../db/connection.js';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth.js';

const router = ExpressRouter();

// GET /api/health
router.get('/health', async (req, res) => {
  try {
    const isConnected = await ensureDbConnected();
    if (isConnected) {
      return res.status(200).json({ status: 'ok', database: 'connected' });
    }
    return res.status(500).json({ status: 'error', database: 'disconnected' });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// GET /api/dashboard/operator
router.get('/dashboard/operator', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const rawPoId = (req.query.poId || req.query.poNumber || '').toString().trim();
    const operatorId = req.user?.id;
    const isOperatorRole = req.user?.role === 'OPERATOR';

    let po: any = null;
    if (rawPoId) {
      po = await db.prepare(`
        SELECT po.*, s.name as style_name, s.code as style_code 
        FROM production_orders po 
        LEFT JOIN styles s ON s.id = po.style_id 
        WHERE po.id = ? OR po.po_number = ?
      `).get(rawPoId, rawPoId) as any;
    }

    if (!po && isOperatorRole && operatorId) {
      po = await db.prepare(`
        SELECT po.*, s.name as style_name, s.code as style_code 
        FROM production_orders po 
        JOIN operator_work_assignments owa ON (owa.production_order_id = po.id OR owa.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = po.id))
        LEFT JOIN styles s ON s.id = po.style_id 
        WHERE (owa.operator_id = ? OR owa.operator_id = ?) AND owa.active = 1
        ORDER BY po.created_at DESC LIMIT 1
      `).get(operatorId, req.user?.username || operatorId) as any;
    }

    if (!po) {
      po = await db.prepare(`
        SELECT po.*, s.name as style_name, s.code as style_code 
        FROM production_orders po 
        LEFT JOIN styles s ON s.id = po.style_id 
        WHERE po.status = 'CURRENT'
        ORDER BY po.created_at DESC LIMIT 1
      `).get() as any;
    }

    const poId = po ? po.id : null;

    // 1. Target Quantity
    let targetQuantity = 500;
    if (poId) {
      const cfgQtyRow = await db.prepare(`SELECT SUM(quantity) as cnt FROM production_order_configs WHERE production_order_id = ?`).get(poId) as any;
      const soQtyRow = await db.prepare(`SELECT SUM(order_quantity) as cnt FROM sales_orders WHERE production_order_id = ?`).get(poId) as any;
      targetQuantity = Number(cfgQtyRow?.cnt || soQtyRow?.cnt || 500);
    }

    // 2. Total product count (QC Passed for PO)
    let totalQcPassed = 0;
    if (poId) {
      const qcPassedRow = await db.prepare(`
        SELECT COUNT(DISTINCT iu.id) as cnt FROM qc_results qr
        JOIN item_units iu ON iu.id = qr.item_id
        WHERE (iu.production_order_id = ? OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
          AND qr.qc_result = 'PASS' AND qr.test_result = 'PASS'
      `).get(poId, poId) as any;
      totalQcPassed = Number(qcPassedRow?.cnt || 0);
    } else {
      const qcPassedRow = await db.prepare(`SELECT COUNT(DISTINCT item_id) as cnt FROM qc_results WHERE qc_result = 'PASS' AND test_result = 'PASS'`).get() as any;
      totalQcPassed = Number(qcPassedRow?.cnt || 0);
    }

    // 3. Packed Count for PO
    let packedCount = 0;
    if (poId) {
      const packedRow = await db.prepare(`
        SELECT COUNT(DISTINCT bi.item_id) as cnt FROM box_items bi
        JOIN boxes b ON b.id = bi.box_id
        LEFT JOIN item_units iu ON iu.id = bi.item_id
        WHERE (b.production_order_id = ? OR iu.production_order_id = ? OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
          AND bi.active = 1
      `).get(poId, poId, poId) as any;
      packedCount = Number(packedRow?.cnt || 0);
    } else {
      const packedRow = await db.prepare(`SELECT COUNT(*) as cnt FROM box_items WHERE active = 1`).get() as any;
      packedCount = Number(packedRow?.cnt || 0);
    }

    // 4. AQL Done Count for PO
    let aqlDoneCount = 0;
    if (poId) {
      const aqlDoneRow = await db.prepare(`
        SELECT COUNT(*) as cnt FROM aql_inspections ai
        LEFT JOIN boxes b ON b.id = ai.box_id
        WHERE (ai.production_order_id = ? OR b.production_order_id = ?)
          AND UPPER(TRIM(ai.result)) IN ('PASS', 'PASSED', 'FAIL', 'FAILED')
      `).get(poId, poId) as any;
      aqlDoneCount = Number(aqlDoneRow?.cnt || 0);
    } else {
      const aqlDoneRow = await db.prepare(`SELECT COUNT(*) as cnt FROM aql_inspections WHERE UPPER(TRIM(result)) IN ('PASS', 'PASSED', 'FAIL', 'FAILED')`).get() as any;
      aqlDoneCount = Number(aqlDoneRow?.cnt || 0);
    }

    // 5. QC Fail Count for PO
    let qcFailCount = 0;
    if (poId) {
      const qcFailRow = await db.prepare(`
        SELECT COUNT(DISTINCT qf.item_id) as cnt FROM qc_fail_log qf
        LEFT JOIN item_units iu ON iu.id = qf.item_id
        WHERE iu.production_order_id = ? OR qf.po_id = ? OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?)
      `).get(poId, poId, poId) as any;
      qcFailCount = Number(qcFailRow?.cnt || 0);
    } else {
      const qcFailRow = await db.prepare(`SELECT COUNT(DISTINCT item_id) as cnt FROM qc_fail_log`).get() as any;
      qcFailCount = Number(qcFailRow?.cnt || 0);
    }

    // 6. AQL Failed Count for PO
    let aqlFailedCount = 0;
    if (poId) {
      const aqlFailedRow = await db.prepare(`
        SELECT COUNT(*) as cnt FROM aql_inspections ai
        LEFT JOIN boxes b ON b.id = ai.box_id
        WHERE (ai.production_order_id = ? OR b.production_order_id = ?)
          AND UPPER(TRIM(ai.result)) IN ('FAIL', 'FAILED')
      `).get(poId, poId) as any;
      aqlFailedCount = Number(aqlFailedRow?.cnt || 0);
    } else {
      const aqlFailedRow = await db.prepare(`SELECT COUNT(*) as cnt FROM aql_inspections WHERE UPPER(TRIM(result)) IN ('FAIL', 'FAILED')`).get() as any;
      aqlFailedCount = Number(aqlFailedRow?.cnt || 0);
    }

    // 7. AQL Pass Count for PO
    let aqlPassCount = 0;
    if (poId) {
      const aqlPassRow = await db.prepare(`
        SELECT COUNT(*) as cnt FROM aql_inspections ai
        LEFT JOIN boxes b ON b.id = ai.box_id
        WHERE (ai.production_order_id = ? OR b.production_order_id = ?)
          AND UPPER(TRIM(ai.result)) IN ('PASS', 'PASSED')
      `).get(poId, poId) as any;
      aqlPassCount = Number(aqlPassRow?.cnt || 0);
    } else {
      const aqlPassRow = await db.prepare(`SELECT COUNT(*) as cnt FROM aql_inspections WHERE UPPER(TRIM(result)) IN ('PASS', 'PASSED')`).get() as any;
      aqlPassCount = Number(aqlPassRow?.cnt || 0);
    }

    // 8. Total Fail Count & Pending Pack
    const totalFailCount = qcFailCount + aqlFailedCount;
    const pendingPackCount = Math.max(0, totalQcPassed - packedCount);

    return res.json({
      totalQcPassed,
      packedCount,
      aqlDoneCount,
      qcFailCount,
      aqlFailedCount,
      totalFailCount,
      aqlPassCount,
      pendingPackCount,
      poDetails: po ? {
        poId: po.id,
        poNumber: po.po_number,
        poName: po.po_name || null,
        styleName: po.style_name || po.style_code || 'Standard Style',
        styleCode: po.style_code || null,
        targetQuantity
      } : null,
      // Backward compatibility aliases
      qcPassedToday: totalQcPassed,
      packedToday: packedCount,
      pendingCount: pendingPackCount,
      failCount: totalFailCount
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/supervisor
router.get('/dashboard/supervisor', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req, res, next) => {
  try {
    const currentPosRow = await db.prepare(`SELECT COUNT(*) as cnt FROM production_orders WHERE status = 'CURRENT' OR status = 'DRAFT'`).get() as any;
    const currentPosCount = currentPosRow?.cnt || 0;

    const totalSosRow = await db.prepare(`
      SELECT COUNT(*) as cnt FROM sales_orders so
      JOIN production_orders po ON po.id = so.production_order_id
      WHERE po.status = 'CURRENT' OR po.status = 'DRAFT'
    `).get() as any;
    const totalSosCount = totalSosRow?.cnt || 0;

    const processedRow = await db.prepare(`
      SELECT COUNT(DISTINCT item_id) as cnt FROM (
        SELECT item_id FROM qc_results WHERE DATE(scanned_at) = CURDATE()
        UNION
        SELECT item_id FROM box_items WHERE DATE(packed_at) = CURDATE()
        UNION
        SELECT id as item_id FROM item_units WHERE DATE(created_at) = CURDATE()
      ) as today_events
    `).get() as any;
    const processedToday = processedRow?.cnt || 0;

    return res.json({
      currentPosCount,
      totalSosCount,
      processedToday,
      assignedLines: ['Line 04', 'Line 02']
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/admin
router.get('/dashboard/admin', authenticateToken, requireRole(['ADMIN', 'SUPERVISOR']), async (req: AuthRequest, res, next) => {
  try {
    const { poId, styleName } = req.query as { poId?: string; styleName?: string };

    // Fetch filter dropdown options
    const stylesList = await db.prepare(`
      SELECT DISTINCT style_name 
      FROM production_orders 
      WHERE style_name IS NOT NULL AND TRIM(style_name) != '' 
      ORDER BY style_name ASC
    `).all() as any[];
    const availableStyles = stylesList.map(s => s.style_name);

    const posList = await db.prepare(`
      SELECT id, po_number, style_name 
      FROM production_orders 
      ORDER BY created_at DESC
    `).all() as any[];

    // Target PO condition for SQL queries
    let poIdsTarget: string[] = [];
    if (poId && poId.trim()) {
      const match = await db.prepare(`SELECT id FROM production_orders WHERE id = ? OR po_number = ?`).get(poId.trim(), poId.trim()) as any;
      if (match) poIdsTarget = [match.id];
    } else if (styleName && styleName.trim()) {
      const matches = await db.prepare(`SELECT id FROM production_orders WHERE UPPER(TRIM(style_name)) = ?`).all(styleName.trim().toUpperCase()) as any[];
      poIdsTarget = matches.map(m => m.id);
    }

    const filterActive = poIdsTarget.length > 0;

    // 1. Executive KPIs
    let currentPosQuery = `SELECT COUNT(*) as cnt FROM production_orders WHERE status = 'CURRENT'`;
    let totalPosQuery = `SELECT COUNT(*) as cnt FROM production_orders`;
    let itemsProcessedQuery = `SELECT COUNT(*) as cnt FROM item_units`;
    let packedUnitsQuery = `SELECT COUNT(*) as cnt FROM box_items bi JOIN boxes b ON b.id = bi.box_id WHERE bi.active = 1`;
    let scrappedQuery = `SELECT COUNT(*) as cnt FROM permanently_removed_items`;
    let boxesQuery = `SELECT COUNT(*) as cnt FROM boxes`;

    if (filterActive) {
      const placeholders = poIdsTarget.map(() => '?').join(',');
      currentPosQuery += ` AND id IN (${placeholders})`;
      totalPosQuery += ` WHERE id IN (${placeholders})`;
      itemsProcessedQuery += ` WHERE production_order_id IN (${placeholders}) OR sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))`;
      packedUnitsQuery += ` AND b.production_order_id IN (${placeholders})`;
      scrappedQuery += ` WHERE production_order_id IN (${placeholders})`;
      boxesQuery += ` WHERE production_order_id IN (${placeholders})`;
    }

    const currentPosRow = await db.prepare(currentPosQuery).get(...(filterActive ? poIdsTarget : [])) as any;
    const totalPosRow = await db.prepare(totalPosQuery).get(...(filterActive ? poIdsTarget : [])) as any;
    const salesOrdersRow = await db.prepare(`SELECT COUNT(*) as cnt FROM sales_orders`).get() as any;
    const itemsProcessedRow = await db.prepare(itemsProcessedQuery).get(...(filterActive ? [...poIdsTarget, ...poIdsTarget] : [])) as any;
    const packedUnitsRow = await db.prepare(packedUnitsQuery).get(...(filterActive ? poIdsTarget : [])) as any;
    const totalBoxesRow = await db.prepare(boxesQuery).get(...(filterActive ? poIdsTarget : [])) as any;
    const boxTransfersRow = await db.prepare(`SELECT COUNT(*) as cnt FROM box_transfers`).get() as any;
    const scrappedRow = await db.prepare(scrappedQuery).get(...(filterActive ? poIdsTarget : [])) as any;
    const activeOperatorsRow = await db.prepare(`SELECT COUNT(DISTINCT operator_id) as cnt FROM operator_work_assignments WHERE active = 1`).get() as any;

    // 2. Quality Rates
    let totalQcQuery = `SELECT COUNT(*) as cnt FROM qc_results qr JOIN item_units iu ON iu.id = qr.item_id`;
    let passQcQuery = `SELECT COUNT(*) as cnt FROM qc_results qr JOIN item_units iu ON iu.id = qr.item_id WHERE qr.qc_result = 'PASS'`;
    let passTestQuery = `SELECT COUNT(*) as cnt FROM qc_results qr JOIN item_units iu ON iu.id = qr.item_id WHERE qr.test_result = 'PASS'`;
    let totalAqlQuery = `SELECT COUNT(*) as cnt FROM aql_inspections ai`;
    let passAqlQuery = `SELECT COUNT(*) as cnt FROM aql_inspections ai WHERE ai.result = 'PASSED'`;

    if (filterActive) {
      const placeholders = poIdsTarget.map(() => '?').join(',');
      totalQcQuery += ` WHERE iu.production_order_id IN (${placeholders}) OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))`;
      passQcQuery += ` AND (iu.production_order_id IN (${placeholders}) OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders})))`;
      passTestQuery += ` AND (iu.production_order_id IN (${placeholders}) OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders})))`;
      totalAqlQuery += ` WHERE ai.production_order_id IN (${placeholders})`;
      passAqlQuery += ` AND ai.production_order_id IN (${placeholders})`;
    }

    const totalQcRow = await db.prepare(totalQcQuery).get(...(filterActive ? [...poIdsTarget, ...poIdsTarget] : [])) as any;
    const passQcRow = await db.prepare(passQcQuery).get(...(filterActive ? [...poIdsTarget, ...poIdsTarget] : [])) as any;
    const passTestRow = await db.prepare(passTestQuery).get(...(filterActive ? [...poIdsTarget, ...poIdsTarget] : [])) as any;

    const totalAqlRow = await db.prepare(totalAqlQuery).get(...(filterActive ? poIdsTarget : [])) as any;
    const passAqlRow = await db.prepare(passAqlQuery).get(...(filterActive ? poIdsTarget : [])) as any;

    const totalQc = totalQcRow?.cnt || 0;
    const passQc = passQcRow?.cnt || 0;
    const passTest = passTestRow?.cnt || 0;
    const totalAql = totalAqlRow?.cnt || 0;
    const passAql = passAqlRow?.cnt || 0;

    const qcPassRate = totalQc > 0 ? parseFloat(((passQc / totalQc) * 100).toFixed(1)) : 100;
    const testPassRate = totalQc > 0 ? parseFloat(((passTest / totalQc) * 100).toFixed(1)) : 100;
    const aqlPassRate = totalAql > 0 ? parseFloat(((passAql / totalAql) * 100).toFixed(1)) : 100;
    const overallQualityIndex = parseFloat(((qcPassRate * 0.4 + testPassRate * 0.3 + aqlPassRate * 0.3)).toFixed(1));

    // Exceptions
    let qcFailedQuery = `SELECT COUNT(*) as cnt FROM qc_results qr JOIN item_units iu ON iu.id = qr.item_id WHERE qr.qc_result = 'FAIL'`;
    let testFailedQuery = `SELECT COUNT(*) as cnt FROM qc_results qr JOIN item_units iu ON iu.id = qr.item_id WHERE qr.test_result = 'FAIL'`;
    let aqlFailedQuery = `SELECT COUNT(*) as cnt FROM aql_inspections ai WHERE ai.result = 'FAILED'`;
    let pendingPackQuery = `SELECT COUNT(*) as cnt FROM item_units WHERE status = 'QC_PASSED'`;

    if (filterActive) {
      const placeholders = poIdsTarget.map(() => '?').join(',');
      qcFailedQuery += ` AND (iu.production_order_id IN (${placeholders}) OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders})))`;
      testFailedQuery += ` AND (iu.production_order_id IN (${placeholders}) OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders})))`;
      aqlFailedQuery += ` AND ai.production_order_id IN (${placeholders})`;
      pendingPackQuery += ` AND (production_order_id IN (${placeholders}) OR sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders})))`;
    }

    const qcFailedRow = await db.prepare(qcFailedQuery).get(...(filterActive ? [...poIdsTarget, ...poIdsTarget] : [])) as any;
    const testFailedRow = await db.prepare(testFailedQuery).get(...(filterActive ? [...poIdsTarget, ...poIdsTarget] : [])) as any;
    const aqlFailedRow = await db.prepare(aqlFailedQuery).get(...(filterActive ? poIdsTarget : [])) as any;
    const pendingPackRow = await db.prepare(pendingPackQuery).get(...(filterActive ? [...poIdsTarget, ...poIdsTarget] : [])) as any;

    // Live Production Orders Summary
    let poWhereClause = '';
    if (filterActive) {
      const placeholders = poIdsTarget.map(() => '?').join(',');
      poWhereClause = `WHERE po.id IN (${placeholders})`;
    }

    const activeProductionOrders = await db.prepare(`
      SELECT 
        po.id, po.po_number, po.style_name, po.total_quantity, po.status, po.created_at,
        (SELECT COUNT(DISTINCT bi.item_id) FROM box_items bi JOIN boxes b ON b.id = bi.box_id LEFT JOIN item_units iu ON iu.id = bi.item_id WHERE (b.production_order_id = po.id OR iu.production_order_id = po.id OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = po.id)) AND bi.active = 1) as packed_count,
        (SELECT COUNT(id) FROM aql_inspections WHERE production_order_id = po.id AND result = 'PASSED') as aql_passed_boxes,
        (SELECT COUNT(id) FROM permanently_removed_items WHERE production_order_id = po.id) as scrapped_count
      FROM production_orders po
      ${poWhereClause}
      ORDER BY po.created_at DESC
      LIMIT 15
    `).all(...(filterActive ? poIdsTarget : [])) as any[];

    // Recent Scrapped Items Log
    let scrappedWhereClause = '';
    if (filterActive) {
      const placeholders = poIdsTarget.map(() => '?').join(',');
      scrappedWhereClause = `WHERE prm.production_order_id IN (${placeholders})`;
    }

    const recentScrapped = await db.prepare(`
      SELECT prm.*, u.full_name as operator_name
      FROM permanently_removed_items prm
      LEFT JOIN users u ON u.id = prm.removed_by
      ${scrappedWhereClause}
      ORDER BY prm.removed_at DESC
      LIMIT 10
    `).all(...(filterActive ? poIdsTarget : [])) as any[];

    // Recent Audit Logs
    const recentAuditLogs = await db.prepare(`
      SELECT al.*, u.full_name as user_name, u.role as user_role
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.user_id
      ORDER BY al.timestamp DESC
      LIMIT 8
    `).all() as any[];

    return res.json({
      filter: {
        poId: poId || null,
        styleName: styleName || null,
        availableStyles,
        availablePos: posList
      },
      kpis: {
        currentPos: currentPosRow?.cnt || 0,
        totalPos: totalPosRow?.cnt || 0,
        salesOrders: salesOrdersRow?.cnt || 0,
        itemsProcessed: itemsProcessedRow?.cnt || 0,
        packedUnits: packedUnitsRow?.cnt || 0,
        totalBoxes: totalBoxesRow?.cnt || 0,
        boxTransfers: boxTransfersRow?.cnt || 0,
        scrappedUnits: scrappedRow?.cnt || 0,
        activeOperators: activeOperatorsRow?.cnt || 0,
        overallQualityIndex
      },
      qualityRates: { qcPassRate, testPassRate, aqlPassRate, totalQc, totalAql, passQc, passAql },
      exceptions: {
        qcFailed: qcFailedRow?.cnt || 0,
        testFailed: testFailedRow?.cnt || 0,
        aqlFailed: aqlFailedRow?.cnt || 0,
        pendingPack: pendingPackRow?.cnt || 0,
        scrappedCount: scrappedRow?.cnt || 0
      },
      activeProductionOrders,
      recentScrapped,
      recentAuditLogs
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/alerts
router.get('/alerts', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const userRole = req.user!.role;
    const userId = req.user!.id;

    const alerts = await db.prepare(`
      SELECT * FROM alerts
      WHERE user_id = ? OR role_target = ? OR role_target = 'ALL'
      ORDER BY created_at DESC
    `).all(userId, userRole);

    const formatted = alerts.map((a: any) => ({
      id: a.id,
      type: a.category.toLowerCase(),
      title: a.title,
      message: a.message,
      time: 'Just now',
      read: !!a.read_at,
      iconName: a.category === 'QUALITY' ? 'CircleCheck' : a.category === 'WORK' ? 'Package' : 'Bell'
    }));

    return res.json(formatted);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/alerts/:id/read
router.patch('/alerts/:id/read', authenticateToken, async (req, res, next) => {
  try {
    await db.prepare(`UPDATE alerts SET read_at = NOW(3) WHERE id = ?`).run(req.params.id);
    return res.json({ message: 'Alert marked as read' });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/production?range=today|week|month
router.get('/reports/production', authenticateToken, async (req, res, next) => {
  try {
    const range = req.query.range || 'today';

    const lines = await db.prepare(`SELECT * FROM production_lines`).all() as any[];
    const lineBreakdown = await Promise.all(lines.map(async line => {
      const packedRow = await db.prepare(`
        SELECT COUNT(*) as cnt FROM box_items bi
        JOIN boxes b ON b.id = bi.box_id
        JOIN sales_orders so ON so.id = b.sales_order_id
        WHERE so.line_id = ?
      `).get(line.id) as any;
      const packed = packedRow?.cnt || 0;

      const totalQcRow = await db.prepare(`
        SELECT COUNT(*) as cnt FROM qc_results qr
        JOIN item_units iu ON iu.id = qr.item_id
        JOIN sales_orders so ON so.id = iu.sales_order_id
        WHERE so.line_id = ?
      `).get(line.id) as any;
      const totalQcLine = totalQcRow?.cnt || 0;

      const passQcRow = await db.prepare(`
        SELECT COUNT(*) as cnt FROM qc_results qr
        JOIN item_units iu ON iu.id = qr.item_id
        JOIN sales_orders so ON so.id = iu.sales_order_id
        WHERE so.line_id = ? AND qr.qc_result = 'PASS'
      `).get(line.id) as any;
      const passQcLine = passQcRow?.cnt || 0;

      const passRate = totalQcLine > 0 ? ((passQcLine / totalQcLine) * 100).toFixed(1) + '%' : '100%';

      return {
        lineId: line.name,
        packed,
        qcPassRate: passRate,
        efficiency: packed > 0 ? '98%' : '100%'
      };
    }));

    return res.json({
      range,
      velocityVariance: '+0% vs Target',
      lineBreakdown
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/db-view - View all MySQL database tables & contents
router.get('/db-view', async (req, res, next) => {
  try {
    const tables = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = ?`,
      [process.env.DB_NAME || 'uniflow_ops']
    );
    const result: Record<string, { count: number; rows: any[] }> = {};

    for (const table of tables) {
      const name = table.table_name;
      const countRow = await db.prepare(`SELECT COUNT(*) as cnt FROM \`${name}\``).get() as any;
      const count = countRow?.cnt || 0;
      const rows = await db.prepare(`SELECT * FROM \`${name}\` LIMIT 25`).all();
      result[name] = { count, rows };
    }

    return res.json({
      database: `MySQL (${process.env.DB_NAME || 'uniflow_ops'})`,
      tablesCount: tables.length,
      tables: result
    });
  } catch (err) {
    next(err);
  }
});

export default router;
