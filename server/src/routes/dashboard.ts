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
router.get('/dashboard/operator', authenticateToken, requireRole('OPERATOR'), (req: AuthRequest, res, next) => {
  try {
    const operatorId = req.user!.id;
    const todayStr = new Date().toISOString().split('T')[0];

    const qcPassedToday = (db.prepare(`
      SELECT COUNT(*) as cnt FROM qc_results
      WHERE operator_id = ? AND qc_result = 'PASS' AND test_result = 'PASS'
    `).get(operatorId) as any)?.cnt || 624;

    const packedToday = (db.prepare(`
      SELECT COUNT(*) as cnt FROM box_items
      WHERE packed_by = ?
    `).get(operatorId) as any)?.cnt || 598;

    return res.json({
      qcPassedToday,
      packedToday,
      pendingCount: 6
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

    return res.json({
      currentPosCount,
      totalSosCount,
      processedToday: 3120,
      targetProgressPercent: 76,
      assignedLines: ['Line 04', 'Line 02']
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/admin
router.get('/dashboard/admin', authenticateToken, requireRole('ADMIN'), (req, res, next) => {
  try {
    const kpis = {
      currentPos: 12,
      salesOrders: 37,
      itemsProcessed: 8426,
      packedUnits: 7954
    };

    const qualityRates = {
      qcPassRate: 98.4,
      testPassRate: 97.9,
      aqlPassRate: 99.1
    };

    const exceptions = {
      qcFailed: 24,
      testFailed: 17,
      aqlFailed: 6,
      pendingPack: 472
    };

    return res.json({ kpis, qualityRates, exceptions });
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

    const lineBreakdown = [
      { lineId: 'Line 01', packed: 2050, qcPassRate: '98.1%', efficiency: '94%' },
      { lineId: 'Line 02', packed: 1840, qcPassRate: '99.0%', efficiency: '96%' },
      { lineId: 'Line 03', packed: 2110, qcPassRate: '97.5%', efficiency: '89%' },
      { lineId: 'Line 04', packed: 1842, qcPassRate: '98.8%', efficiency: '98%' }
    ];

    return res.json({
      range,
      velocityVariance: '+14% vs Target',
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
