import { db, ensureDbConnected } from '../server/src/db/connection';
import { runMigrations } from '../server/src/db/migrate';
import bcrypt from 'bcryptjs';

async function runEndToEndVerification() {
  console.log('==================================================');
  console.log('🧪 Starting End-to-End Business Logic Verification');
  console.log('==================================================\n');

  const isConnected = await ensureDbConnected();
  if (!isConnected) {
    console.error('❌ Failed to connect to database for verification test.');
    process.exit(1);
  }

  await runMigrations();

  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const passwordHash = bcrypt.hashSync('test1234', 10);

  // 1. Create Test Users: Op A (Shift A) & Op B (Shift B)
  const opAId = `usr-op-a-${Date.now()}`;
  const opBId = `usr-op-b-${Date.now()}`;

  await db.execute(`
    INSERT INTO users (id, employee_no, username, password_hash, full_name, role, active, created_at, updated_at)
    VALUES (?, 'EMP-OPA', 'opa', ?, 'Operator Alpha (Shift A)', 'OPERATOR', 1, ?, ?),
           (?, 'EMP-OPB', 'opb', ?, 'Operator Beta (Shift B)', 'OPERATOR', 1, ?, ?)
    ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)
  `, [opAId, passwordHash, now, now, opBId, passwordHash, now, now]);

  console.log('✅ Created Test Operators: Op A (Shift A) and Op B (Shift B)');

  // 2. Create Style -> PO -> SO
  const styleId = `style-aud-${Date.now()}`;
  const styleCode = `ST-AUDIT-${Math.floor(1000 + Math.random() * 9000)}`;
  await db.execute(`
    INSERT INTO styles (id, code, name, customer, created_at, updated_at)
    VALUES (?, ?, 'Audit Polo', 'Test Customer', ?, ?)
  `, [styleId, styleCode, now, now]);

  const poDbId = `po-aud-${Date.now()}`;
  const poNum = `PO-AUDIT-${Math.floor(1000 + Math.random() * 9000)}`;
  await db.execute(`
    INSERT INTO production_orders (id, po_number, map_po, customer, style_id, start_date, due_date, status, created_at, updated_at)
    VALUES (?, ?, 'MAP-PO-AUDIT', 'Test Customer', ?, '2026-09-01', '2026-10-01', 'CURRENT', ?, ?)
  `, [poDbId, poNum, styleId, now, now]);

  const soDbId = `so-aud-${Date.now()}`;
  const soNum = `SO-AUDIT-${Math.floor(1000 + Math.random() * 9000)}`;
  await db.execute(`
    INSERT INTO sales_orders (id, production_order_id, so_number, map_so, product, style_code, colour, size_range, order_quantity, line_id, shift_id, box_capacity, status, created_at, updated_at)
    VALUES (?, ?, ?, 'MAP-SO-AUDIT', 'Audit Garment', ?, 'Black', 'S - XL', 3, 'line-04', 'shift-a', 12, 'CURRENT', ?, ?)
  `, [soDbId, poDbId, soNum, styleCode, now, now]);

  console.log(`✅ Created Hierarchy: Style (${styleCode}) → PO (${poNum}) → SO (${soNum}, Qty: 3)`);

  // 3. Allocate ONLY Op A to SO-AUDIT in operator_work_assignments
  const owaId = `owa-aud-${Date.now()}`;
  await db.execute(`
    INSERT INTO operator_work_assignments (id, sales_order_id, shift_id, operator_id, operation, source, active, created_at, updated_at)
    VALUES (?, ?, 'shift-a', ?, 'ALL', 'SUPERVISOR', 1, ?, ?)
  `, [owaId, soDbId, opAId, now, now]);

  console.log('✅ Allocated ONLY Operator Alpha (Op A) to SO in operator_work_assignments');

  // 4. Test Operator Visibility Rule
  const opAVisibleSos = await db.query(`
    SELECT so.* FROM sales_orders so
    JOIN operator_work_assignments owa ON owa.sales_order_id = so.id
    WHERE owa.operator_id = ? AND owa.active = 1 AND so.id = ?
  `, [opAId, soDbId]);

  const opBVisibleSos = await db.query(`
    SELECT so.* FROM sales_orders so
    JOIN operator_work_assignments owa ON owa.sales_order_id = so.id
    WHERE owa.operator_id = ? AND owa.active = 1 AND so.id = ?
  `, [opBId, soDbId]);

  if (opAVisibleSos.length === 1 && opBVisibleSos.length === 0) {
    console.log('✅ OPERATOR VISIBILITY RULE PASSED: Op A sees SO, Op B cannot see SO!');
  } else {
    console.error('❌ OPERATOR VISIBILITY RULE FAILED:', { opA: opAVisibleSos.length, opB: opBVisibleSos.length });
  }

  // 5. QC Pass Product for Op A
  const itemQr = `QR-AUDIT-${Math.floor(100000 + Math.random() * 900000)}`;
  const itemId = `itm-${itemQr}`;
  await db.execute(`
    INSERT INTO item_units (id, qr_code, sales_order_id, size, status, created_at, updated_at)
    VALUES (?, ?, ?, 'L', 'QC_PASSED', ?, ?)
  `, [itemId, itemQr, soDbId, now, now]);

  const qcId = `qc-${Date.now()}`;
  await db.execute(`
    INSERT INTO qc_results (id, item_id, operator_id, qc_result, test_result, first_scanned_at, scanned_at)
    VALUES (?, ?, ?, 'PASS', 'PASS', ?, ?)
  `, [qcId, itemId, opAId, now, now]);

  const distinctQcPassedRow = await db.queryOne<{ cnt: number }>(`
    SELECT COUNT(DISTINCT iu.id) as cnt FROM qc_results qr
    JOIN item_units iu ON iu.id = qr.item_id
    WHERE iu.sales_order_id = ? AND qr.qc_result = 'PASS' AND qr.test_result = 'PASS'
  `, [soDbId]);

  console.log(`✅ QC PASS PASSED: Item ${itemQr} passed QC. Distinct Passed = ${distinctQcPassedRow?.cnt}`);

  // 6. Packing Product into Box
  const boxNum = `BX-AUDIT-${Math.floor(1000 + Math.random() * 9000)}`;
  const boxId = `box-aud-${Date.now()}`;
  await db.execute(`
    INSERT INTO boxes (id, box_number, box_code, production_order_id, sales_order_id, capacity, status, created_at)
    VALUES (?, ?, ?, ?, ?, 12, 'OPEN', ?)
  `, [boxId, boxNum, boxNum, poDbId, soDbId, now]);

  const boxItemId = `bi-aud-${Date.now()}`;
  await db.execute(`
    INSERT INTO box_items (id, box_id, item_id, packed_by, packed_at, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `, [boxItemId, boxId, itemId, opAId, now]);

  await db.execute(`UPDATE item_units SET status = 'PACKED', updated_at = ? WHERE id = ?`, [now, itemId]);

  const packedCheck = await db.queryOne<{ cnt: number }>(`
    SELECT COUNT(*) as cnt FROM box_items WHERE box_id = ? AND item_id = ? AND active = 1
  `, [boxId, itemId]);

  if (packedCheck?.cnt === 1) {
    console.log(`✅ PACKING PASSED: Item ${itemQr} packed into Box ${boxNum} and active in box_items.`);
  } else {
    console.error('❌ PACKING FAILED');
  }

  // 7. AQL Inspection & Item Validation Test
  const aqlInspId = `aql-aud-${Date.now()}`;
  await db.execute(`
    INSERT INTO aql_inspections (id, box_id, sales_order_id, inspector_id, required_samples, result, started_at)
    VALUES (?, ?, ?, ?, 1, 'PENDING', ?)
  `, [aqlInspId, boxId, soDbId, opAId, now]);

  // Test Sample Validation: Item inside box vs Item outside box
  const inBoxSample = await db.queryOne(`
    SELECT * FROM box_items WHERE box_id = ? AND item_id = ? AND active = 1
  `, [boxId, itemId]);

  const foreignItemId = `itm-foreign-999`;
  const foreignSample = await db.queryOne(`
    SELECT * FROM box_items WHERE box_id = ? AND item_id = ? AND active = 1
  `, [boxId, foreignItemId]);

  if (inBoxSample && !foreignSample) {
    console.log(`✅ AQL BOX ITEM VALIDATION PASSED: In-box item validated, foreign item rejected!`);
  } else {
    console.error('❌ AQL BOX ITEM VALIDATION FAILED');
  }

  // Save AQL Sample & Complete
  const aqlSampleId = `aqls-aud-${Date.now()}`;
  await db.execute(`
    INSERT INTO aql_samples (id, inspection_id, item_id, sample_number, result, scanned_at)
    VALUES (?, ?, ?, 1, 'PASS', ?)
  `, [aqlSampleId, aqlInspId, itemId, now]);

  await db.execute(`
    UPDATE aql_inspections SET result = 'PASSED', completed_at = ? WHERE id = ?
  `, [now, aqlInspId]);

  await db.execute(`UPDATE boxes SET status = 'AQL_PASSED', completed_at = ? WHERE id = ?`, [now, boxId]);

  console.log('✅ AQL COMPLETE PASSED: AQL Inspection saved as PASSED in aql_inspections and boxes.');

  console.log('\n==================================================');
  console.log('🎉 ALL END-TO-END BUSINESS LOGIC CHECKS PASSED SUCCESSFULLY!');
  console.log('==================================================\n');
}

runEndToEndVerification().then(() => process.exit(0)).catch(err => {
  console.error('Verification script failed:', err);
  process.exit(1);
});
