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
    // 1. Total product count (total QC passed)
    const qcPassedRow = await db.prepare(`
      SELECT COUNT(DISTINCT item_id) as cnt FROM qc_results
      WHERE (qc_result = 'PASS' OR qc_result IS NULL) AND (test_result = 'PASS' OR test_result IS NULL)
    `).get() as any;
    
    const itemsPassedRow = await db.prepare(`
      SELECT COUNT(*) as cnt FROM item_units
      WHERE status IN ('QC_PASSED', 'PACKED', 'AQL_PASSED', 'IN_TRANSIT', 'COMPLETED')
    `).get() as any;

    const totalQcPassed = Math.max(qcPassedRow?.cnt || 0, itemsPassedRow?.cnt || 0);

    // 2. Packed (total packed items)
    const packedRow = await db.prepare(`SELECT COUNT(*) as cnt FROM box_items`).get() as any;
    const packedCount = packedRow?.cnt || 0;

    // 3. AQL Done count (total completed AQL inspections)
    const aqlDoneRow = await db.prepare(`
      SELECT COUNT(*) as cnt FROM aql_inspections
      WHERE result IN ('PASSED', 'FAILED')
    `).get() as any;
    const aqlDoneCount = aqlDoneRow?.cnt || 0;

    // 4. QC Fail count (total QC failure records logged)
    const qcFailRow = await db.prepare(`SELECT COUNT(*) as cnt FROM qc_fail_log`).get() as any;
    const qcFailCount = qcFailRow?.cnt || 0;

    // 5. AQL Failed count (total AQL inspections marked FAILED)
    const aqlFailedRow = await db.prepare(`
      SELECT COUNT(*) as cnt FROM aql_inspections
      WHERE result = 'FAILED'
    `).get() as any;
    const aqlFailedCount = aqlFailedRow?.cnt || 0;

    // 6. Total Fail count (QC Fail + AQL Failed)
    const totalFailCount = qcFailCount + aqlFailedCount;

    // 7. AQL Pass count (total AQL inspections marked PASSED)
    const aqlPassRow = await db.prepare(`
      SELECT COUNT(*) as cnt FROM aql_inspections
      WHERE result = 'PASSED'
    `).get() as any;
    const aqlPassCount = aqlPassRow?.cnt || 0;

    // 8. Pending Pack count (items that passed QC but are not packed into a box yet)
    const pendingPackRow = await db.prepare(`
      SELECT COUNT(*) as cnt FROM item_units
      WHERE status = 'QC_PASSED'
    `).get() as any;
    const pendingPackCount = pendingPackRow?.cnt || 0;

    return res.json({
      totalQcPassed,
      packedCount,
      aqlDoneCount,
      qcFailCount,
      aqlFailedCount,
      totalFailCount,
      aqlPassCount,
      pendingPackCount,
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
router.get('/dashboard/admin', authenticateToken, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const currentPosRow = await db.prepare(`SELECT COUNT(*) as cnt FROM production_orders WHERE status = 'CURRENT'`).get() as any;
    const currentPos = currentPosRow?.cnt || 0;

    const salesOrdersRow = await db.prepare(`SELECT COUNT(*) as cnt FROM sales_orders`).get() as any;
    const salesOrders = salesOrdersRow?.cnt || 0;

    const itemsProcessedRow = await db.prepare(`SELECT COUNT(*) as cnt FROM item_units`).get() as any;
    const itemsProcessed = itemsProcessedRow?.cnt || 0;

    const packedUnitsRow = await db.prepare(`SELECT COUNT(*) as cnt FROM box_items`).get() as any;
    const packedUnits = packedUnitsRow?.cnt || 0;

    // Quality Rates
    const totalQcRow = await db.prepare(`SELECT COUNT(*) as cnt FROM qc_results`).get() as any;
    const totalQc = totalQcRow?.cnt || 0;

    const passQcRow = await db.prepare(`SELECT COUNT(*) as cnt FROM qc_results WHERE qc_result = 'PASS'`).get() as any;
    const passQc = passQcRow?.cnt || 0;
    const qcPassRate = totalQc > 0 ? parseFloat(((passQc / totalQc) * 100).toFixed(1)) : 100;

    const totalTest = totalQc;
    const passTestRow = await db.prepare(`SELECT COUNT(*) as cnt FROM qc_results WHERE test_result = 'PASS'`).get() as any;
    const passTest = passTestRow?.cnt || 0;
    const testPassRate = totalTest > 0 ? parseFloat(((passTest / totalTest) * 100).toFixed(1)) : 100;

    const totalAqlRow = await db.prepare(`SELECT COUNT(*) as cnt FROM aql_inspections`).get() as any;
    const totalAql = totalAqlRow?.cnt || 0;

    const passAqlRow = await db.prepare(`SELECT COUNT(*) as cnt FROM aql_inspections WHERE result = 'PASSED'`).get() as any;
    const passAql = passAqlRow?.cnt || 0;
    const aqlPassRate = totalAql > 0 ? parseFloat(((passAql / totalAql) * 100).toFixed(1)) : 100;

    // Exceptions
    const qcFailedRow = await db.prepare(`SELECT COUNT(*) as cnt FROM qc_results WHERE qc_result = 'FAIL'`).get() as any;
    const qcFailed = qcFailedRow?.cnt || 0;

    const testFailedRow = await db.prepare(`SELECT COUNT(*) as cnt FROM qc_results WHERE test_result = 'FAIL'`).get() as any;
    const testFailed = testFailedRow?.cnt || 0;

    const aqlFailedRow = await db.prepare(`SELECT COUNT(*) as cnt FROM aql_inspections WHERE result = 'FAILED'`).get() as any;
    const aqlFailed = aqlFailedRow?.cnt || 0;

    const pendingPackRow = await db.prepare(`SELECT COUNT(*) as cnt FROM item_units WHERE status = 'QC_PASSED'`).get() as any;
    const pendingPack = pendingPackRow?.cnt || 0;

    return res.json({
      kpis: { currentPos, salesOrders, itemsProcessed, packedUnits },
      qualityRates: { qcPassRate, testPassRate, aqlPassRate },
      exceptions: { qcFailed, testFailed, aqlFailed, pendingPack }
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
