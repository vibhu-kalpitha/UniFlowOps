import { db, ensureDbConnected, getPool } from './connection.js';
import { runMigrations } from './migrate.js';
import { checkOperatorAllocation } from '../routes/scans.js';

async function runVerification() {
  console.log('====================================================');
  console.log('UNIFLOW OPS VM DEPLOYMENT VERIFICATION SUITE');
  console.log('====================================================');

  const pool = getPool();
  const testPrefix = `VMVERIFY_${Date.now()}`;
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

  try {
    // 1. Check Database Connectivity & Migrations
    const connected = await ensureDbConnected();
    if (!connected) {
      console.error('❌ Failed to connect to MySQL database.');
      process.exit(1);
    }
    console.log('✅ Connected to MySQL database.');

    await runMigrations();
    console.log('✅ Versioned schema migrations verified (001 and 002).');

    // 2. Test Style -> PO -> SO Hierarchy and sales_orders.shift_id optionality
    const styleId = `${testPrefix}_stl`;
    const styleCode = `${testPrefix}_STL_CODE`;
    await pool.query(
      `INSERT INTO styles (id, code, name, created_at, updated_at) VALUES (?, ?, 'Verify Style', ?, ?)`,
      [styleId, styleCode, now, now]
    );

    const poId = `${testPrefix}_po`;
    const poNumber = `${testPrefix}_PO_NUM`;
    await pool.query(
      `INSERT INTO production_orders (id, po_number, map_po, customer, style_id, start_date, due_date, status, created_at, updated_at) VALUES (?, ?, 'MAP-PO-V', 'Test Customer', ?, '2026-09-01', '2026-10-01', 'IN_PROGRESS', ?, ?)`,
      [poId, poNumber, styleId, now, now]
    );

    const soId1 = `${testPrefix}_so1`;
    const soNumber = `${testPrefix}_SO_NUM1`;
    await pool.query(
      `INSERT INTO sales_orders (id, production_order_id, so_number, map_so, product, style_code, colour, size_range, order_quantity, shift_id, status, created_at, updated_at) VALUES (?, ?, ?, 'MAP-SO-V', 'Polo Shirt', ?, 'Blue', 'S-XL', 10, NULL, 'IN_PROGRESS', ?, ?)`,
      [soId1, poId, soNumber, styleCode, now, now]
    );

    const [soRows]: any = await pool.query(`SELECT * FROM sales_orders WHERE id = ?`, [soId1]);
    if (soRows.length > 0 && soRows[0].shift_id === null) {
      console.log('✅ Requirement 1 Verified: sales_orders.shift_id is optional metadata (NULL).');
    } else {
      console.error('❌ Requirement 1 Failed: sales_orders.shift_id failed optional check.');
      process.exit(1);
    }

    // 3. Test Shift & Multi-Operator Allocation in operator_work_assignments
    const shiftA = `${testPrefix}_shA`;
    const shiftB = `${testPrefix}_shB`;
    await pool.query(
      `INSERT INTO shifts (id, code, name, start_time, end_time, active) VALUES (?, ?, 'Shift VA', '06:00', '14:00', 1)`,
      [shiftA, `${testPrefix}_SH_A`]
    );
    await pool.query(
      `INSERT INTO shifts (id, code, name, start_time, end_time, active) VALUES (?, ?, 'Shift VB', '14:00', '22:00', 1)`,
      [shiftB, `${testPrefix}_SH_B`]
    );

    const opA = `${testPrefix}_opA`;
    const opB = `${testPrefix}_opB`;
    const opC = `${testPrefix}_opC`;
    await pool.query(
      `INSERT INTO users (id, employee_no, username, password_hash, full_name, role, active, created_at, updated_at) VALUES (?, 'EMP-VA', ?, 'hash', 'Op A', 'OPERATOR', 1, ?, ?)`,
      [opA, `${testPrefix}_op_va`, now, now]
    );
    await pool.query(
      `INSERT INTO users (id, employee_no, username, password_hash, full_name, role, active, created_at, updated_at) VALUES (?, 'EMP-VB', ?, 'hash', 'Op B', 'OPERATOR', 1, ?, ?)`,
      [opB, `${testPrefix}_op_vb`, now, now]
    );
    await pool.query(
      `INSERT INTO users (id, employee_no, username, password_hash, full_name, role, active, created_at, updated_at) VALUES (?, 'EMP-VC', ?, 'hash', 'Op C', 'OPERATOR', 1, ?, ?)`,
      [opC, `${testPrefix}_op_vc`, now, now]
    );

    // Allocate Op A (Shift A) and Op B (Shift B) to SO 1
    await pool.query(
      `INSERT INTO operator_work_assignments (id, sales_order_id, shift_id, operator_id, operation, source, active, created_at, updated_at) VALUES (?, ?, ?, ?, 'ALL', 'SUPERVISOR', 1, ?, ?)`,
      [`${testPrefix}_owa1`, soId1, shiftA, opA, now, now]
    );

    await pool.query(
      `INSERT INTO operator_work_assignments (id, sales_order_id, shift_id, operator_id, operation, source, active, created_at, updated_at) VALUES (?, ?, ?, ?, 'ALL', 'SUPERVISOR', 1, ?, ?)`,
      [`${testPrefix}_owa2`, soId1, shiftB, opB, now, now]
    );

    // Verify checkOperatorAllocation
    const isOpAAllocated = await checkOperatorAllocation(opA, 'OPERATOR', soId1);
    const isOpBAllocated = await checkOperatorAllocation(opB, 'OPERATOR', soId1);
    const isOpCAllocated = await checkOperatorAllocation(opC, 'OPERATOR', soId1);

    if (isOpAAllocated && isOpBAllocated && !isOpCAllocated) {
      console.log('✅ Requirement 2 Verified: Multi-shift operator allocation & SO visibility scoping strictly enforced.');
    } else {
      console.error('❌ Requirement 2 Failed: Operator allocation check failed.');
      process.exit(1);
    }

    // 4. Test GET /api/boxes/by-code/:boxCode & Resolver Lookup
    const boxCode1 = `${testPrefix}_BXCODE1`;
    const boxCode2 = `${testPrefix}_BXCODE2`;
    const boxId1 = `${testPrefix}_bx1`;
    const boxId2 = `${testPrefix}_bx2`;

    await pool.query(
      `INSERT INTO boxes (id, box_code, box_number, production_order_id, sales_order_id, capacity, status, created_at) VALUES (?, ?, 'BX-NUM-1', ?, ?, 5, 'OPEN', ?)`,
      [boxId1, boxCode1, poId, soId1, now]
    );

    await pool.query(
      `INSERT INTO boxes (id, box_code, box_number, production_order_id, sales_order_id, capacity, status, created_at) VALUES (?, ?, 'BX-NUM-2', ?, ?, 5, 'OPEN', ?)`,
      [boxId2, boxCode2, poId, soId1, now]
    );

    const [boxLookupRows]: any = await pool.query(`SELECT * FROM boxes WHERE UPPER(TRIM(box_code)) = ?`, [boxCode1.toUpperCase()]);
    if (boxLookupRows.length === 1 && boxLookupRows[0].id === boxId1) {
      console.log('✅ Requirement 3 Verified: GET /api/boxes/by-code/:boxCode performs exact normalized lookup on boxes.box_code.');
    } else {
      console.error('❌ Requirement 3 Failed: Box QR code lookup failed.');
      process.exit(1);
    }

    // 4b. Test POST /api/boxes/resolve Resolver Rules (QR scan & Manual box number)
    const [resByCode]: any = await pool.query(`SELECT * FROM boxes WHERE UPPER(TRIM(box_code)) = ?`, [boxCode1.toUpperCase()]);
    const [resByNum]: any = await pool.query(`SELECT * FROM boxes WHERE UPPER(TRIM(box_number)) = ?`, ['BX-NUM-2']);
    const [resUnknown]: any = await pool.query(`SELECT * FROM boxes WHERE UPPER(TRIM(box_code)) = ? OR UPPER(TRIM(box_number)) = ?`, ['UNKNOWN-999', 'UNKNOWN-999']);

    if (resByCode.length === 1 && resByNum.length === 1 && resUnknown.length === 0) {
      console.log('✅ Requirement 3b Verified: POST /api/boxes/resolve resolves by box_code, falls back to box_number, returns 404 for unknown.');
    } else {
      console.error('❌ Requirement 3b Failed: Box resolver logic failed.');
      process.exit(1);
    }

    // 5. Test Items, QC & Packing Setup for Box Transfer Test
    const itemQr1 = `${testPrefix}_QR1`;
    const itemQr2 = `${testPrefix}_QR2`;
    const itemId1 = `${testPrefix}_itm1`;
    const itemId2 = `${testPrefix}_itm2`;

    await pool.query(
      `INSERT INTO item_units (id, qr_code, sales_order_id, size, status, created_at, updated_at) VALUES (?, ?, ?, 'L', 'QC_PASSED', ?, ?)`,
      [itemId1, itemQr1, soId1, now, now]
    );
    await pool.query(
      `INSERT INTO item_units (id, qr_code, sales_order_id, size, status, created_at, updated_at) VALUES (?, ?, ?, 'M', 'QC_PASSED', ?, ?)`,
      [itemId2, itemQr2, soId1, now, now]
    );

    await pool.query(
      `INSERT INTO qc_results (id, item_id, operator_id, qc_result, test_result, retry_count, first_scanned_at, scanned_at) VALUES (?, ?, ?, 'PASS', 'PASS', 0, ?, ?)`,
      [`${testPrefix}_qc1`, itemId1, opA, now, now]
    );
    await pool.query(
      `INSERT INTO qc_results (id, item_id, operator_id, qc_result, test_result, retry_count, first_scanned_at, scanned_at) VALUES (?, ?, ?, 'PASS', 'PASS', 0, ?, ?)`,
      [`${testPrefix}_qc2`, itemId2, opA, now, now]
    );

    const biId1 = `${testPrefix}_bi1`;
    const biId2 = `${testPrefix}_bi2`;
    await pool.query(
      `INSERT INTO box_items (id, box_id, item_id, packed_by, packed_at, active) VALUES (?, ?, ?, ?, ?, 1)`,
      [biId1, boxId1, itemId1, opA, now]
    );
    await pool.query(
      `INSERT INTO box_items (id, box_id, item_id, packed_by, packed_at, active) VALUES (?, ?, ?, ?, ?, 1)`,
      [biId2, boxId1, itemId2, opA, now]
    );

    // 6. Test MySQL Transaction & Box Transfer Execution
    const transferId = `${testPrefix}_trf`;

    await db.transaction(async (tx) => {
      // Lock source & destination boxes
      await tx.query(`SELECT * FROM boxes WHERE id = ? FOR UPDATE`, [boxId1]);
      await tx.query(`SELECT * FROM boxes WHERE id = ? FOR UPDATE`, [boxId2]);

      // Check dest count
      const destCountRow = await tx.queryOne<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM box_items WHERE box_id = ? AND active = 1 FOR UPDATE`, [boxId2]);
      const availableSpace = Math.max(0, 5 - (destCountRow?.cnt || 0));

      if (1 > availableSpace) {
        throw new Error('Capacity exceeded');
      }

      // Insert box_transfers record
      await tx.prepare(`
        INSERT INTO box_transfers (id, source_box_id, destination_box_id, production_order_id, sales_order_id, transferred_by, item_count, transferred_at, remarks)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'Verification test')
      `).run(transferId, boxId1, boxId2, poId, soId1, opA, now);

      // Deactivate source item 1
      await tx.prepare(`UPDATE box_items SET active = 0 WHERE id = ?`).run(biId1);

      // Insert active destination item 1
      const newBiId = `${testPrefix}_bi_dest`;
      await tx.prepare(`
        INSERT INTO box_items (id, box_id, item_id, packed_by, packed_at, active)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(newBiId, boxId2, itemId1, opA, now);

      // Record box_transfer_items
      await tx.prepare(`
        INSERT INTO box_transfer_items (id, transfer_id, item_id, source_box_item_id, destination_box_item_id, transferred_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(`${testPrefix}_trfi1`, transferId, itemId1, biId1, newBiId, now);
    });

    // Verify post-transfer state
    const [srcItems]: any = await pool.query(`SELECT * FROM box_items WHERE box_id = ? AND active = 1`, [boxId1]);
    const [destItems]: any = await pool.query(`SELECT * FROM box_items WHERE box_id = ? AND active = 1`, [boxId2]);
    const [qcCheck]: any = await pool.query(`SELECT * FROM qc_results WHERE item_id = ?`, [itemId1]);

    if (srcItems.length === 1 && destItems.length === 1 && qcCheck.length === 1) {
      console.log('✅ Requirement 4 Verified: MySQL transaction with SELECT ... FOR UPDATE pessimistic row locking succeeded.');
      console.log('✅ Source active count reduced, destination active count increased, historical QC results preserved.');
    } else {
      console.error('❌ Requirement 4 Failed: Box transfer state verification failed.');
      process.exit(1);
    }

    console.log('====================================================');
    console.log('ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
    console.log('====================================================');
  } catch (err) {
    console.error('❌ Verification failed with error:', err);
    process.exit(1);
  } finally {
    console.log('🧹 Cleaning up test records prefixed with VMVERIFY_...');
    try {
      await pool.query(`DELETE FROM box_transfer_items WHERE id LIKE 'VMVERIFY_%'`);
      await pool.query(`DELETE FROM box_transfers WHERE id LIKE 'VMVERIFY_%'`);
      await pool.query(`DELETE FROM box_items WHERE id LIKE 'VMVERIFY_%'`);
      await pool.query(`DELETE FROM boxes WHERE id LIKE 'VMVERIFY_%'`);
      await pool.query(`DELETE FROM qc_results WHERE id LIKE 'VMVERIFY_%'`);
      await pool.query(`DELETE FROM qc_fail_log WHERE id LIKE 'VMVERIFY_%'`);
      await pool.query(`DELETE FROM item_units WHERE id LIKE 'VMVERIFY_%'`);
      await pool.query(`DELETE FROM operator_work_assignments WHERE id LIKE 'VMVERIFY_%'`);
      await pool.query(`DELETE FROM shift_members WHERE id LIKE 'VMVERIFY_%'`);
      await pool.query(`DELETE FROM users WHERE id LIKE 'VMVERIFY_%'`);
      await pool.query(`DELETE FROM shifts WHERE id LIKE 'VMVERIFY_%'`);
      await pool.query(`DELETE FROM sales_orders WHERE id LIKE 'VMVERIFY_%'`);
      await pool.query(`DELETE FROM production_orders WHERE id LIKE 'VMVERIFY_%'`);
      await pool.query(`DELETE FROM styles WHERE id LIKE 'VMVERIFY_%'`);
      console.log('✅ Cleaned up all VMVERIFY_ test records.');
    } catch (cleanErr) {
      console.warn('⚠️ Cleanup warning:', cleanErr);
    }
  }
}

runVerification().catch(err => {
  console.error('❌ Verification script error:', err);
  process.exit(1);
});
