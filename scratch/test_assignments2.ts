import { db, ensureDbConnected } from 'e:/Innovus/Documents/UniFlowOps/server/src/db/connection';

async function main() {
  await ensureDbConnected();
  const assignments = await db.query(`SELECT * FROM operator_work_assignments`);
  console.log(assignments);
  process.exit(0);
}
main();
