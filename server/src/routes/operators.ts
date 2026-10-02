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
    const operatorUsername = req.user!.username;
    const reqOp = (req.query.operation || '').toString().trim();

    // 1. Query active POs allocated to THIS operator in operator_work_assignments
    let poRows = await db.prepare(`
      SELECT DISTINCT po.*, owa.shift_id as owa_shift_id, owa.operation as owa_operation
      FROM operator_work_assignments owa
      JOIN production_orders po ON (po.id = owa.production_order_id OR po.id = (SELECT production_order_id FROM sales_orders WHERE id = owa.sales_order_id))
      WHERE (owa.operator_id = ? OR owa.operator_id = ?)
        AND owa.active = 1
        AND (po.status IS NULL OR UPPER(po.status) NOT IN ('COMPLETED', 'CANCELLED', 'ARCHIVED'))
      ORDER BY po.created_at DESC
    `).all(operatorId, operatorUsername) as any[];

    if (reqOp && poRows.length > 0) {
      const matchOp = (assignedOp: string, targetOp: string) => {
        if (!assignedOp || assignedOp.toUpperCase() === 'ALL') return true;
        const a = assignedOp.toUpperCase().replace(/[^A-Z]/g, '');
        const t = targetOp.toUpperCase().replace(/[^A-Z]/g, '');
        if (a === t) return true;
        if (a.includes('AQL') && t.includes('AQL')) return true;
        if (a.includes('QC') && t.includes('QC')) return true;
        if (a.includes('PACK') && t.includes('PACK')) return true;
        if (a.includes('TRANSFER') && t.includes('TRANSFER')) return true;
        return false;
      };

      poRows = poRows.filter(p => matchOp(p.owa_operation, reqOp));
    }

    // 2. Fallback: If no explicit work assignments exist for this operator, return all active CURRENT POs
    if (poRows.length === 0) {
      poRows = await db.prepare(`
        SELECT * FROM production_orders
        WHERE (status IS NULL OR UPPER(status) NOT IN ('COMPLETED', 'CANCELLED', 'ARCHIVED'))
        ORDER BY created_at DESC
      `).all() as any[];
    }

    const formattedPos = await Promise.all(poRows.map(po => formatProductionOrder(po, req.user)));
    let assignments = formattedPos.filter(Boolean);

    // Filter formatted POs by operation if specified
    if (reqOp) {
      assignments = assignments.filter((p): p is NonNullable<typeof p> => {
        if (!p) return false;
        if (!p.selectedOperations || p.selectedOperations.length === 0) return true;
        const targetClean = reqOp.toUpperCase().replace(/[^A-Z]/g, '');
        return p.selectedOperations.some((op: string) => {
          const opClean = op.toUpperCase().replace(/[^A-Z]/g, '');
          if (opClean === targetClean) return true;
          if (opClean.includes('AQL') && targetClean.includes('AQL')) return true;
          if (opClean.includes('QC') && targetClean.includes('QC')) return true;
          if (opClean.includes('PACK') && targetClean.includes('PACK')) return true;
          if (opClean.includes('TRANSFER') && targetClean.includes('TRANSFER')) return true;
          return false;
        });
      });
    }

    return res.json(assignments);
  } catch (err) {
    next(err);
  }
});

export default router;
