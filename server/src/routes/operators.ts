import { Router as ExpressRouter } from 'express';
import { db } from '../db/connection.js';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth.js';

const router = ExpressRouter();

// GET /api/operators/me/current-work
router.get('/current-work', authenticateToken, requireRole('OPERATOR'), async (req: AuthRequest, res, next) => {
  try {
    const operatorId = req.user!.id;

    // Find active PO & SO explicitly assigned to THIS operator in operator_work_assignments
    const soRow = await db.prepare(`
      SELECT so.*, po.po_number, po.map_po, po.customer, po.status as po_status, pl.name as line_name, owa.shift_id as owa_shift_id
      FROM sales_orders so
      JOIN production_orders po ON po.id = so.production_order_id
      JOIN operator_work_assignments owa ON owa.sales_order_id = so.id
      LEFT JOIN production_lines pl ON pl.id = so.line_id
      WHERE owa.operator_id = ? AND owa.active = 1 AND po.status = 'CURRENT'
      ORDER BY so.created_at DESC
      LIMIT 1
    `).get(operatorId) as any;

    if (!soRow) {
      return res.json({
        hasAssignment: false,
        message: 'No active production order allocated to you in operator_work_assignments.'
      });
    }

    const shiftRow = soRow.owa_shift_id ? await db.prepare(`SELECT * FROM shifts WHERE id = ?`).get(soRow.owa_shift_id) as any : null;

    const qcPassedRow = await db.prepare(`
      SELECT COUNT(DISTINCT iu.id) as cnt FROM qc_results qr
      JOIN item_units iu ON iu.id = qr.item_id
      WHERE iu.sales_order_id = ? AND qr.qc_result = 'PASS' AND qr.test_result = 'PASS'
    `).get(soRow.id) as any;
    const qcPassed = qcPassedRow?.cnt || 0;

    const packedRow = await db.prepare(`
      SELECT COUNT(DISTINCT bi.item_id) as cnt FROM box_items bi
      JOIN boxes b ON b.id = bi.box_id
      WHERE b.sales_order_id = ? AND bi.active = 1
    `).get(soRow.id) as any;
    const packed = packedRow?.cnt || 0;

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
          lineId: soRow.line_name || 'Line 04',
          boxCapacity: soRow.box_capacity,
          progress: {
            qcPassed,
            packed,
            status: soRow.status
          }
        },
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

    const soRows = await db.prepare(`
      SELECT so.*, po.po_number, po.customer, pl.name as line_name, owa.shift_id as owa_shift_id
      FROM operator_work_assignments owa
      JOIN sales_orders so ON so.id = owa.sales_order_id
      JOIN production_orders po ON po.id = so.production_order_id
      LEFT JOIN production_lines pl ON pl.id = so.line_id
      WHERE owa.operator_id = ? AND owa.active = 1 AND po.status = 'CURRENT'
    `).all(operatorId) as any[];

    const assignments = soRows.map(so => ({
      poNumber: so.po_number,
      customer: so.customer,
      soNumber: so.so_number,
      product: so.product,
      colour: so.colour,
      quantity: so.order_quantity,
      lineId: so.line_name || 'Line 04',
      shiftId: so.owa_shift_id || so.shift_id
    }));

    return res.json(assignments);
  } catch (err) {
    next(err);
  }
});

export default router;
