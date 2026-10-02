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
router.get('/dashboard/supervisor', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const supervisorId = req.user?.id;
    const isSupervisorOnly = req.user?.role === 'SUPERVISOR';
    const selectedPoId = (req.query.poId || '').toString().trim();

    // Query authorized POs for this supervisor
    let poWhere = isSupervisorOnly && supervisorId 
      ? `WHERE po.supervisor_id = ? OR po.supervisor_id IS NULL OR po.id IN (SELECT DISTINCT sales_order_id FROM operator_work_assignments)`
      : ``;
    let poParams: any[] = isSupervisorOnly && supervisorId ? [supervisorId] : [];

    const pos = await db.prepare(`
      SELECT po.*, s.name as style_name, s.code as style_code, u.full_name as supervisor_name
      FROM production_orders po
      LEFT JOIN styles s ON s.id = po.style_id
      LEFT JOIN users u ON u.id = po.supervisor_id
      ${poWhere}
      ORDER BY po.created_at DESC
    `).all(...poParams) as any[];

    // Format list of authorized POs for supervisor dropdown
    const formattedPos = pos.map((p: any) => {
      const displayName = p.style_name 
        ? (p.po_name ? `${p.style_name} - ${p.po_name} - ${p.po_number || p.id}` : `${p.style_name} - ${p.po_number || p.id}`)
        : (p.po_name ? `${p.po_name} - ${p.po_number || p.id}` : (p.po_number || p.id));

      return {
        id: p.id,
        poNumber: p.po_number || p.id,
        poName: p.po_name || null,
        styleName: p.style_name || p.style_code || 'Standard Style',
        customer: p.customer || 'Standard',
        supervisorName: p.supervisor_name || 'Supervisor',
        status: p.status || 'CURRENT',
        displayName
      };
    });

    // Determine target PO for overview metrics
    const targetPo = selectedPoId 
      ? pos.find((p: any) => p.id === selectedPoId || p.po_number === selectedPoId) || pos[0]
      : pos[0];

    let currentPoDetails: any = null;
    let overviewMetrics: any = {
      plannedQuantity: 0,
      qcCompleted: 0,
      packedQuantity: 0,
      aqlCompleted: 0,
      remainingQuantity: 0,
      completionPct: 0
    };

    if (targetPo) {
      const targetPoId = targetPo.id;

      // Configured/Planned Quantity
      const cfgQtyRow = await db.prepare(`SELECT SUM(quantity) as cnt FROM production_order_configs WHERE production_order_id = ?`).get(targetPoId) as any;
      const soQtyRow = await db.prepare(`SELECT SUM(order_quantity) as cnt FROM sales_orders WHERE production_order_id = ?`).get(targetPoId) as any;
      const plannedQuantity = Number(cfgQtyRow?.cnt || soQtyRow?.cnt || targetPo.total_quantity || 500);

      // QC Completed (Unique QC Passed items)
      const qcPassedRow = await db.prepare(`
        SELECT COUNT(DISTINCT iu.id) as cnt FROM qc_results qr
        JOIN item_units iu ON iu.id = qr.item_id
        WHERE (iu.production_order_id = ? OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
          AND qr.qc_result = 'PASS' AND qr.test_result = 'PASS'
      `).get(targetPoId, targetPoId) as any;
      const qcCompleted = Number(qcPassedRow?.cnt || 0);

      // Packed Quantity (Active box items)
      const packedRow = await db.prepare(`
        SELECT COUNT(DISTINCT bi.item_id) as cnt FROM box_items bi
        JOIN boxes b ON b.id = bi.box_id
        LEFT JOIN item_units iu ON iu.id = bi.item_id
        WHERE (b.production_order_id = ? OR iu.production_order_id = ? OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
          AND bi.active = 1
      `).get(targetPoId, targetPoId, targetPoId) as any;
      const packedQuantity = Number(packedRow?.cnt || 0);

      // AQL Completed (Passed boxes)
      const aqlDoneRow = await db.prepare(`
        SELECT COUNT(*) as cnt FROM aql_inspections ai
        LEFT JOIN boxes b ON b.id = ai.box_id
        WHERE (ai.production_order_id = ? OR b.production_order_id = ?)
          AND UPPER(TRIM(ai.result)) IN ('PASS', 'PASSED')
      `).get(targetPoId, targetPoId) as any;
      const aqlCompleted = Number(aqlDoneRow?.cnt || 0);

      const remainingQuantity = Math.max(0, plannedQuantity - packedQuantity);
      const completionPct = plannedQuantity > 0 ? Math.min(100, Math.round((packedQuantity / plannedQuantity) * 100)) : 0;

      const shiftRow = targetPo.shift_id ? await db.prepare(`SELECT name FROM shifts WHERE id = ?`).get(targetPo.shift_id) as any : null;

      currentPoDetails = {
        poId: targetPo.id,
        poNumber: targetPo.po_number || targetPo.id,
        poName: targetPo.po_name || null,
        styleName: targetPo.style_name || targetPo.style_code || 'Standard Style',
        customer: targetPo.customer || 'Standard Customer',
        supervisorName: targetPo.supervisor_name || 'Supervisor',
        shiftName: shiftRow?.name || 'Shift A',
        status: targetPo.status || 'CURRENT',
        plannedQuantity,
        completionPct,
        displayName: targetPo.style_name 
          ? (targetPo.po_name ? `${targetPo.style_name} - ${targetPo.po_name} - ${targetPo.po_number}` : `${targetPo.style_name} - ${targetPo.po_number}`)
          : (targetPo.po_name ? `${targetPo.po_name} - ${targetPo.po_number}` : targetPo.po_number)
      };

      overviewMetrics = {
        plannedQuantity,
        qcCompleted,
        packedQuantity,
        aqlCompleted,
        remainingQuantity,
        completionPct
      };
    }

    // Boxes for Supervisor's Authorized POs
    const targetPoIds = pos.map((p: any) => p.id);
    let supervisorBoxes: any[] = [];
    if (targetPoIds.length > 0) {
      const placeholders = targetPoIds.map(() => '?').join(',');
      const boxRows = await db.prepare(`
        SELECT 
          b.id, b.box_code, b.box_number, b.capacity, b.status, b.created_at, b.production_order_id,
          po.po_number, po.po_name, s.name as style_name,
          (SELECT COUNT(bi.id) FROM box_items bi WHERE bi.box_id = b.id AND bi.active = 1) as active_count
        FROM boxes b
        LEFT JOIN production_orders po ON po.id = b.production_order_id
        LEFT JOIN styles s ON s.id = po.style_id
        WHERE b.production_order_id IN (${placeholders}) OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))
        ORDER BY b.created_at DESC
        LIMIT 25
      `).all(...targetPoIds, ...targetPoIds) as any[];

      supervisorBoxes = await Promise.all(boxRows.map(async (b: any) => {
        const items = await db.prepare(`
          SELECT u.qr_code, u.size, bi.packed_at, usr.full_name as packed_by_name
          FROM box_items bi
          JOIN item_units u ON u.id = bi.item_id
          LEFT JOIN users usr ON usr.id = bi.packed_by
          WHERE bi.box_id = ? AND bi.active = 1
          ORDER BY bi.packed_at ASC
        `).all(b.id) as any[];

        const activeCount = Number(b.active_count || items.length || 0);
        const capacity = Number(b.capacity || 12);
        const remainingCapacity = Math.max(0, capacity - activeCount);

        const aqlRow = await db.prepare(`SELECT result FROM aql_inspections WHERE box_id = ? ORDER BY completed_at DESC LIMIT 1`).get(b.id) as any;

        return {
          id: b.id,
          boxCode: b.box_code || b.box_number,
          boxNumber: b.box_number || b.box_code,
          poNumber: b.po_number || b.production_order_id,
          poName: b.po_name || null,
          styleName: b.style_name || 'Standard Style',
          capacity,
          activeFilledCount: activeCount,
          remainingCapacity,
          status: b.status || (activeCount >= capacity ? 'COMPLETED' : 'OPEN'),
          aqlStatus: aqlRow?.result || 'PENDING',
          productQrs: items.map(i => i.qr_code),
          items
        };
      }));
    }

    return res.json({
      authorizedPos: formattedPos,
      currentPoDetails,
      overviewMetrics,
      supervisorBoxes
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/admin
router.get('/dashboard/admin', authenticateToken, requireRole(['ADMIN', 'SUPERVISOR']), async (req: AuthRequest, res, next) => {
  try {
    const { poId, styleName, year, fromDate, toDate } = req.query as { poId?: string; styleName?: string; year?: string; fromDate?: string; toDate?: string };

    // Styles list for filter dropdown from styles table
    const stylesList = await db.prepare(`
      SELECT DISTINCT s.name as style_name
      FROM styles s
      WHERE s.name IS NOT NULL AND TRIM(s.name) != ''
      ORDER BY style_name ASC
    `).all() as any[];
    const availableStyles = stylesList.map(s => s.style_name).filter(Boolean);

    const posListRaw = await db.prepare(`
      SELECT po.id, po.po_number, po.po_name, s.name as style_name
      FROM production_orders po
      LEFT JOIN styles s ON s.id = po.style_id
      ORDER BY po.created_at DESC
    `).all() as any[];

    const availablePos = posListRaw.map((p: any) => ({
      id: p.id,
      po_number: p.po_number,
      po_name: p.po_name || null,
      style_name: p.style_name || p.style_code || 'Standard Style',
      displayName: p.style_name
        ? (p.po_name ? `${p.style_name} - ${p.po_name} - ${p.po_number}` : `${p.style_name} - ${p.po_number}`)
        : (p.po_name ? `${p.po_name} - ${p.po_number}` : p.po_number)
    }));

    // Target PO condition for SQL queries
    let poIdsTarget: string[] = [];
    let isFilterApplied = false;

    let poQuery = `SELECT po.id FROM production_orders po LEFT JOIN styles s ON s.id = po.style_id WHERE 1=1`;
    const poParams: any[] = [];

    if (poId && poId.trim()) {
      isFilterApplied = true;
      poQuery += ` AND (po.id = ? OR po.po_number = ?)`;
      poParams.push(poId.trim(), poId.trim());
    }
    if (styleName && styleName.trim()) {
      isFilterApplied = true;
      poQuery += ` AND (UPPER(TRIM(s.name)) = ? OR UPPER(TRIM(s.code)) = ?)`;
      const sUpper = styleName.trim().toUpperCase();
      poParams.push(sUpper, sUpper);
    }
    if (fromDate && toDate) {
      isFilterApplied = true;
      poQuery += ` AND po.created_at >= ? AND po.created_at <= ?`;
      poParams.push(fromDate, `${toDate} 23:59:59`);
    } else if (year && year.trim()) {
      isFilterApplied = true;
      poQuery += ` AND YEAR(po.created_at) = ?`;
      poParams.push(Number(year));
    }

    if (isFilterApplied) {
      const matches = await db.prepare(poQuery).all(...poParams) as any[];
      poIdsTarget = matches.map(m => m.id);
      if (poIdsTarget.length === 0) {
        poIdsTarget = ['__NO_MATCH__'];
      }
    }

    const filterActive = poIdsTarget.length > 0;

    // 1. Total Styles
    const totalStylesRow = await db.prepare(`SELECT COUNT(*) as cnt FROM styles`).get() as any;
    const poStylesRow = await db.prepare(`SELECT COUNT(DISTINCT style_id) as cnt FROM production_orders WHERE style_id IS NOT NULL`).get() as any;
    const totalStyles = Math.max(Number(totalStylesRow?.cnt || 0), Number(poStylesRow?.cnt || 0), availableStyles.length);

    // 2. Active & Running POs
    let currentPosQuery = `SELECT COUNT(*) as cnt FROM production_orders WHERE UPPER(TRIM(status)) IN ('CURRENT', 'IN_PROGRESS', 'RUNNING', 'DRAFT', 'RELEASED')`;
    let runningPosQuery = `SELECT COUNT(*) as cnt FROM production_orders WHERE UPPER(TRIM(status)) IN ('CURRENT', 'IN_PROGRESS', 'RUNNING')`;
    let totalPosQuery = `SELECT COUNT(*) as cnt FROM production_orders WHERE 1=1`;

    if (filterActive) {
      const placeholders = poIdsTarget.map(() => '?').join(',');
      currentPosQuery += ` AND id IN (${placeholders})`;
      runningPosQuery += ` AND id IN (${placeholders})`;
      totalPosQuery += ` AND id IN (${placeholders})`;
    }

    const currentPosRow = await db.prepare(currentPosQuery).get(...(filterActive ? poIdsTarget : [])) as any;
    const runningPosRow = await db.prepare(runningPosQuery).get(...(filterActive ? poIdsTarget : [])) as any;
    const totalPosRow = await db.prepare(totalPosQuery).get(...(filterActive ? poIdsTarget : [])) as any;

    // 3. Planned Quantity
    let plannedQtyQuery = `SELECT SUM(quantity) as cnt FROM production_order_configs`;
    if (filterActive) {
      const placeholders = poIdsTarget.map(() => '?').join(',');
      plannedQtyQuery += ` WHERE production_order_id IN (${placeholders})`;
    }
    const plannedQtyRow = await db.prepare(plannedQtyQuery).get(...(filterActive ? poIdsTarget : [])) as any;
    let plannedQuantity = Number(plannedQtyRow?.cnt || 0);

    if (plannedQuantity === 0) {
      let fallbackQtyQuery = `SELECT SUM(order_quantity) as cnt FROM sales_orders`;
      if (filterActive) {
        const placeholders = poIdsTarget.map(() => '?').join(',');
        fallbackQtyQuery += ` WHERE production_order_id IN (${placeholders})`;
      }
      const fallbackRow = await db.prepare(fallbackQtyQuery).get(...(filterActive ? poIdsTarget : [])) as any;
      plannedQuantity = Number(fallbackRow?.cnt || 500);
    }

    // 4. QC Passed & Failed
    let qcPassedQuery = `
      SELECT COUNT(DISTINCT qr.item_id) as cnt FROM qc_results qr
      JOIN item_units iu ON iu.id = qr.item_id
      WHERE qr.qc_result = 'PASS' AND qr.test_result = 'PASS'
    `;
    let qcFailedQuery = `
      SELECT COUNT(DISTINCT qf.item_id) as cnt FROM qc_fail_log qf
      LEFT JOIN item_units iu ON iu.id = qf.item_id
      WHERE 1=1
    `;

    if (filterActive) {
      const placeholders = poIdsTarget.map(() => '?').join(',');
      qcPassedQuery += ` AND (iu.production_order_id IN (${placeholders}) OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders})))`;
      qcFailedQuery += ` AND (iu.production_order_id IN (${placeholders}) OR qf.po_id IN (${placeholders}) OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders})))`;
    }

    const qcPassedRow = await db.prepare(qcPassedQuery).get(...(filterActive ? [...poIdsTarget, ...poIdsTarget] : [])) as any;
    const qcFailedRow = await db.prepare(qcFailedQuery).get(...(filterActive ? [...poIdsTarget, ...poIdsTarget, ...poIdsTarget] : [])) as any;

    const qcPassed = Number(qcPassedRow?.cnt || 0);
    const qcFailed = Number(qcFailedRow?.cnt || 0);

    // 5. Packed Quantity & Boxes (Open / Full / Total)
    let packedUnitsQuery = `SELECT COUNT(DISTINCT bi.item_id) as cnt FROM box_items bi JOIN boxes b ON b.id = bi.box_id WHERE bi.active = 1`;
    let totalBoxesQuery = `SELECT COUNT(*) as cnt FROM boxes`;
    let openBoxesQuery = `SELECT COUNT(*) as cnt FROM boxes WHERE UPPER(TRIM(status)) IN ('OPEN', 'NEW', 'IN_PROGRESS')`;
    let fullBoxesQuery = `SELECT COUNT(*) as cnt FROM boxes WHERE UPPER(TRIM(status)) IN ('COMPLETED', 'COMPLETE', 'FULL', 'AQL_PASSED', 'TRANSFERRED')`;

    if (filterActive) {
      const placeholders = poIdsTarget.map(() => '?').join(',');
      packedUnitsQuery += ` AND (b.production_order_id IN (${placeholders}) OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders})))`;
      totalBoxesQuery += ` WHERE production_order_id IN (${placeholders}) OR sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders}))`;
      openBoxesQuery += ` AND (production_order_id IN (${placeholders}) OR sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders})))`;
      fullBoxesQuery += ` AND (production_order_id IN (${placeholders}) OR sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${placeholders})))`;
    }

    const packedUnitsRow = await db.prepare(packedUnitsQuery).get(...(filterActive ? [...poIdsTarget, ...poIdsTarget] : [])) as any;
    const totalBoxesRow = await db.prepare(totalBoxesQuery).get(...(filterActive ? [...poIdsTarget, ...poIdsTarget] : [])) as any;
    const openBoxesRow = await db.prepare(openBoxesQuery).get(...(filterActive ? [...poIdsTarget, ...poIdsTarget] : [])) as any;
    const fullBoxesRow = await db.prepare(fullBoxesQuery).get(...(filterActive ? [...poIdsTarget, ...poIdsTarget] : [])) as any;

    const packedQuantity = Number(packedUnitsRow?.cnt || 0);
    const totalBoxes = Number(totalBoxesRow?.cnt || 0);
    const openBoxes = Number(openBoxesRow?.cnt || 0);
    const fullBoxes = Number(fullBoxesRow?.cnt || 0);

    // 6. AQL Passed & Failed
    let aqlPassedQuery = `SELECT COUNT(*) as cnt FROM aql_inspections ai LEFT JOIN boxes b ON b.id = ai.box_id WHERE UPPER(TRIM(ai.result)) IN ('PASS', 'PASSED')`;
    let aqlFailedQuery = `SELECT COUNT(*) as cnt FROM aql_inspections ai LEFT JOIN boxes b ON b.id = ai.box_id WHERE UPPER(TRIM(ai.result)) IN ('FAIL', 'FAILED')`;

    if (filterActive) {
      const placeholders = poIdsTarget.map(() => '?').join(',');
      aqlPassedQuery += ` AND (ai.production_order_id IN (${placeholders}) OR b.production_order_id IN (${placeholders}))`;
      aqlFailedQuery += ` AND (ai.production_order_id IN (${placeholders}) OR b.production_order_id IN (${placeholders}))`;
    }

    const aqlPassedRow = await db.prepare(aqlPassedQuery).get(...(filterActive ? [...poIdsTarget, ...poIdsTarget] : [])) as any;
    const aqlFailedRow = await db.prepare(aqlFailedQuery).get(...(filterActive ? [...poIdsTarget, ...poIdsTarget] : [])) as any;

    const aqlPassed = Number(aqlPassedRow?.cnt || 0);
    const aqlFailed = Number(aqlFailedRow?.cnt || 0);

    // 7. Overall PO Completion %
    const overallPoCompletion = plannedQuantity > 0 ? Math.min(100, Math.round((packedQuantity / plannedQuantity) * 100)) : 0;

    // 8. Live Production Orders List
    let poWhereClause = filterActive ? `WHERE po.id IN (${poIdsTarget.map(() => '?').join(',')})` : '';

    const activeProductionOrders = await db.prepare(`
      SELECT 
        po.id, po.po_number, po.po_name, po.customer, po.total_quantity, po.status, po.created_at,
        s.name as style_ref_name, u.full_name as supervisor_name,
        (SELECT SUM(quantity) FROM production_order_configs WHERE production_order_id = po.id) as cfg_qty,
        (SELECT COUNT(DISTINCT bi.item_id) FROM box_items bi JOIN boxes b ON b.id = bi.box_id LEFT JOIN item_units iu ON iu.id = bi.item_id WHERE (b.production_order_id = po.id OR iu.production_order_id = po.id OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = po.id)) AND bi.active = 1) as packed_count,
        (SELECT COUNT(id) FROM aql_inspections WHERE production_order_id = po.id AND UPPER(TRIM(result)) IN ('PASS', 'PASSED')) as aql_passed_boxes,
        (SELECT COUNT(id) FROM permanently_removed_items WHERE production_order_id = po.id) as scrapped_count
      FROM production_orders po
      LEFT JOIN styles s ON s.id = po.style_id
      LEFT JOIN users u ON u.id = po.supervisor_id
      ${poWhereClause}
      ORDER BY po.created_at DESC
      LIMIT 20
    `).all(...(filterActive ? poIdsTarget : [])) as any[];

    const formattedActiveOrders = activeProductionOrders.map(p => {
      const targetQty = Number(p.cfg_qty || p.total_quantity || 500);
      const packed = Number(p.packed_count || 0);
      const completionPct = targetQty > 0 ? Math.min(100, Math.round((packed / targetQty) * 100)) : 0;

      return {
        id: p.id,
        po_number: p.po_number,
        po_name: p.po_name || null,
        style_name: p.style_name || p.style_ref_name || 'Standard Style',
        customer: p.customer || 'Standard Customer',
        supervisor_name: p.supervisor_name || 'Supervisor',
        status: p.status || 'CURRENT',
        total_quantity: targetQty,
        packed_count: packed,
        aql_passed_boxes: Number(p.aql_passed_boxes || 0),
        scrapped_count: Number(p.scrapped_count || 0),
        completionPct,
        displayName: (p.style_name || p.style_ref_name)
          ? (p.po_name ? `${p.style_name || p.style_ref_name} - ${p.po_name} - ${p.po_number}` : `${p.style_name || p.style_ref_name} - ${p.po_number}`)
          : (p.po_name ? `${p.po_name} - ${p.po_number}` : p.po_number)
      };
    });

    // 9. Box List for Admin Box Overview
    let adminBoxesWhere = filterActive ? `WHERE b.production_order_id IN (${poIdsTarget.map(() => '?').join(',')}) OR b.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id IN (${poIdsTarget.map(() => '?').join(',')}))` : '';

    const adminBoxRows = await db.prepare(`
      SELECT 
        b.id, b.box_code, b.box_number, b.capacity, b.status, b.created_at, b.production_order_id,
        po.po_number, po.po_name, s.name as style_name,
        (SELECT COUNT(bi.id) FROM box_items bi WHERE bi.box_id = b.id AND bi.active = 1) as active_count
      FROM boxes b
      LEFT JOIN production_orders po ON po.id = b.production_order_id
      LEFT JOIN styles s ON s.id = po.style_id
      ${adminBoxesWhere}
      ORDER BY b.created_at DESC
      LIMIT 30
    `).all(...(filterActive ? [...poIdsTarget, ...poIdsTarget] : [])) as any[];

    const adminBoxes = await Promise.all(adminBoxRows.map(async (b: any) => {
      const items = await db.prepare(`
        SELECT u.qr_code, u.size, bi.packed_at, usr.full_name as packed_by_name
        FROM box_items bi
        JOIN item_units u ON u.id = bi.item_id
        LEFT JOIN users usr ON usr.id = bi.packed_by
        WHERE bi.box_id = ? AND bi.active = 1
        ORDER BY bi.packed_at ASC
      `).all(b.id) as any[];

      const activeCount = Number(b.active_count || items.length || 0);
      const capacity = Number(b.capacity || 12);
      const remainingCapacity = Math.max(0, capacity - activeCount);

      const aqlRow = await db.prepare(`SELECT result FROM aql_inspections WHERE box_id = ? ORDER BY completed_at DESC LIMIT 1`).get(b.id) as any;
      const transferRow = await db.prepare(`SELECT * FROM box_transfers WHERE source_box_id = ? OR destination_box_id = ? ORDER BY transferred_at DESC LIMIT 1`).get(b.id, b.id) as any;

      return {
        id: b.id,
        boxCode: b.box_code || b.box_number,
        boxNumber: b.box_number || b.box_code,
        poNumber: b.po_number || b.production_order_id,
        poName: b.po_name || null,
        styleName: b.style_name || 'Standard Style',
        capacity,
        activeFilledCount: activeCount,
        remainingCapacity,
        status: b.status || (activeCount >= capacity ? 'COMPLETED' : 'OPEN'),
        aqlStatus: aqlRow?.result || 'PENDING',
        transferStatus: transferRow ? `Transferred (${transferRow.item_count} items)` : 'NONE',
        productQrs: items.map(i => i.qr_code),
        items
      };
    }));

    // 10. Audit Logs
    const recentAuditLogs = await db.prepare(`
      SELECT al.*, u.full_name as user_name, u.role as user_role
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.actor_id
      ORDER BY al.created_at DESC
      LIMIT 10
    `).all() as any[];

    // 11. Scrapped Items Log
    const recentScrapped = await db.prepare(`
      SELECT p.*, po.po_number, po.po_name, u.full_name as operator_name
      FROM permanently_removed_items p
      LEFT JOIN production_orders po ON po.id = p.production_order_id
      LEFT JOIN users u ON u.id = p.removed_by
      ORDER BY p.removed_at DESC
      LIMIT 20
    `).all() as any[];

    return res.json({
      filter: {
        poId: poId || null,
        styleName: styleName || null,
        year: year || null,
        fromDate: fromDate || null,
        toDate: toDate || null,
        availableStyles,
        availablePos
      },
      kpis: {
        totalStyles,
        activePos: currentPosRow?.cnt || 0,
        runningPos: runningPosRow?.cnt || 0,
        plannedQuantity,
        qcPassed,
        qcFailed,
        packedQuantity,
        aqlPassed,
        aqlFailed,
        totalBoxes,
        openBoxes,
        fullBoxes,
        overallPoCompletion
      },
      activeProductionOrders: formattedActiveOrders,
      adminBoxes,
      recentAuditLogs,
      recentScrapped
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
