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

// GET /api/operators/me/assignments?operation=...
router.get('/assignments', authenticateToken, requireRole('OPERATOR'), async (req: AuthRequest, res, next) => {
  try {
    const operatorId = req.user!.id;
    const operatorUsername = req.user!.username;
    const { operation } = req.query;

    let dbOp = '';
    let dbOpAlt = '';
    if (operation) {
      const opStr = String(operation).trim().toUpperCase();
      if (opStr === 'QC TEST' || opStr === 'QC' || opStr === 'TEST' || opStr === 'QC_TEST') {
        dbOp = 'QC_TEST';
        dbOpAlt = 'QC Test';
      } else if (opStr === 'PACKING' || opStr === 'PACK') {
        dbOp = 'PACKING';
        dbOpAlt = 'Packing';
      } else if (opStr === 'AQL CHECKER' || opStr === 'AQL') {
        dbOp = 'AQL';
        dbOpAlt = 'AQL Checker';
      } else if (opStr === 'BOX TRANSFER' || opStr === 'BOX_TRANSFER') {
        dbOp = 'BOX_TRANSFER';
        dbOpAlt = 'Box Transfer';
      }
    }

    let poRows: any[] = [];
    if (dbOp) {
      poRows = await db.prepare(`
        SELECT DISTINCT po.*, owa.shift_id as owa_shift_id
        FROM operator_work_assignments owa
        JOIN production_orders po ON (po.id = owa.production_order_id OR po.id = (SELECT production_order_id FROM sales_orders WHERE id = owa.sales_order_id))
        LEFT JOIN production_order_operations poo ON poo.production_order_id = po.id
        WHERE (owa.operator_id = ? OR owa.operator_id = ?)
          AND owa.active = 1
          AND (
            owa.operation IS NULL 
            OR owa.operation = '' 
            OR owa.operation = 'ALL' 
            OR UPPER(owa.operation) = UPPER(?) 
            OR UPPER(owa.operation) = UPPER(?)
            OR UPPER(REPLACE(owa.operation, ' ', '_')) = UPPER(?)
          )
          AND (
            poo.operation IS NULL
            OR UPPER(poo.operation) = UPPER(?)
            OR UPPER(poo.operation) = UPPER(?)
            OR UPPER(REPLACE(poo.operation, ' ', '_')) = UPPER(?)
          )
          AND (po.status IS NULL OR UPPER(po.status) NOT IN ('COMPLETED', 'CANCELLED', 'ARCHIVED'))
      `).all(operatorId, operatorUsername, dbOp, dbOpAlt, dbOp, dbOp, dbOpAlt, dbOp) as any[];
    } else {
      poRows = await db.prepare(`
        SELECT DISTINCT po.*, owa.shift_id as owa_shift_id
        FROM operator_work_assignments owa
        JOIN production_orders po ON (po.id = owa.production_order_id OR po.id = (SELECT production_order_id FROM sales_orders WHERE id = owa.sales_order_id))
        WHERE (owa.operator_id = ? OR owa.operator_id = ?)
          AND owa.active = 1
          AND (po.status IS NULL OR UPPER(po.status) NOT IN ('COMPLETED', 'CANCELLED', 'ARCHIVED'))
      `).all(operatorId, operatorUsername) as any[];
    }

    const formattedPos = await Promise.all(poRows.map(po => formatProductionOrder(po, req.user)));
    const assignments = formattedPos.filter(Boolean);

    return res.json(assignments);
  } catch (err) {
    next(err);
  }
});

export default router;
