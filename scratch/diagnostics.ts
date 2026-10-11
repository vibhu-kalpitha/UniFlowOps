import { config } from 'dotenv';
config();
import { db, ensureDbConnected } from '../server/src/db/connection.js';

async function run() {
  const isConnected = await ensureDbConnected();
  if (!isConnected) {
    console.error("Not connected to DB");
    process.exit(1);
  }

  const op = await db.prepare("SELECT * FROM users WHERE role = 'OPERATOR' AND active = 1").all();
  console.log("Operators:");
  console.log(op.map((o: any) => ({ id: o.id, username: o.username, role: o.role, full_name: o.full_name })));

  const assignments = await db.prepare("SELECT * FROM operator_work_assignments").all();
  console.log("\nAll Work Assignments:");
  console.log(assignments.map((a: any) => ({
    id: a.id,
    po_id: a.production_order_id,
    so_id: a.sales_order_id,
    op_id: a.operator_id,
    op: a.operation,
    active: a.active
  })));

  const pos = await db.prepare("SELECT * FROM production_orders").all();
  console.log("\nProduction Orders:");
  console.log(pos.map((po: any) => ({
    id: po.id,
    po_number: po.po_number,
    status: po.status
  })));

  process.exit(0);
}

run().catch(console.error);
