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
      targetQuantity = Number(cfgQtyRow?.cnt || soQtyRow?.cnt || po.total_quantity || 500);
    }

    // 2. Pre-QC Passed & Failed (Item level)
    let preQcPassedCount = 0;
    let preQcFailedCount = 0;
    if (poId) {
      const prePass = await db.prepare(`
        SELECT COUNT(DISTINCT pq.item_id) as cnt FROM pre_qc_results pq
        LEFT JOIN item_units iu ON iu.id = pq.item_id
        WHERE (pq.production_order_id = ? OR iu.production_order_id = ?)
          AND UPPER(TRIM(pq.pre_qc_result)) = 'PASS'
      `).get(poId, poId) as any;
      preQcPassedCount = Number(prePass?.cnt || 0);

      const preFail = await db.prepare(`
        SELECT COUNT(DISTINCT pq.item_id) as cnt FROM pre_qc_results pq
        LEFT JOIN item_units iu ON iu.id = pq.item_id
        WHERE (pq.production_order_id = ? OR iu.production_order_id = ?)
          AND UPPER(TRIM(pq.pre_qc_result)) = 'FAIL'
      `).get(poId, poId) as any;
      preQcFailedCount = Number(preFail?.cnt || 0);
    }

    // 3. QC Passed & Failed (Item level)
    let qcPassedCount = 0;
    let qcFailedCount = 0;
    if (poId) {
      const qcPassRow = await db.prepare(`
        SELECT COUNT(DISTINCT iu.id) as cnt FROM qc_results qr
        JOIN item_units iu ON iu.id = qr.item_id
        WHERE (iu.production_order_id = ? OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
          AND UPPER(TRIM(qr.qc_result)) = 'PASS' AND UPPER(TRIM(qr.test_result)) = 'PASS'
      `).get(poId, poId) as any;
      qcPassedCount = Number(qcPassRow?.cnt || 0);

      const qcFailRow = await db.prepare(`
        SELECT COUNT(DISTINCT qf.item_id) as cnt FROM qc_fail_log qf
        LEFT JOIN item_units iu ON iu.id = qf.item_id
        WHERE (iu.production_order_id = ? OR qf.po_id = ? OR iu.sales_order_id IN (SELECT id FROM sales_orders WHERE production_order_id = ?))
          AND (qf.failure_type IS NULL OR qf.failure_type != 'PERMANENTLY_REMOVED')
      `).get(poId, poId, poId) as any;
      qcFailedCount = Number(qcFailRow?.cnt || 0);
    }

    // 4. Packed Count & Pending Pack for PO (Item level)
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
    }
    const pendingPackCount = Math.max(0, targetQuantity - packedCount);

    // 5. Normal AQL Passed & Failed (Item level)
    let aqlPassCount = 0;
    let aqlFailedCount = 0;
    if (poId) {
      const aqlPassRow = await db.prepare(`
        SELECT COUNT(DISTINCT asamp.item_id) as cnt
        FROM aql_samples asamp
        JOIN aql_inspections ai ON ai.id = asamp.inspection_id
        LEFT JOIN boxes b ON b.id = ai.box_id
        WHERE (ai.production_order_id = ? OR b.production_order_id = ?)
          AND (ai.stage IS NULL OR UPPER(TRIM(ai.stage)) IN ('AQL', 'AQL_CHECKER', 'NORMAL_AQL'))
          AND UPPER(TRIM(asamp.result)) = 'PASS'
      `).get(poId, poId) as any;
      aqlPassCount = Number(aqlPassRow?.cnt || 0);

      const aqlFailRow = await db.prepare(`
        SELECT COUNT(DISTINCT asamp.item_id) as cnt
        FROM aql_samples asamp
        JOIN aql_inspections ai ON ai.id = asamp.inspection_id
        LEFT JOIN boxes b ON b.id = ai.box_id
        WHERE (ai.production_order_id = ? OR b.production_order_id = ?)
          AND (ai.stage IS NULL OR UPPER(TRIM(ai.stage)) IN ('AQL', 'AQL_CHECKER', 'NORMAL_AQL'))
          AND UPPER(TRIM(asamp.result)) = 'FAIL'
      `).get(poId, poId) as any;
      aqlFailedCount = Number(aqlFailRow?.cnt || 0);
    }

    // 6. Final AQL Passed & Failed (Item level)
    let finalAqlPassCount = 0;
    let finalAqlFailedCount = 0;
    if (poId) {
      const finalPassRow = await db.prepare(`
        SELECT COUNT(DISTINCT asamp.item_id) as cnt
        FROM aql_samples asamp
        JOIN aql_inspections ai ON ai.id = asamp.inspection_id
        LEFT JOIN boxes b ON b.id = ai.box_id
        WHERE (ai.production_order_id = ? OR b.production_order_id = ?)
          AND UPPER(TRIM(ai.stage)) IN ('FINAL_AQL', 'FINAL AQL', 'FINAL_AQL_CHECKER')
          AND UPPER(TRIM(asamp.result)) = 'PASS'
      `).get(poId, poId) as any;
      finalAqlPassCount = Number(finalPassRow?.cnt || 0);

      const finalFailRow = await db.prepare(`
        SELECT COUNT(DISTINCT asamp.item_id) as cnt
        FROM aql_samples asamp
        JOIN aql_inspections ai ON ai.id = asamp.inspection_id
        LEFT JOIN boxes b ON b.id = ai.box_id
        WHERE (ai.production_order_id = ? OR b.production_order_id = ?)
          AND UPPER(TRIM(ai.stage)) IN ('FINAL_AQL', 'FINAL AQL', 'FINAL_AQL_CHECKER')
          AND UPPER(TRIM(asamp.result)) = 'FAIL'
      `).get(poId, poId) as any;
      finalAqlFailedCount = Number(finalFailRow?.cnt || 0);
    }

    const totalFailCount = preQcFailedCount + qcFailedCount + aqlFailedCount + finalAqlFailedCount;

    return res.json({
      targetQuantity,
      preQcPassedCount,
      preQcFailedCount,
      qcPassedCount,
      qcFailedCount,
      packedCount,
      pendingPackCount,
      aqlPassCount,
      aqlFailedCount,
      finalAqlPassCount,
      finalAqlFailedCount,
      // Backward compatibility fields
      totalQcPassed: qcPassedCount,
      qcFailCount: qcFailedCount,
      aqlDoneCount: aqlPassCount + aqlFailedCount,
      totalFailCount,
      poDetails: po ? {
        poId: po.id,
        poNumber: po.po_number,
        poName: po.po_name || null,
        styleName: po.style_name || po.style_code || 'Standard Style',
        styleCode: po.style_code || null,
        targetQuantity,
        dueDate: po.due_date || null
      } : null,
      qcPassedToday: qcPassedCount,
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
    const userPlant = req.user?.plant;
    const selectedPoId = (req.query.poId || '').toString().trim();

    // Query authorized POs for this supervisor (Supervisors have global production visibility, restricted only by plant if plant is configured)
    let poWhere = ``;
    let poParams: any[] = [];
    if (isSupervisorOnly && userPlant && userPlant.trim() !== '') {
      poWhere = `WHERE LOWER(TRIM(po.plant)) = LOWER(TRIM(?))`;
      poParams = [userPlant.trim()];
    }

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
        plant: p.plant || null,
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
        plant: targetPo.plant || null,
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
      WHERE (qf.failure_type IS NULL OR qf.failure_type != 'PERMANENTLY_REMOVED')
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
        po.id, po.po_number, po.po_name, po.customer, po.status, po.created_at,
        s.name as style_ref_name, u.full_name as supervisor_name,
        (SELECT SUM(quantity) FROM production_order_configs WHERE production_order_id = po.id) as cfg_qty,
        (SELECT SUM(order_quantity) FROM sales_orders WHERE production_order_id = po.id) as so_qty,
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
      const targetQty = Number(p.cfg_qty || p.so_qty || 500);
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
        COALESCE(NULLIF(TRIM(b.line_number), ''), NULLIF(TRIM(po.line_number), ''), 'Line 1') as line_name,
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
        lineName: b.line_name || 'Line 1',
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
      LIMIT 100
    `).all() as any[];

    // 12. Production Lines list for filtering - strictly collect actual lines allocated to POs or used in operations
    const allocatedLinesSet = new Set<string>();
    try {
      const poLinesRows = await db.prepare(`SELECT DISTINCT line_number FROM production_orders WHERE line_number IS NOT NULL AND line_number != ''`).all() as any[];
      for (const r of poLinesRows) {
        const parts = String(r.line_number || '').split(/[,;/+]+/).map(p => p.trim()).filter(Boolean);
        for (const p of parts) {
          allocatedLinesSet.add(p.startsWith('Line') ? p : `Line ${p}`);
        }
      }
      const loggedLinesRows = await db.prepare(`
        SELECT DISTINCT line_number FROM (
          SELECT line_number FROM qc_results WHERE line_number IS NOT NULL AND line_number != ''
          UNION
          SELECT line_number FROM pre_qc_results WHERE line_number IS NOT NULL AND line_number != ''
          UNION
          SELECT line_number FROM boxes WHERE line_number IS NOT NULL AND line_number != ''
          UNION
          SELECT line_number FROM aql_inspections WHERE line_number IS NOT NULL AND line_number != ''
        ) t
      `).all().catch(() => []) as any[];
      for (const r of loggedLinesRows) {
        if (r?.line_number && String(r.line_number).trim()) {
          const val = String(r.line_number).trim();
          allocatedLinesSet.add(val.startsWith('Line') ? val : `Line ${val}`);
        }
      }
    } catch {
      // safe fallback
    }
    const availableLines = Array.from(allocatedLinesSet).sort();

    // 13. Styles Master Data for inspection tab
    const adminStyles = await db.query(`
      SELECT s.*,
        (SELECT COUNT(id) FROM production_orders WHERE style_id = s.id) as po_count
      FROM styles s
      ORDER BY s.created_at DESC
    `);

    // 14. Detailed QC Inspection Logs with linked Pre-QC QRs
    let qcLogs: any[] = [];
    try {
      qcLogs = await db.prepare(`
        SELECT qr.id, qr.item_id, iu.qr_code as item_qr, qr.qc_result, qr.test_result, qr.failure_reason, qr.scanned_at,
               po.id as po_id, po.po_number, po.po_name, po.customer, s.name as style_name,
               COALESCE(NULLIF(TRIM(qr.line_number), ''), NULLIF(TRIM(po.line_number), ''), pl.name, 'Line 1') as line_name,
               u.full_name as operator_name,
               (
                 SELECT GROUP_CONCAT(DISTINCT pqa.pre_qc_qr SEPARATOR ', ')
                 FROM pre_qc_assignments pqa
                 WHERE pqa.product_qr = iu.qr_code
               ) as linked_pre_qc_qrs
        FROM qc_results qr
        JOIN item_units iu ON iu.id = qr.item_id
        LEFT JOIN production_orders po ON po.id = iu.production_order_id
        LEFT JOIN styles s ON s.id = po.style_id
        LEFT JOIN sales_orders so ON so.id = iu.sales_order_id
        LEFT JOIN production_lines pl ON pl.id = so.line_id
        LEFT JOIN users u ON u.id = qr.operator_id
        ORDER BY qr.scanned_at DESC
        LIMIT 250
      `).all() as any[];
    } catch {
      qcLogs = [];
    }

    // 15. Detailed Normal AQL Logs
    let aqlLogs: any[] = [];
    let finalAqlLogs: any[] = [];
    try {
      const rawAql = await db.prepare(`
        SELECT ai.id, ai.box_id, b.box_code, b.box_number, ai.result, ai.failure_reason, ai.required_samples,
               ai.started_at, ai.completed_at, ai.stage,
               po.id as po_id, po.po_number, po.po_name, po.customer, s.name as style_name,
               COALESCE(NULLIF(TRIM(ai.line_number), ''), NULLIF(TRIM(b.line_number), ''), NULLIF(TRIM(po.line_number), ''), pl.name, 'Line 1') as line_name,
               u.full_name as inspector_name,
               (SELECT COUNT(*) FROM aql_samples WHERE inspection_id = ai.id) as sampled_count
        FROM aql_inspections ai
        LEFT JOIN boxes b ON b.id = ai.box_id
        LEFT JOIN production_orders po ON (po.id = ai.production_order_id OR po.id = b.production_order_id)
        LEFT JOIN styles s ON s.id = po.style_id
        LEFT JOIN sales_orders so ON so.id = ai.sales_order_id
        LEFT JOIN production_lines pl ON pl.id = so.line_id
        LEFT JOIN users u ON u.id = ai.inspector_id
        ORDER BY COALESCE(ai.completed_at, ai.started_at) DESC
        LIMIT 250
      `).all() as any[];

      aqlLogs = rawAql.filter(a => !a.stage || !String(a.stage).toUpperCase().includes('FINAL'));
      finalAqlLogs = rawAql.filter(a => a.stage && String(a.stage).toUpperCase().includes('FINAL'));
    } catch {
      aqlLogs = [];
      finalAqlLogs = [];
    }

    // 16. Detailed Pre-QC Logs with Assigned QC QR and operator info
    let preQcLogs: any[] = [];
    try {
      preQcLogs = await db.prepare(`
        SELECT pq.id, pq.item_id, iu.qr_code as item_qr, pq.pre_qc_result, pq.failure_reason, pq.scanned_at,
               po.id as po_id, po.po_number, po.po_name, po.customer, s.name as style_name,
               COALESCE(NULLIF(TRIM(pq.line_number), ''), NULLIF(TRIM(po.line_number), ''), pl.name, 'Line 1') as line_name,
               u.full_name as operator_name,
               pqa.product_qr as assigned_qc_qr,
               pqa.assigned_at,
               assign_u.full_name as assigned_by_name
        FROM pre_qc_results pq
        JOIN item_units iu ON iu.id = pq.item_id
        LEFT JOIN production_orders po ON (po.id = pq.production_order_id OR po.id = iu.production_order_id)
        LEFT JOIN styles s ON s.id = po.style_id
        LEFT JOIN sales_orders so ON so.id = iu.sales_order_id
        LEFT JOIN production_lines pl ON pl.id = so.line_id
        LEFT JOIN users u ON u.id = pq.operator_id
        LEFT JOIN pre_qc_assignments pqa ON (pqa.pre_qc_qr = iu.qr_code)
        LEFT JOIN users assign_u ON assign_u.id = pqa.operator_id
        ORDER BY pq.scanned_at DESC
        LIMIT 250
      `).all() as any[];
    } catch {
      preQcLogs = [];
    }

    // 17. Box Transfers Log
    let boxTransfers: any[] = [];
    try {
      boxTransfers = await db.prepare(`
        SELECT bt.id as transfer_id, bt.source_box_id, bt.destination_box_id, bt.item_count, bt.transferred_at, bt.remarks,
               COALESCE(sb.box_code, sb.box_number) as source_box_code,
               COALESCE(db.box_code, db.box_number) as dest_box_code,
               u.full_name as transferred_by_name,
               po.po_number, po.po_name, s.name as style_name, po.customer,
               COALESCE(NULLIF(TRIM(sb.line_number), ''), NULLIF(TRIM(po.line_number), ''), 'Line 1') as line_name
        FROM box_transfers bt
        LEFT JOIN boxes sb ON sb.id = bt.source_box_id
        LEFT JOIN boxes db ON db.id = bt.destination_box_id
        LEFT JOIN production_orders po ON (po.id = bt.production_order_id OR po.id = sb.production_order_id)
        LEFT JOIN styles s ON s.id = po.style_id
        LEFT JOIN users u ON u.id = bt.transferred_by
        ORDER BY bt.transferred_at DESC
        LIMIT 100
      `).all() as any[];
    } catch {
      boxTransfers = [];
    }

    return res.json({
      filter: {
        poId: poId || null,
        styleName: styleName || null,
        year: year || null,
        fromDate: fromDate || null,
        toDate: toDate || null,
        availableStyles,
        availablePos,
        availableLines
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
      recentScrapped,
      adminStyles,
      qcLogs,
      aqlLogs,
      finalAqlLogs,
      preQcLogs,
      boxTransfers
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

// GET /api/reports/production?range=today|week|month|all&startDate=&endDate=
router.get('/reports/production', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const range = (req.query.range || 'all').toString().toLowerCase();
    const startDateParam = (req.query.startDate || '').toString().trim();
    const endDateParam = (req.query.endDate || '').toString().trim();
    const queryPlant = (req.query.plant || '').toString().trim();
    const isSupervisorOnly = req.user?.role === 'SUPERVISOR';
    const userPlant = req.user?.plant;

    let filterDateFrom: Date | null = null;
    let filterDateTo: Date | null = null;
    if (startDateParam) {
      filterDateFrom = new Date(`${startDateParam}T00:00:00.000Z`);
    }
    if (endDateParam) {
      filterDateTo = new Date(`${endDateParam}T23:59:59.999Z`);
    } else if (filterDateFrom && !endDateParam) {
      filterDateTo = new Date(`${startDateParam}T23:59:59.999Z`);
    }

    if (!filterDateFrom && !filterDateTo && range !== 'all') {
      const now = new Date();
      if (range === 'today') {
        filterDateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        filterDateTo = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      } else if (range === 'week') {
        filterDateFrom = new Date(Date.now() - 7 * 86400000);
      } else if (range === 'month') {
        filterDateFrom = new Date(Date.now() - 30 * 86400000);
      }
    }

    let poWhere = '';
    const poParams: any[] = [];
    if (isSupervisorOnly && userPlant && userPlant.trim() !== '') {
      poWhere = 'WHERE LOWER(TRIM(po.plant)) = LOWER(TRIM(?))';
      poParams.push(userPlant.trim());
    } else if (queryPlant) {
      poWhere = 'WHERE LOWER(TRIM(po.plant)) = LOWER(TRIM(?))';
      poParams.push(queryPlant);
    }

    const pos = await db.prepare(`
      SELECT 
        po.id, po.po_number, po.po_name, po.customer, po.customer_id, po.status, po.created_at, po.plant,
        po.style_id,
        s.name as style_name, s.code as style_code, s.customer as style_customer,
        c.name as customer_name,
        (SELECT SUM(quantity) FROM production_order_configs WHERE production_order_id = po.id) as cfg_qty,
        (SELECT SUM(order_quantity) FROM sales_orders WHERE production_order_id = po.id) as so_qty,
        (SELECT COUNT(*) FROM sales_orders WHERE production_order_id = po.id) as so_count
      FROM production_orders po
      LEFT JOIN styles s ON s.id = po.style_id
      LEFT JOIN customers c ON (c.id = po.customer_id OR c.name = po.customer)
      ${poWhere}
      ORDER BY po.created_at DESC
    `).all(...poParams) as any[];

    const poBreakdown: any[] = [];

    for (const p of pos) {
      const isStyleDirect = (p.po_number && p.po_number.startsWith('STYLE-')) ||
                            (p.po_name && p.po_name.toLowerCase().includes('direct run'));

      const custName = p.customer_name || p.customer || p.style_customer || 'Factory Customer';
      const styleName = p.style_name || 'Standard Style';

      if (p.so_count > 0) {
        // Multi-tier order: broken down per Sales Order (SO)
        const soList = await db.prepare(`
          SELECT so.*, pl.name as line_name 
          FROM sales_orders so 
          LEFT JOIN production_lines pl ON pl.id = so.line_id
          WHERE so.production_order_id = ?
          ORDER BY so.created_at ASC
        `).all(p.id) as any[];

        for (const so of soList) {
          const soDate = new Date(so.created_at || p.created_at);
          if (filterDateFrom && soDate < filterDateFrom) continue;
          if (filterDateTo && soDate > filterDateTo) continue;

          const targetQty = Number(so.order_quantity || 0);

          const preQcRow = await db.prepare(`
            SELECT COUNT(DISTINCT pqr.item_id) as cnt FROM pre_qc_results pqr
            JOIN item_units iu ON iu.id = pqr.item_id
            WHERE iu.sales_order_id = ? AND UPPER(TRIM(COALESCE(pqr.pre_qc_result, 'PASS'))) = 'PASS'
          `).get(so.id) as any;
          const preQc = Number(preQcRow?.cnt || 0);

          const qcPassRow = await db.prepare(`
            SELECT COUNT(DISTINCT iu.id) as cnt FROM qc_results qr
            JOIN item_units iu ON iu.id = qr.item_id
            WHERE iu.sales_order_id = ? AND qr.qc_result = 'PASS' AND qr.test_result = 'PASS'
          `).get(so.id) as any;
          const qcPassed = Number(qcPassRow?.cnt || 0);

          const qcFailRow = await db.prepare(`
            SELECT COUNT(DISTINCT qf.item_id) as cnt FROM qc_fail_log qf
            JOIN item_units iu ON iu.id = qf.item_id
            WHERE iu.sales_order_id = ? AND (qf.failure_type IS NULL OR qf.failure_type != 'PERMANENTLY_REMOVED')
          `).get(so.id) as any;
          const qcFailed = Number(qcFailRow?.cnt || 0);

          const packedRow = await db.prepare(`
            SELECT COUNT(DISTINCT bi.item_id) as cnt FROM box_items bi
            JOIN boxes b ON b.id = bi.box_id
            LEFT JOIN item_units iu ON iu.id = bi.item_id
            WHERE (b.sales_order_id = ? OR iu.sales_order_id = ?) AND bi.active = 1
          `).get(so.id, so.id) as any;
          const packedCount = Number(packedRow?.cnt || 0);

          const aqlPassRow = await db.prepare(`
            SELECT COUNT(DISTINCT ai.id) as cnt FROM aql_inspections ai
            LEFT JOIN boxes b ON b.id = ai.box_id
            WHERE (ai.sales_order_id = ? OR b.sales_order_id = ?)
              AND UPPER(TRIM(ai.result)) IN ('PASS', 'PASSED')
              AND UPPER(TRIM(COALESCE(ai.stage, 'AQL'))) NOT LIKE '%FINAL%'
          `).get(so.id, so.id) as any;
          const aqlPassed = Number(aqlPassRow?.cnt || 0);

          const aqlFailRow = await db.prepare(`
            SELECT COUNT(DISTINCT ai.id) as cnt FROM aql_inspections ai
            LEFT JOIN boxes b ON b.id = ai.box_id
            WHERE (ai.sales_order_id = ? OR b.sales_order_id = ?)
              AND UPPER(TRIM(ai.result)) IN ('FAIL', 'FAILED')
              AND UPPER(TRIM(COALESCE(ai.stage, 'AQL'))) NOT LIKE '%FINAL%'
          `).get(so.id, so.id) as any;
          const aqlFailed = Number(aqlFailRow?.cnt || 0);

          const finalAqlPassRow = await db.prepare(`
            SELECT COUNT(DISTINCT ai.id) as cnt FROM aql_inspections ai
            LEFT JOIN boxes b ON b.id = ai.box_id
            WHERE (ai.sales_order_id = ? OR b.sales_order_id = ?)
              AND UPPER(TRIM(ai.result)) IN ('PASS', 'PASSED')
              AND UPPER(TRIM(COALESCE(ai.stage, ''))) LIKE '%FINAL%'
          `).get(so.id, so.id) as any;
          const finalAqlPassed = Number(finalAqlPassRow?.cnt || 0);

          const boxTransferRow = await db.prepare(`
            SELECT COUNT(*) as cnt FROM box_transfers bt
            JOIN boxes b ON b.id = bt.source_box_id
            WHERE b.sales_order_id = ?
          `).get(so.id) as any;
          const boxTransfers = Number(boxTransferRow?.cnt || 0);

          const scrappedRow = await db.prepare(`
            SELECT COUNT(*) as cnt FROM permanently_removed_items pri
            LEFT JOIN item_units iu ON iu.id = pri.item_id
            WHERE iu.sales_order_id = ?
          `).get(so.id) as any;
          const scrappedCount = Number(scrappedRow?.cnt || 0);

          const completionPct = targetQty > 0 ? Math.min(100, Math.round((packedCount / targetQty) * 100)) : 0;
          const totalQc = qcPassed + qcFailed;
          const qcPassRate = totalQc > 0 ? Math.round((qcPassed / totalQc) * 100) : 100;

          poBreakdown.push({
            id: `so-${so.id}`,
            poId: p.id,
            soId: so.id,
            poNumber: p.po_number || p.id,
            poName: p.po_name || p.po_number || p.id,
            soNumber: so.so_number,
            soName: so.so_number + (so.map_so && so.map_so !== so.so_number ? ` (${so.map_so})` : ''),
            styleName,
            customer: custName,
            targetQuantity: targetQty,
            plannedQty: targetQty,
            preQc,
            qc: qcPassed,
            qcPassed,
            qcFailed,
            qcPassRate: `${qcPassRate}%`,
            packing: packedCount,
            packedCount,
            aql: aqlPassed,
            aqlPassed,
            aqlFailed,
            finalAql: finalAqlPassed,
            finalAqlPassed,
            transfers: boxTransfers,
            boxTransfers,
            scrap: scrappedCount,
            scrappedCount,
            completionPct: `${completionPct}%`,
            status: so.status || p.status || 'CURRENT',
            orderPathway: 'MULTI_TIER',
            plant: p.plant || null,
            createdAt: so.created_at || p.created_at
          });
        }
      } else {
        // Order without SO (PO-direct or Style-direct)
        const poDate = new Date(p.created_at);
        if (filterDateFrom && poDate < filterDateFrom) continue;
        if (filterDateTo && poDate > filterDateTo) continue;

        const targetQty = Number(p.cfg_qty || p.so_qty || 500);

        const preQcRow = await db.prepare(`
          SELECT COUNT(DISTINCT pqr.item_id) as cnt FROM pre_qc_results pqr
          LEFT JOIN item_units iu ON iu.id = pqr.item_id
          WHERE (pqr.production_order_id = ? OR iu.production_order_id = ?)
            AND UPPER(TRIM(COALESCE(pqr.pre_qc_result, 'PASS'))) = 'PASS'
        `).get(p.id, p.id) as any;
        const preQc = Number(preQcRow?.cnt || 0);

        const qcPassRow = await db.prepare(`
          SELECT COUNT(DISTINCT iu.id) as cnt FROM qc_results qr
          JOIN item_units iu ON iu.id = qr.item_id
          WHERE iu.production_order_id = ? AND qr.qc_result = 'PASS' AND qr.test_result = 'PASS'
        `).get(p.id) as any;
        const qcPassed = Number(qcPassRow?.cnt || 0);

        const qcFailRow = await db.prepare(`
          SELECT COUNT(DISTINCT qf.item_id) as cnt FROM qc_fail_log qf
          LEFT JOIN item_units iu ON iu.id = qf.item_id
          WHERE (iu.production_order_id = ? OR qf.po_id = ?)
            AND (qf.failure_type IS NULL OR qf.failure_type != 'PERMANENTLY_REMOVED')
        `).get(p.id, p.id) as any;
        const qcFailed = Number(qcFailRow?.cnt || 0);

        const packedRow = await db.prepare(`
          SELECT COUNT(DISTINCT bi.item_id) as cnt FROM box_items bi
          JOIN boxes b ON b.id = bi.box_id
          LEFT JOIN item_units iu ON iu.id = bi.item_id
          WHERE (b.production_order_id = ? OR iu.production_order_id = ?) AND bi.active = 1
        `).get(p.id, p.id) as any;
        const packedCount = Number(packedRow?.cnt || 0);

        const aqlPassRow = await db.prepare(`
          SELECT COUNT(DISTINCT ai.id) as cnt FROM aql_inspections ai
          LEFT JOIN boxes b ON b.id = ai.box_id
          WHERE (ai.production_order_id = ? OR b.production_order_id = ?)
            AND UPPER(TRIM(ai.result)) IN ('PASS', 'PASSED')
            AND UPPER(TRIM(COALESCE(ai.stage, 'AQL'))) NOT LIKE '%FINAL%'
        `).get(p.id, p.id) as any;
        const aqlPassed = Number(aqlPassRow?.cnt || 0);

        const aqlFailRow = await db.prepare(`
          SELECT COUNT(DISTINCT ai.id) as cnt FROM aql_inspections ai
          LEFT JOIN boxes b ON b.id = ai.box_id
          WHERE (ai.production_order_id = ? OR b.production_order_id = ?)
            AND UPPER(TRIM(ai.result)) IN ('FAIL', 'FAILED')
            AND UPPER(TRIM(COALESCE(ai.stage, 'AQL'))) NOT LIKE '%FINAL%'
        `).get(p.id, p.id) as any;
        const aqlFailed = Number(aqlFailRow?.cnt || 0);

        const finalAqlPassRow = await db.prepare(`
          SELECT COUNT(DISTINCT ai.id) as cnt FROM aql_inspections ai
          LEFT JOIN boxes b ON b.id = ai.box_id
          WHERE (ai.production_order_id = ? OR b.production_order_id = ?)
            AND UPPER(TRIM(ai.result)) IN ('PASS', 'PASSED')
            AND UPPER(TRIM(COALESCE(ai.stage, ''))) LIKE '%FINAL%'
        `).get(p.id, p.id) as any;
        const finalAqlPassed = Number(finalAqlPassRow?.cnt || 0);

        const boxTransferRow = await db.prepare(`
          SELECT COUNT(*) as cnt FROM box_transfers bt
          JOIN boxes b ON b.id = bt.source_box_id
          WHERE b.production_order_id = ?
        `).get(p.id) as any;
        const boxTransfers = Number(boxTransferRow?.cnt || 0);

        const scrappedRow = await db.prepare(`
          SELECT COUNT(*) as cnt FROM permanently_removed_items
          WHERE production_order_id = ?
        `).get(p.id) as any;
        const scrappedCount = Number(scrappedRow?.cnt || 0);

        const completionPct = targetQty > 0 ? Math.min(100, Math.round((packedCount / targetQty) * 100)) : 0;
        const totalQc = qcPassed + qcFailed;
        const qcPassRate = totalQc > 0 ? Math.round((qcPassed / totalQc) * 100) : 100;

        poBreakdown.push({
          id: `po-${p.id}`,
          poId: p.id,
          soId: null,
          poNumber: isStyleDirect ? '' : (p.po_number || p.id),
          poName: isStyleDirect ? 'No PO & SO' : (p.po_name || p.po_number || p.id),
          soNumber: '',
          soName: isStyleDirect ? 'No PO & SO' : 'No SO',
          styleName,
          customer: custName,
          targetQuantity: targetQty,
          plannedQty: targetQty,
          preQc,
          qc: qcPassed,
          qcPassed,
          qcFailed,
          qcPassRate: `${qcPassRate}%`,
          packing: packedCount,
          packedCount,
          aql: aqlPassed,
          aqlPassed,
          aqlFailed,
          finalAql: finalAqlPassed,
          finalAqlPassed,
          transfers: boxTransfers,
          boxTransfers,
          scrap: scrappedCount,
          scrappedCount,
          completionPct: `${completionPct}%`,
          status: p.status || 'CURRENT',
          orderPathway: isStyleDirect ? 'STYLE_DIRECT' : 'PO_DIRECT',
          plant: p.plant || null,
          createdAt: p.created_at
        });
      }
    }

    // Include registered styles that have no production orders yet (so all styles appear)
    try {
      const standaloneStyles = await db.prepare(`
        SELECT s.*, c.name as customer_name
        FROM styles s
        LEFT JOIN customers c ON (c.id = s.customer_id OR c.name = s.customer)
        WHERE s.id NOT IN (SELECT DISTINCT style_id FROM production_orders WHERE style_id IS NOT NULL)
      `).all() as any[];

      for (const st of standaloneStyles) {
        const stDate = new Date(st.created_at || Date.now());
        if (filterDateFrom && stDate < filterDateFrom) continue;
        if (filterDateTo && stDate > filterDateTo) continue;

        poBreakdown.push({
          id: `style-${st.id}`,
          poId: null,
          soId: null,
          poNumber: '',
          poName: 'No PO & SO',
          soNumber: '',
          soName: 'No PO & SO',
          styleName: st.name || 'Registered Style',
          customer: st.customer_name || st.customer || 'Factory Customer',
          targetQuantity: 0,
          plannedQty: 0,
          preQc: 0,
          qc: 0,
          qcPassed: 0,
          qcFailed: 0,
          qcPassRate: '100%',
          packing: 0,
          packedCount: 0,
          aql: 0,
          aqlPassed: 0,
          aqlFailed: 0,
          finalAql: 0,
          finalAqlPassed: 0,
          transfers: 0,
          boxTransfers: 0,
          scrap: 0,
          scrappedCount: 0,
          completionPct: '0%',
          status: 'REGISTERED',
          orderPathway: 'STYLE_ONLY',
          plant: null,
          createdAt: st.created_at || null
        });
      }
    } catch (_) {}

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
      poBreakdown,
      lineBreakdown
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/operational-logs — Deep Stage Logs & Unit Records per PO/SO
router.get('/reports/operational-logs', authenticateToken, requireRole(['ADMIN', 'SUPERVISOR']), async (req: AuthRequest, res, next) => {
  try {
    const { poId, soId, styleName, customer, range = 'all', startDate, endDate, search } = req.query as {
      poId?: string;
      soId?: string;
      styleName?: string;
      customer?: string;
      range?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    };

    // Helper for date filtering across operations
    const buildDateFilter = (field: string) => {
      if (startDate && endDate) {
        return ` AND ${field} >= '${startDate}' AND ${field} <= '${endDate} 23:59:59'`;
      }
      if (range === 'today') {
        return ` AND DATE(${field}) = CURDATE()`;
      }
      if (range === 'week') {
        return ` AND ${field} >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
      }
      if (range === 'month') {
        return ` AND ${field} >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;
      }
      return '';
    };

    // 1. Pre-QC Logs with Assigned QC QR and SO
    let preQcQuery = `
      SELECT pq.id, pq.item_id, iu.qr_code as item_qr, pq.pre_qc_result, pq.test_details, pq.failure_reason, pq.scanned_at,
             po.id as po_id, po.po_number, po.po_name, so.so_number as so_name, po.customer, s.name as style_name,
             COALESCE(NULLIF(TRIM(pq.line_number), ''), NULLIF(TRIM(po.line_number), ''), 'Line 1') as line_name,
             u.full_name as operator_name,
             pqa.product_qr as assigned_qc_qr,
             pqa.assigned_at,
             assign_u.full_name as assigned_by_name
      FROM pre_qc_results pq
      JOIN item_units iu ON iu.id = pq.item_id
      LEFT JOIN production_orders po ON (po.id = pq.production_order_id OR po.id = iu.production_order_id)
      LEFT JOIN sales_orders so ON so.id = iu.sales_order_id
      LEFT JOIN styles s ON s.id = po.style_id
      LEFT JOIN users u ON u.id = pq.operator_id
      LEFT JOIN pre_qc_assignments pqa ON (pqa.pre_qc_qr = iu.qr_code)
      LEFT JOIN users assign_u ON assign_u.id = pqa.operator_id
      WHERE 1=1 ${buildDateFilter('pq.scanned_at')}
    `;
    const preQcParams: any[] = [];
    if (poId && poId.trim()) {
      preQcQuery += ` AND (po.id = ? OR po.po_number = ?)`;
      preQcParams.push(poId.trim(), poId.trim());
    }
    if (styleName && styleName.trim()) {
      preQcQuery += ` AND (s.name = ? OR s.code = ?)`;
      preQcParams.push(styleName.trim(), styleName.trim());
    }
    if (customer && customer.trim()) {
      preQcQuery += ` AND po.customer = ?`;
      preQcParams.push(customer.trim());
    }
    if (search && search.trim()) {
      preQcQuery += ` AND (iu.qr_code LIKE ? OR pqa.product_qr LIKE ? OR u.full_name LIKE ? OR po.po_number LIKE ?)`;
      const term = `%${search.trim()}%`;
      preQcParams.push(term, term, term, term);
    }
    preQcQuery += ` ORDER BY pq.scanned_at DESC LIMIT 300`;
    let preQcLogs: any[] = [];
    try {
      preQcLogs = await db.prepare(preQcQuery).all(...preQcParams) as any[];
    } catch { preQcLogs = []; }

    // 2. QC Inspection Logs with linked Pre-QC QRs, SO, and real Inspector Name
    let qcQuery = `
      SELECT qr.id, qr.item_id, iu.qr_code as item_qr, qr.qc_result, qr.test_result, qr.test_details, qr.failure_reason, qr.scanned_at,
             po.id as po_id, po.po_number, po.po_name, so.so_number as so_name, po.customer, s.name as style_name,
             COALESCE(NULLIF(TRIM(qr.line_number), ''), NULLIF(TRIM(po.line_number), ''), 'Line 1') as line_name,
             COALESCE(u.full_name, test_u.full_name, 'QC Inspector') as inspector_name,
             COALESCE(u.full_name, test_u.full_name, 'QC Inspector') as operator_name,
             (
               SELECT GROUP_CONCAT(DISTINCT pqa.pre_qc_qr SEPARATOR ', ')
               FROM pre_qc_assignments pqa
               WHERE pqa.product_qr = iu.qr_code
             ) as linked_pre_qc_qrs
      FROM qc_results qr
      JOIN item_units iu ON iu.id = qr.item_id
      LEFT JOIN production_orders po ON po.id = iu.production_order_id
      LEFT JOIN sales_orders so ON so.id = iu.sales_order_id
      LEFT JOIN styles s ON s.id = po.style_id
      LEFT JOIN users u ON u.id = qr.operator_id
      LEFT JOIN users test_u ON test_u.id = qr.test_operator_id
      WHERE 1=1 ${buildDateFilter('qr.scanned_at')}
    `;
    const qcParams: any[] = [];
    if (poId && poId.trim()) {
      qcQuery += ` AND (po.id = ? OR po.po_number = ?)`;
      qcParams.push(poId.trim(), poId.trim());
    }
    if (styleName && styleName.trim()) {
      qcQuery += ` AND (s.name = ? OR s.code = ?)`;
      qcParams.push(styleName.trim(), styleName.trim());
    }
    if (customer && customer.trim()) {
      qcQuery += ` AND po.customer = ?`;
      qcParams.push(customer.trim());
    }
    if (search && search.trim()) {
      qcQuery += ` AND (iu.qr_code LIKE ? OR qr.failure_reason LIKE ? OR u.full_name LIKE ? OR test_u.full_name LIKE ? OR po.po_number LIKE ?)`;
      const term = `%${search.trim()}%`;
      qcParams.push(term, term, term, term, term);
    }
    qcQuery += ` ORDER BY qr.scanned_at DESC LIMIT 300`;
    let qcLogs: any[] = [];
    try {
      qcLogs = await db.prepare(qcQuery).all(...qcParams) as any[];
    } catch { qcLogs = []; }

    // 3. Carton Packing Logs (Box-Level for Batch Inspection & Individual Item Removal)
    let packingQuery = `
      SELECT b.id, b.id as box_id, COALESCE(b.box_code, b.box_number) as box_code, b.box_number, b.capacity,
             COALESCE(NULLIF(TRIM(b.line_number), ''), NULLIF(TRIM(po.line_number), ''), 'Line 1') as line_name,
             b.status as box_status, b.status,
             b.created_at, b.created_at as packed_at,
             po.id as po_id, po.po_number, po.po_name, so.so_number as so_name, s.name as style_name, po.customer,
             (SELECT COUNT(*) FROM box_items bi2 WHERE bi2.box_id = b.id AND bi2.active = 1) as current_fill,
             (SELECT COUNT(*) FROM box_items bi2 WHERE bi2.box_id = b.id AND bi2.active = 1) as activeFilledCount,
             (
               SELECT GROUP_CONCAT(DISTINCT iu2.qr_code SEPARATOR ',')
               FROM box_items bi3
               JOIN item_units iu2 ON iu2.id = bi3.item_id
               WHERE bi3.box_id = b.id AND bi3.active = 1
             ) as packed_qrs_str
      FROM boxes b
      LEFT JOIN production_orders po ON po.id = b.production_order_id
      LEFT JOIN sales_orders so ON so.id = b.sales_order_id
      LEFT JOIN styles s ON s.id = po.style_id
      WHERE 1=1 ${buildDateFilter('b.created_at')}
    `;
    const packingParams: any[] = [];
    if (poId && poId.trim()) {
      packingQuery += ` AND (po.id = ? OR po.po_number = ?)`;
      packingParams.push(poId.trim(), poId.trim());
    }
    if (styleName && styleName.trim()) {
      packingQuery += ` AND (s.name = ? OR s.code = ?)`;
      packingParams.push(styleName.trim(), styleName.trim());
    }
    if (customer && customer.trim()) {
      packingQuery += ` AND po.customer = ?`;
      packingParams.push(customer.trim());
    }
    if (search && search.trim()) {
      packingQuery += ` AND (b.box_code LIKE ? OR b.box_number LIKE ? OR po.po_number LIKE ?)`;
      const term = `%${search.trim()}%`;
      packingParams.push(term, term, term);
    }
    packingQuery += ` ORDER BY b.created_at DESC LIMIT 200`;
    let rawPackingBoxes: any[] = [];
    try {
      rawPackingBoxes = await db.prepare(packingQuery).all(...packingParams) as any[];
    } catch { rawPackingBoxes = []; }

    const packingLogs = rawPackingBoxes.map(b => {
      const qrs = b.packed_qrs_str ? b.packed_qrs_str.split(',').filter(Boolean) : [];
      return {
        ...b,
        boxCode: b.box_code || b.box_number,
        boxNumber: b.box_number || b.box_code,
        poNumber: b.po_number || b.po_name || 'No PO & SO',
        soName: b.so_name || 'No SO',
        styleName: b.style_name || 'Standard Style',
        activeFilledCount: Number(b.activeFilledCount || qrs.length || 0),
        capacity: Number(b.capacity || 24),
        remainingCapacity: Math.max(0, Number(b.capacity || 24) - Number(b.activeFilledCount || qrs.length || 0)),
        productQrs: qrs,
        items: qrs.map((qr: string) => ({ qr_code: qr, packed_at: b.created_at }))
      };
    });

    // 4 & 5. AQL and Final AQL Logs with SO
    let aqlQuery = `
      SELECT ai.id, ai.box_id, b.box_code, b.box_number, ai.result, ai.failure_reason, ai.required_samples,
             ai.started_at, ai.completed_at, ai.stage,
             po.id as po_id, po.po_number, po.po_name, so.so_number as so_name, po.customer, s.name as style_name,
             COALESCE(NULLIF(TRIM(ai.line_number), ''), NULLIF(TRIM(b.line_number), ''), NULLIF(TRIM(po.line_number), ''), 'Line 1') as line_name,
             u.full_name as inspector_name,
             (SELECT COUNT(*) FROM aql_samples WHERE inspection_id = ai.id) as sampled_count
      FROM aql_inspections ai
      LEFT JOIN boxes b ON b.id = ai.box_id
      LEFT JOIN production_orders po ON (po.id = ai.production_order_id OR po.id = b.production_order_id)
      LEFT JOIN sales_orders so ON (so.id = ai.sales_order_id OR so.id = b.sales_order_id)
      LEFT JOIN styles s ON s.id = po.style_id
      LEFT JOIN users u ON u.id = ai.inspector_id
      WHERE 1=1 ${buildDateFilter('ai.started_at')}
    `;
    const aqlParams: any[] = [];
    if (poId && poId.trim()) {
      aqlQuery += ` AND (po.id = ? OR po.po_number = ?)`;
      aqlParams.push(poId.trim(), poId.trim());
    }
    if (styleName && styleName.trim()) {
      aqlQuery += ` AND (s.name = ? OR s.code = ?)`;
      aqlParams.push(styleName.trim(), styleName.trim());
    }
    if (customer && customer.trim()) {
      aqlQuery += ` AND po.customer = ?`;
      aqlParams.push(customer.trim());
    }
    if (search && search.trim()) {
      aqlQuery += ` AND (b.box_code LIKE ? OR b.box_number LIKE ? OR u.full_name LIKE ? OR ai.failure_reason LIKE ?)`;
      const term = `%${search.trim()}%`;
      aqlParams.push(term, term, term, term);
    }
    aqlQuery += ` ORDER BY COALESCE(ai.completed_at, ai.started_at) DESC LIMIT 200`;
    let rawAqlLogs: any[] = [];
    try {
      rawAqlLogs = await db.prepare(aqlQuery).all(...aqlParams) as any[];
    } catch { rawAqlLogs = []; }
    const aqlLogs = rawAqlLogs.filter(a => !a.stage || !String(a.stage).toUpperCase().includes('FINAL'));
    const finalAqlLogs = rawAqlLogs.filter(a => a.stage && String(a.stage).toUpperCase().includes('FINAL'));

    // 6. Box Transfers with SO
    let transferQuery = `
      SELECT bt.id, bt.id as transfer_id, bt.source_box_id, bt.destination_box_id, bt.item_count, bt.transferred_at, bt.remarks,
             COALESCE(sb.box_code, sb.box_number) as source_box_code,
             COALESCE(db.box_code, db.box_number) as dest_box_code,
             u.full_name as transferred_by_name,
             po.po_number, po.po_name, so.so_number as so_name, s.name as style_name, po.customer,
             COALESCE(NULLIF(TRIM(sb.line_number), ''), NULLIF(TRIM(po.line_number), ''), 'Line 1') as line_name
      FROM box_transfers bt
      LEFT JOIN boxes sb ON sb.id = bt.source_box_id
      LEFT JOIN boxes db ON db.id = bt.destination_box_id
      LEFT JOIN production_orders po ON (po.id = bt.production_order_id OR po.id = sb.production_order_id)
      LEFT JOIN sales_orders so ON (so.id = sb.sales_order_id OR so.id = db.sales_order_id)
      LEFT JOIN styles s ON s.id = po.style_id
      LEFT JOIN users u ON u.id = bt.transferred_by
      WHERE 1=1 ${buildDateFilter('bt.transferred_at')}
    `;
    const trfParams: any[] = [];
    if (poId && poId.trim()) {
      transferQuery += ` AND (po.id = ? OR po.po_number = ?)`;
      trfParams.push(poId.trim(), poId.trim());
    }
    if (styleName && styleName.trim()) {
      transferQuery += ` AND (s.name = ? OR s.code = ?)`;
      trfParams.push(styleName.trim(), styleName.trim());
    }
    if (customer && customer.trim()) {
      transferQuery += ` AND po.customer = ?`;
      trfParams.push(customer.trim());
    }
    if (search && search.trim()) {
      transferQuery += ` AND (sb.box_code LIKE ? OR db.box_code LIKE ? OR u.full_name LIKE ? OR bt.remarks LIKE ?)`;
      const term = `%${search.trim()}%`;
      trfParams.push(term, term, term, term);
    }
    transferQuery += ` ORDER BY bt.transferred_at DESC LIMIT 100`;
    let transferLogs: any[] = [];
    try {
      transferLogs = await db.prepare(transferQuery).all(...trfParams) as any[];
    } catch { transferLogs = []; }

    // 7. Scrapped Logs with SO
    let scrapQuery = `
      SELECT p.id, p.item_qr, p.action_type, p.reason, p.removed_at,
             u.full_name as removed_by_name,
             COALESCE(po.line_number, 'Line 1') as line_number,
             po.po_number, po.po_name, so.so_number as so_name, s.name as style_name, po.customer
      FROM permanently_removed_items p
      LEFT JOIN production_orders po ON po.id = p.production_order_id
      LEFT JOIN item_units iu ON iu.qr_code = p.item_qr
      LEFT JOIN sales_orders so ON so.id = iu.sales_order_id
      LEFT JOIN styles s ON s.id = po.style_id
      LEFT JOIN users u ON u.id = p.removed_by
      WHERE 1=1 ${buildDateFilter('p.removed_at')}
    `;
    const scrapParams: any[] = [];
    if (poId && poId.trim()) {
      scrapQuery += ` AND (po.id = ? OR po.po_number = ?)`;
      scrapParams.push(poId.trim(), poId.trim());
    }
    if (styleName && styleName.trim()) {
      scrapQuery += ` AND (s.name = ? OR s.code = ?)`;
      scrapParams.push(styleName.trim(), styleName.trim());
    }
    if (customer && customer.trim()) {
      scrapQuery += ` AND po.customer = ?`;
      scrapParams.push(customer.trim());
    }
    if (search && search.trim()) {
      scrapQuery += ` AND (p.item_qr LIKE ? OR p.reason LIKE ? OR u.full_name LIKE ?)`;
      const term = `%${search.trim()}%`;
      scrapParams.push(term, term, term);
    }
    scrapQuery += ` ORDER BY p.removed_at DESC LIMIT 100`;
    let scrappedLogs: any[] = [];
    try {
      scrappedLogs = await db.prepare(scrapQuery).all(...scrapParams) as any[];
    } catch { scrappedLogs = []; }

    return res.json({
      status: 'SUCCESS',
      preQcLogs,
      qcLogs,
      packingLogs,
      aqlLogs,
      finalAqlLogs,
      transferLogs,
      scrappedLogs,
      counts: {
        preQc: preQcLogs.length,
        qc: qcLogs.length,
        packing: packingLogs.length,
        aql: aqlLogs.length,
        finalAql: finalAqlLogs.length,
        transfers: transferLogs.length,
        scrapped: scrappedLogs.length
      }
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
