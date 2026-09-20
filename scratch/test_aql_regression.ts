import { db, ensureDbConnected } from '../server/src/db/connection';
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

async function testAqlRegression() {
  await ensureDbConnected();

  const inspId = 'aql-test-' + Date.now();
  const boxId = 'box-test-' + Date.now();
  const now = new Date().toISOString();

  console.log(`[AQL TEST] Inserting AQL inspection ${inspId}...`);

  db.transaction(() => {
    db.prepare(`
      INSERT INTO boxes (id, box_number, sales_order_id, capacity, status, created_at)
      VALUES (?, ?, 'so-1789644618676-9517', 12, 'AQL_PASSED', ?)
    `).run(boxId, `BX-TEST-${Date.now().toString().slice(-4)}`, now);

    db.prepare(`
      INSERT INTO aql_inspections (id, box_id, inspector_id, required_samples, result, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(inspId, boxId, 'usr-001', 3, 'PASSED', now, now);
  })();

  // Independent disk read
  const dbPath = path.resolve('./server/data/uniflow.db');
  const filebuffer = fs.readFileSync(dbPath);
  const SQL = await initSqlJs();
  const freshDb = new SQL.Database(filebuffer);

  const aqlRead = freshDb.exec(`SELECT * FROM aql_inspections WHERE id = '${inspId}'`);
  console.log('[AQL TEST] Independent Disk Read Result:', JSON.stringify(aqlRead, null, 2));

  if (aqlRead.length > 0 && aqlRead[0].values.length > 0) {
    console.log(`✅ AQL PERSISTENCE REGRESSION TEST PASSED! AQL INSPECTION ${inspId} SURVIVED ON DISK!`);
  } else {
    console.error(`❌ AQL REGRESSION TEST FAILED!`);
    process.exit(1);
  }
}

testAqlRegression().catch(err => {
  console.error(err);
  process.exit(1);
});
