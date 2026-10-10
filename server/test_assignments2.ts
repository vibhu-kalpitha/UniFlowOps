import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
import { db, ensureDbConnected } from './src/db/connection.js';

async function main() {
  await ensureDbConnected();
  const assignments = await db.query(`SELECT * FROM operator_work_assignments`);
  console.log(assignments);
  process.exit(0);
}
main();
