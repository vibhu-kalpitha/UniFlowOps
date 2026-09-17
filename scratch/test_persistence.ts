import { db, ensureDbConnected } from '../server/src/db/connection';
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

async function testPersistence() {
  await ensureDbConnected();

  const poDbId = 'po-test-' + Date.now();
  const poNumber = 'PO-VERIFY-' + Math.floor(1000 + Math.random() * 9000);
  const now = new Date().toISOString();

  console.log(`[TEST] Creating PO ${poNumber} (dbId: ${poDbId})...`);

  db.transaction(() => {
    db.prepare(`
      INSERT INTO production_orders (id, po_number, map_po, customer, start_date, due_date, supervisor_id, remarks, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(poDbId, poNumber, 'MAP-VERIFY-99', 'Nike Verified', '2026-09-17', '2026-10-10', 'usr-002', 'Disk Persistence Proof PO', 'CURRENT', now, now);

    db.prepare(`
      INSERT INTO sales_orders (id, production_order_id, so_number, map_so, product, style_code, colour, size_range, order_quantity, line_id, shift_id, box_capacity, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'In Progress', ?, ?)
    `).run(`so-${Date.now()}`, poDbId, `SO-VERIFY-${poNumber}`, 'MAP-SO-99', 'Running Shirt', 'ST-NK-800', 'Black', 'S-XL', 500, 'line-01', 'shift-c', 12, now, now);
  })();

  console.log(`[TEST] Transaction committed. Now opening raw disk file directly without connection module...`);

  const dbPath = path.resolve('./server/data/uniflow.db');
  const filebuffer = fs.readFileSync(dbPath);
  const SQL = await initSqlJs();
  const freshDb = new SQL.Database(filebuffer);

  const poRead = freshDb.exec(`SELECT * FROM production_orders WHERE po_number = '${poNumber}'`);
  const soRead = freshDb.exec(`SELECT * FROM sales_orders WHERE production_order_id = '${poDbId}'`);

  console.log(`[TEST] Independent Disk Read - PO:`, JSON.stringify(poRead, null, 2));
  console.log(`[TEST] Independent Disk Read - SO:`, JSON.stringify(soRead, null, 2));

  if (poRead.length > 0 && poRead[0].values.length > 0) {
    console.log(`✅ DISK PERSISTENCE VERIFIED SUCCESSFUL! PO ${poNumber} EXISTS ON DISK!`);
  } else {
    console.error(`❌ DISK PERSISTENCE FAILED! PO ${poNumber} NOT FOUND ON DISK!`);
    process.exit(1);
  }
}

testPersistence().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
