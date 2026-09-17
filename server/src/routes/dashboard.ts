import { Router as ExpressRouter } from 'express';
import { db } from '../db/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';

const router = ExpressRouter();

// GET /api/health
router.get('/health', (req, res) => {
  try {
    const row = db.prepare(`SELECT 1 as alive`).get() as any;
    if (row && row.alive === 1) {
      return res.json({ status: 'OK', database: 'SQLite Connected (WAL Mode)', timestamp: new Date().toISOString() });
    }
    return res.status(500).json({ status: 'ERROR', database: 'Unresponsive' });
  } catch (err: any) {
    return res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// GET /api/dashboard/operator
router.get('/dashboard/operator', authenticateToken, (req: AuthRequest, res, next) => {
  try {
    // 1. Total product count (total QC passed)
    const totalQcPassed = Math.max(
      (db.prepare(`
        SELECT COUNT(DISTINCT item_id) as cnt FROM qc_results
        WHERE (qc_result = 'PASS' OR qc_result IS NULL) AND (test_result = 'PASS' OR test_result IS NULL)
      `).get() as any)?.cnt || 0,
      (db.prepare(`
        SELECT COUNT(*) as cnt FROM item_units
        WHERE status IN ('QC_PASSED', 'PACKED', 'AQL_PASSED', 'IN_TRANSIT', 'COMPLETED')
      `).get() as any)?.cnt || 0
    );

    // 2. Packed (total packed items)
    const packedCount = (db.prepare(`
      SELECT COUNT(*) as cnt FROM box_items
    `).get() as any)?.cnt || 0;

    // 3. AQL Done count (total completed AQL inspections)
    const aqlDoneCount = (db.prepare(`
      SELECT COUNT(*) as cnt FROM aql_inspections
      WHERE result IN ('PASSED', 'FAILED')
    `).get() as any)?.cnt || 0;

    // 4. QC Fail count (total QC failure records logged)
    const qcFailCount = (db.prepare(`
      SELECT COUNT(*) as cnt FROM qc_fail_log
    `).get() as any)?.cnt || 0;

    // 5. AQL Failed count (total AQL inspections marked FAILED)
    const aqlFailedCount = (db.prepare(`
      SELECT COUNT(*) as cnt FROM aql_inspections
      WHERE result = 'FAILED'
    `).get() as any)?.cnt || 0;

    // 6. Total Fail count (QC Fail + AQL Failed)
    const totalFailCount = qcFailCount + aqlFailedCount;

    // 7. AQL Pass count (total AQL inspections marked PASSED)
    const aqlPassCount = (db.prepare(`
      SELECT COUNT(*) as cnt FROM aql_inspections
      WHERE result = 'PASSED'
    `).get() as any)?.cnt || 0;

    // 8. Pending Pack count (items that passed QC but are not packed into a box yet)
    const pendingPackCount = (db.prepare(`
      SELECT COUNT(*) as cnt FROM item_units
      WHERE status = 'QC_PASSED'
    `).get() as any)?.cnt || 0;

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
router.get('/dashboard/supervisor', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), (req, res, next) => {
  try {
    const currentPosCount = (db.prepare(`SELECT COUNT(*) as cnt FROM production_orders WHERE status = 'CURRENT'`).get() as any)?.cnt || 0;
    const totalSosCount = (db.prepare(`SELECT COUNT(*) as cnt FROM sales_orders`).get() as any)?.cnt || 0;
    const processedToday = (db.prepare(`SELECT COUNT(*) as cnt FROM item_units`).get() as any)?.cnt || 0;
    const packedCount = (db.prepare(`SELECT COUNT(*) as cnt FROM box_items`).get() as any)?.cnt || 0;
    const targetQty = (db.prepare(`SELECT SUM(order_quantity) as total FROM sales_orders`).get() as any)?.total || 0;
    const targetProgressPercent = targetQty > 0 ? Math.min(100, Math.round((packedCount / targetQty) * 100)) : 0;

    return res.json({
      currentPosCount,
      totalSosCount,
      processedToday,
      targetProgressPercent,
      assignedLines: ['Line 04', 'Line 02']
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/admin
router.get('/dashboard/admin', authenticateToken, requireRole('ADMIN'), (req, res, next) => {
  try {
    const currentPos = (db.prepare(`SELECT COUNT(*) as cnt FROM production_orders WHERE status = 'CURRENT'`).get() as any)?.cnt || 0;
    const salesOrders = (db.prepare(`SELECT COUNT(*) as cnt FROM sales_orders`).get() as any)?.cnt || 0;
    const itemsProcessed = (db.prepare(`SELECT COUNT(*) as cnt FROM item_units`).get() as any)?.cnt || 0;
    const packedUnits = (db.prepare(`SELECT COUNT(*) as cnt FROM box_items`).get() as any)?.cnt || 0;

    // Quality Rates
    const totalQc = (db.prepare(`SELECT COUNT(*) as cnt FROM qc_results`).get() as any)?.cnt || 0;
    const passQc = (db.prepare(`SELECT COUNT(*) as cnt FROM qc_results WHERE qc_result = 'PASS'`).get() as any)?.cnt || 0;
    const qcPassRate = totalQc > 0 ? parseFloat(((passQc / totalQc) * 100).toFixed(1)) : 100;

    const totalTest = totalQc;
    const passTest = (db.prepare(`SELECT COUNT(*) as cnt FROM qc_results WHERE test_result = 'PASS'`).get() as any)?.cnt || 0;
    const testPassRate = totalTest > 0 ? parseFloat(((passTest / totalTest) * 100).toFixed(1)) : 100;

    const totalAql = (db.prepare(`SELECT COUNT(*) as cnt FROM aql_inspections`).get() as any)?.cnt || 0;
    const passAql = (db.prepare(`SELECT COUNT(*) as cnt FROM aql_inspections WHERE result = 'PASSED'`).get() as any)?.cnt || 0;
    const aqlPassRate = totalAql > 0 ? parseFloat(((passAql / totalAql) * 100).toFixed(1)) : 100;

    // Exceptions
    const qcFailed = (db.prepare(`SELECT COUNT(*) as cnt FROM qc_results WHERE qc_result = 'FAIL'`).get() as any)?.cnt || 0;
    const testFailed = (db.prepare(`SELECT COUNT(*) as cnt FROM qc_results WHERE test_result = 'FAIL'`).get() as any)?.cnt || 0;
    const aqlFailed = (db.prepare(`SELECT COUNT(*) as cnt FROM aql_inspections WHERE result = 'FAILED'`).get() as any)?.cnt || 0;
    const pendingPack = (db.prepare(`SELECT COUNT(*) as cnt FROM item_units WHERE status = 'QC_PASSED'`).get() as any)?.cnt || 0;

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
router.get('/alerts', authenticateToken, (req: AuthRequest, res, next) => {
  try {
    const userRole = req.user!.role;
    const userId = req.user!.id;

    const alerts = db.prepare(`
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
router.patch('/alerts/:id/read', authenticateToken, (req, res, next) => {
  try {
    const now = new Date().toISOString();
    db.prepare(`UPDATE alerts SET read_at = ? WHERE id = ?`).run(now, req.params.id);
    return res.json({ message: 'Alert marked as read' });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/production?range=today|week|month
router.get('/reports/production', authenticateToken, (req, res, next) => {
  try {
    const range = req.query.range || 'today';

    const lines = db.prepare(`SELECT * FROM production_lines`).all() as any[];
    const lineBreakdown = lines.map(line => {
      const packed = (db.prepare(`
        SELECT COUNT(*) as cnt FROM box_items bi
        JOIN boxes b ON b.id = bi.box_id
        JOIN sales_orders so ON so.id = b.sales_order_id
        WHERE so.line_id = ?
      `).get(line.id) as any)?.cnt || 0;

      const totalQcLine = (db.prepare(`
        SELECT COUNT(*) as cnt FROM qc_results qr
        JOIN item_units iu ON iu.id = qr.item_id
        JOIN sales_orders so ON so.id = iu.sales_order_id
        WHERE so.line_id = ?
      `).get(line.id) as any)?.cnt || 0;

      const passQcLine = (db.prepare(`
        SELECT COUNT(*) as cnt FROM qc_results qr
        JOIN item_units iu ON iu.id = qr.item_id
        JOIN sales_orders so ON so.id = iu.sales_order_id
        WHERE so.line_id = ? AND qr.qc_result = 'PASS'
      `).get(line.id) as any)?.cnt || 0;

      const passRate = totalQcLine > 0 ? ((passQcLine / totalQcLine) * 100).toFixed(1) + '%' : '100%';

      return {
        lineId: line.name,
        packed,
        qcPassRate: passRate,
        efficiency: packed > 0 ? '98%' : '100%'
      };
    });

    return res.json({
      range,
      velocityVariance: '+0% vs Target',
      lineBreakdown
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/db-view - View all SQLite database tables & contents
router.get('/db-view', (req, res, next) => {
  try {
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[];
    const result: Record<string, { count: number; rows: any[] }> = {};

    for (const table of tables) {
      const count = (db.prepare(`SELECT COUNT(*) as cnt FROM "${table.name}"`).get() as any)?.cnt || 0;
      const rows = db.prepare(`SELECT * FROM "${table.name}" LIMIT 25`).all();
      result[table.name] = { count, rows };
    }

    return res.json({
      database: 'SQLite (server/data/uniflow.db)',
      tablesCount: tables.length,
      tables: result
    });
  } catch (err) {
    next(err);
  }
});

export default router;
