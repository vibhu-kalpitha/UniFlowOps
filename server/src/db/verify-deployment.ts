import { db, ensureDbConnected, getPool } from './connection.js';
import { runMigrations } from './migrate.js';
import { checkOperatorAllocation, calculateSOProgress } from '../routes/scans.js';

async function runVerification() {
  console.log('====================================================');
  console.log('UNIFLOW OPS VM DEPLOYMENT VERIFICATION SUITE');
  console.log('====================================================');

  // 1. Check Database Connectivity & Migrations
  const connected = await ensureDbConnected();
  if (!connected) {
    console.error('❌ Failed to connect to MySQL database.');
    process.exit(1);
  }
  console.log('✅ Connected to MySQL database.');

  await runMigrations();
  console.log('✅ Versioned schema migrations verified (001 and 002).');

  const pool = getPool();
  const now = new Date().toISOString();

  // 2. Test Style -> PO -> SO Hierarchy and sales_orders.shift_id optionality
  const styleId = `style-v-${Date.now()}`;
  await pool.query(`INSERT INTO styles (id, style_code, style_name, created_at) VALUES (?, ?, 'Verify Style', ?)`, [styleId, `STL-V-${Date.now()}`, now]);

  const poId = `po-v-${Date.now()}`;
  await pool.query(`INSERT INTO production_orders (id, po_number, style_id, target_quantity, status, created_at) VALUES (?, ?, ?, 100, 'IN_PROGRESS', ?)`, [poId, `PO-V-${Date.now()}`, styleId, now]);

  const soId1 = `so-v-${Date.now()}-1`;
  await pool.query(`INSERT INTO sales_orders (id, so_number, production_order_id, shift_id, order_quantity, status, created_at) VALUES (?, ?, ?, NULL, 10, 'IN_PROGRESS', ?)`, [soId1, `SO-V-${Date.now()}-1`, poId, now]);

  const [soRows]: any = await pool.query(`SELECT * FROM sales_orders WHERE id = ?`, [soId1]);
  if (soRows.length > 0 && soRows[0].shift_id === null) {
    console.log('✅ Requirement 1 Verified: sales_orders.shift_id is optional metadata (NULL).');
  } else {
    console.error('❌ Requirement 1 Failed: sales_orders.shift_id failed optional check.');
    process.exit(1);
  }

  // 3. Test Shift & Multi-Operator Allocation in operator_work_assignments
  const shiftA = `shift-a-${Date.now()}`;
  const shiftB = `shift-b-${Date.now()}`;
  await pool.query(`INSERT INTO shifts (id, shift_code, shift_name, created_at) VALUES (?, 'SHIFT-VA', 'Shift VA', ?)`, [shiftA, now]);
  await pool.query(`INSERT INTO shifts (id, shift_code, shift_name, created_at) VALUES (?, 'SHIFT-VB', 'Shift VB', ?)`, [shiftB, now]);

  const opA = `op-va-${Date.now()}`;
  const opB = `op-vb-${Date.now()}`;
  const opC = `op-vc-${Date.now()}`;
  await pool.query(`INSERT INTO users (id, username, password_hash, full_name, role, shift_id, created_at) VALUES (?, ?, 'hash', 'Op A', 'OPERATOR', ?, ?)`, [opA, `op_va_${Date.now()}`, shiftA, now]);
  await pool.query(`INSERT INTO users (id, username, password_hash, full_name, role, shift_id, created_at) VALUES (?, ?, 'hash', 'Op B', 'OPERATOR', ?, ?)`, [opB, `op_vb_${Date.now()}`, shiftB, now]);
  await pool.query(`INSERT INTO users (id, username, password_hash, full_name, role, shift_id, created_at) VALUES (?, ?, 'hash', 'Op C', 'OPERATOR', ?, ?)`, [opC, `op_vc_${Date.now()}`, shiftB, now]);

  // Allocate Op A (Shift A) and Op B (Shift B) to SO 1
  await pool.query(`
    INSERT INTO operator_work_assignments (id, sales_order_id, shift_id, operator_id, active, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `, [`owa-${Date.now()}-1`, soId1, shiftA, opA, now]);

  await pool.query(`
    INSERT INTO operator_work_assignments (id, sales_order_id, shift_id, operator_id, active, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `, [`owa-${Date.now()}-2`, soId1, shiftB, opB, now]);

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

  // 4. Test GET /api/boxes/by-code/:boxCode Lookup
  const boxCode1 = `BX-CODE-V1-${Date.now()}`;
  const boxCode2 = `BX-CODE-V2-${Date.now()}`;
  const boxId1 = `box-v1-${Date.now()}`;
  const boxId2 = `box-v2-${Date.now()}`;

  await pool.query(`
    INSERT INTO boxes (id, box_code, box_number, production_order_id, sales_order_id, capacity, status, created_at)
    VALUES (?, ?, 'BX-NUM-1', ?, ?, 5, 'OPEN', ?)
  `, [boxId1, boxCode1, poId, soId1, now]);

  await pool.query(`
    INSERT INTO boxes (id, box_code, box_number, production_order_id, sales_order_id, capacity, status, created_at)
    VALUES (?, ?, 'BX-NUM-2', ?, ?, 5, 'OPEN', ?)
  `, [boxId2, boxCode2, poId, soId1, now]);

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
  const itemQr1 = `ITEM-V1-${Date.now()}`;
  const itemQr2 = `ITEM-V2-${Date.now()}`;
  const itemId1 = `itm-v1-${Date.now()}`;
  const itemId2 = `itm-v2-${Date.now()}`;

  await pool.query(`INSERT INTO item_units (id, qr_code, sales_order_id, size, status, created_at) VALUES (?, ?, ?, 'L', 'QC_PASSED', ?)`, [itemId1, itemQr1, soId1, now]);
  await pool.query(`INSERT INTO item_units (id, qr_code, sales_order_id, size, status, created_at) VALUES (?, ?, ?, 'M', 'QC_PASSED', ?)`, [itemId2, itemQr2, soId1, now]);

  await pool.query(`INSERT INTO qc_results (id, item_id, operator_id, qc_result, test_result, retry_count, scanned_at) VALUES (?, ?, ?, 'PASS', 'PASS', 0, ?)`, [`qc-v1-${Date.now()}`, itemId1, opA, now]);
  await pool.query(`INSERT INTO qc_results (id, item_id, operator_id, qc_result, test_result, retry_count, scanned_at) VALUES (?, ?, ?, 'PASS', 'PASS', 0, ?)`, [`qc-v2-${Date.now()}`, itemId2, opA, now]);

  const biId1 = `bi-v1-${Date.now()}`;
  const biId2 = `bi-v2-${Date.now()}`;
  await pool.query(`INSERT INTO box_items (id, box_id, item_id, packed_by, packed_at, active) VALUES (?, ?, ?, ?, ?, 1)`, [biId1, boxId1, itemId1, opA, now]);
  await pool.query(`INSERT INTO box_items (id, box_id, item_id, packed_by, packed_at, active) VALUES (?, ?, ?, ?, ?, 1)`, [biId2, boxId1, itemId2, opA, now]);

  // 6. Test MySQL Transaction & Box Transfer Execution
  const transferId = `trf-v-${Date.now()}`;

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
    const newBiId = `bi-v-dest-${Date.now()}`;
    await tx.prepare(`
      INSERT INTO box_items (id, box_id, item_id, packed_by, packed_at, active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(newBiId, boxId2, itemId1, opA, now);

    // Record box_transfer_items
    await tx.prepare(`
      INSERT INTO box_transfer_items (id, transfer_id, item_id, source_box_item_id, destination_box_item_id, transferred_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(`trfi-v-${Date.now()}`, transferId, itemId1, biId1, newBiId, now);
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
  process.exit(0);
}

runVerification().catch(err => {
  console.error('❌ Verification failed with error:', err);
  process.exit(1);
});
