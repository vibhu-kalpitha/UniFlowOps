import { Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { db } from '../db/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';

const router = ExpressRouter();

// GET /api/operators/me/current-work
router.get('/current-work', authenticateToken, requireRole('OPERATOR'), (req: AuthRequest, res, next) => {
  try {
    const operatorId = req.user!.id;

    // Resolve current shift based on factory time (Asia/Colombo)
    // Factory timezone check
    const now = new Date();
    const currentHour = now.getHours().toString().padStart(2, '0');
    const currentMinute = now.getMinutes().toString().padStart(2, '0');
    const currentTimeStr = `${currentHour}:${currentMinute}`;

    // Find shift operator belongs to
    const memberRow = db.prepare(`
      SELECT sm.*, s.code as shift_code, s.start_time, s.end_time
      FROM shift_members sm
      JOIN shifts s ON s.id = sm.shift_id
      WHERE sm.operator_id = ? AND sm.active = 1
      LIMIT 1
    `).get(operatorId) as any;

    if (!memberRow) {
      return res.json({
        hasAssignment: false,
        message: 'Operator not assigned to any Shift A-D member group.'
      });
    }

    // Find active PO & SO assigned to this shift & line 04
    const soRow = db.prepare(`
      SELECT so.*, po.po_number, po.map_po, po.customer, po.status as po_status, pl.name as line_name
      FROM sales_orders so
      JOIN production_orders po ON po.id = so.production_order_id
      JOIN production_lines pl ON pl.id = so.line_id
      WHERE so.shift_id = ? AND po.status = 'CURRENT'
      ORDER BY so.created_at DESC
      LIMIT 1
    `).get(memberRow.shift_id) as any;

    if (!soRow) {
      return res.json({
        hasAssignment: false,
        message: 'No active production order assigned to your shift.'
      });
    }

    const qcPassed = (db.prepare(`
      SELECT COUNT(*) as cnt FROM qc_results qr
      JOIN item_units iu ON iu.id = qr.item_id
      WHERE iu.sales_order_id = ? AND qr.qc_result = 'PASS' AND qr.test_result = 'PASS'
    `).get(soRow.id) as any)?.cnt || 0;

    const packed = (db.prepare(`
      SELECT COUNT(*) as cnt FROM box_items bi
      JOIN boxes b ON b.id = bi.box_id
      WHERE b.sales_order_id = ?
    `).get(soRow.id) as any)?.cnt || 0;

    return res.json({
      hasAssignment: true,
      activeJob: {
        productionOrder: {
          id: soRow.po_number,
          mapPo: soRow.map_po,
          customer: soRow.customer,
          status: 'Current',
          selectedOperations: ['QC Test', 'Packing', 'AQL Checker', 'Box Transfer']
        },
        salesOrder: {
          id: soRow.so_number,
          dbId: soRow.id,
          mapSo: soRow.map_so,
          product: soRow.product,
          styleCode: soRow.style_code,
          colour: soRow.colour,
          sizeRange: soRow.size_range,
          quantity: soRow.order_quantity,
          lineId: soRow.line_name,
          boxCapacity: soRow.box_capacity,
          progress: {
            qcPassed,
            packed,
            status: soRow.status
          }
        },
        shift: {
          id: memberRow.id,
          shiftCode: memberRow.shift_code,
          startTime: memberRow.start_time,
          endTime: memberRow.end_time
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/operators/me/assignments
router.get('/assignments', authenticateToken, requireRole('OPERATOR'), (req: AuthRequest, res, next) => {
  try {
    const operatorId = req.user!.id;
    const memberRow = db.prepare(`SELECT shift_id FROM shift_members WHERE operator_id = ? AND active = 1 LIMIT 1`).get(operatorId) as any;

    const shiftId = memberRow?.shift_id || 'shift-c';

    const soRows = db.prepare(`
      SELECT so.*, po.po_number, po.customer, pl.name as line_name
      FROM sales_orders so
      JOIN production_orders po ON po.id = so.production_order_id
      JOIN production_lines pl ON pl.id = so.line_id
      WHERE po.status = 'CURRENT'
    `).all() as any[];

    const assignments = soRows.map(so => ({
      poNumber: so.po_number,
      customer: so.customer,
      soNumber: so.so_number,
      product: so.product,
      colour: so.colour,
      quantity: so.order_quantity,
      lineId: so.line_name,
      shiftId: so.shift_id
    }));

    return res.json(assignments);
  } catch (err) {
    next(err);
  }
});

export default router;
