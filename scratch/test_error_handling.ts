import { db, ensureDbConnected } from '../server/src/db/connection';

async function testErrorHandling() {
  await ensureDbConnected();

  console.log('[TEST] Verifying invalid SQL error propagation...');
  try {
    db.transaction(() => {
      db.prepare(`INSERT INTO non_existent_table (id) VALUES ('123')`).run();
    })();
    console.error('❌ FAILED: Invalid SQL did not throw an exception!');
    process.exit(1);
  } catch (err: any) {
    console.log('✅ EXCEPTION CORRECTLY CAUGHT AND PROPAGATED:', err.message);
  }
}

testErrorHandling().catch(err => {
  console.error(err);
  process.exit(1);
});
