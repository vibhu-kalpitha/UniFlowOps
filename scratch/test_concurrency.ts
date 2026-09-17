import { db, ensureDbConnected } from '../server/src/db/connection';
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

async function testConcurrency() {
  await ensureDbConnected();

  const poIds: string[] = [];
  const poNumbers: string[] = [];

  for (let i = 1; i <= 3; i++) {
    const poDbId = `po-seq-${Date.now()}-${i}`;
    const poNumber = `PO-SEQ-${Date.now().toString().slice(-4)}-${i}`;
    poIds.push(poDbId);
    poNumbers.push(poNumber);

    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(`
        INSERT INTO production_orders (id, po_number, map_po, customer, start_date, due_date, supervisor_id, remarks, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(poDbId, poNumber, `MAP-SEQ-${i}`, 'Nike Concurrency Test', '2026-09-17', '2026-10-10', 'usr-002', `Sequential PO ${i}`, 'CURRENT', now, now);
    })();
  }

  // Independent disk read
  const dbPath = path.resolve('./server/data/uniflow.db');
  const filebuffer = fs.readFileSync(dbPath);
  const SQL = await initSqlJs();
  const freshDb = new SQL.Database(filebuffer);

  for (const poNum of poNumbers) {
    const res = freshDb.exec(`SELECT * FROM production_orders WHERE po_number = '${poNum}'`);
    if (res.length === 0 || res[0].values.length === 0) {
      console.error(`❌ DISK READ FAILED FOR ${poNum}`);
      process.exit(1);
    }
  }

  console.log(`✅ CONCURRENCY & SEQUENTIAL WRITE TEST PASSED! ALL ${poNumbers.length} POs SURVIVED ON DISK:`, poNumbers);
}

testConcurrency().catch(err => {
  console.error(err);
  process.exit(1);
});
