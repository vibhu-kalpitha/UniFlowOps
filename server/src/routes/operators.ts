import { Router as ExpressRouter } from 'express';
import { db } from '../db/connection.js';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth.js';
import { formatProductionOrder } from './production.js';

const router = ExpressRouter();

// GET /api/operators/me/current-work
router.get('/current-work', authenticateToken, requireRole('OPERATOR'), async (req: AuthRequest, res, next) => {
  try {
    const operatorId = req.user!.id;

    // Find active PO assigned to THIS operator in operator_work_assignments
    const poRow = await db.prepare(`
      SELECT DISTINCT po.*, owa.shift_id as owa_shift_id
      FROM production_orders po
      JOIN operator_work_assignments owa ON (owa.production_order_id = po.id OR owa.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = po.id))
      WHERE owa.operator_id = ? AND owa.active = 1 AND po.status = 'CURRENT'
      ORDER BY po.created_at DESC
      LIMIT 1
    `).get(operatorId) as any;

    if (!poRow) {
      return res.json({
        hasAssignment: false,
        message: 'No active production order allocated to you in operator_work_assignments.'
      });
    }

    const formattedPo = await formatProductionOrder(poRow, req.user);
    const shiftRow = poRow.owa_shift_id ? await db.prepare(`SELECT * FROM shifts WHERE id = ?`).get(poRow.owa_shift_id) as any : null;

    return res.json({
      hasAssignment: true,
      activeJob: {
        productionOrder: formattedPo,
        shift: {
          id: shiftRow?.id || 'shift-c',
          shiftCode: shiftRow?.code || 'C',
          startTime: shiftRow?.start_time || '14:00',
          endTime: shiftRow?.end_time || '18:00'
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/operators/me/assignments
router.get('/assignments', authenticateToken, requireRole('OPERATOR'), async (req: AuthRequest, res, next) => {
  try {
    const operatorId = req.user!.id;
    const operatorUsername = req.user!.username || operatorId;
    const reqOp = (req.query.operation || '').toString().trim();

    const matchOp = (assignedOp: string, targetOp: string) => {
      if (!assignedOp || assignedOp.toUpperCase() === 'ALL') return true;
      const a = assignedOp.toUpperCase().replace(/[^A-Z]/g, '');
      const t = targetOp.toUpperCase().replace(/[^A-Z]/g, '');
      if (a === t) return true;
      if (a.includes('PRE') || t.includes('PRE')) return a.includes('PRE') && t.includes('PRE');
      if (t.includes('FINAL') || a.includes('FINAL')) {
        return t.includes('FINAL') && a.includes('FINAL');
      }
      if (a.includes('AQL') && t.includes('AQL')) {
        return !a.includes('FINAL') && !t.includes('FINAL');
      }
      if (a.includes('QC') && t.includes('QC')) return true;
      if (a.includes('PACK') && t.includes('PACK')) return true;
      if (a.includes('TRANSFER') && t.includes('TRANSFER')) return true;
      return false;
    };

    // 1. Fetch all active assignments for this operator
    const owaRows = await db.prepare(`
      SELECT owa.production_order_id, owa.sales_order_id, owa.operation, owa.shift_id
      FROM operator_work_assignments owa
      WHERE (owa.operator_id = ? OR owa.operator_id = ?) AND owa.active = 1
    `).all(operatorId, operatorUsername) as any[];

    if (owaRows.length === 0) {
      return res.json([]);
    }

    // 2. Resolve PO IDs (in case they were assigned via SO)
    const poIdsToOps = new Map<string, Set<string>>();
    
    // We need to fetch sales_orders if necessary
    const soIds = owaRows.filter(r => r.sales_order_id && !r.production_order_id).map(r => r.sales_order_id);
    let soMap = new Map<string, string>();
    if (soIds.length > 0) {
      const placeholders = soIds.map(() => '?').join(',');
      const sos = await db.prepare(`SELECT id, production_order_id FROM sales_orders WHERE id IN (${placeholders})`).all(...soIds) as any[];
      for (const so of sos) {
        if (so.production_order_id) soMap.set(so.id, so.production_order_id);
      }
    }

    for (const row of owaRows) {
      let poId = row.production_order_id;
      if (!poId && row.sales_order_id) {
        poId = soMap.get(row.sales_order_id);
      }
      if (poId) {
        if (!poIdsToOps.has(poId)) {
          poIdsToOps.set(poId, new Set<string>());
        }
        poIdsToOps.get(poId)!.add(row.operation);
      }
    }

    // 3. Filter POs by operation if requested
    let validPoIds = Array.from(poIdsToOps.keys());
    if (reqOp) {
      validPoIds = validPoIds.filter(poId => {
        const ops = poIdsToOps.get(poId)!;
        return Array.from(ops).some(op => matchOp(op, reqOp));
      });
    }

    if (validPoIds.length === 0) {
      return res.json([]);
    }

    // 4. Fetch actual Production Orders
    const placeholders = validPoIds.map(() => '?').join(',');
    const poRows = await db.prepare(`
      SELECT * FROM production_orders 
      WHERE id IN (${placeholders}) 
        AND (status IS NULL OR UPPER(status) NOT IN ('COMPLETED', 'CANCELLED', 'ARCHIVED'))
      ORDER BY created_at DESC
    `).all(...validPoIds) as any[];

    // 5. Format them
    const formattedPos = await Promise.all(poRows.map(po => formatProductionOrder(po, req.user)));
    let assignments = formattedPos.filter((p): p is NonNullable<typeof p> => Boolean(p));

    return res.json(assignments);
  } catch (err) {
    next(err);
  }
});

export default router;
