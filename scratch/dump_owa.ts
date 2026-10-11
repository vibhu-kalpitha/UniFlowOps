import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: 'uniflow_ops'
  });
  const [rows] = await conn.query(`SELECT * FROM operator_work_assignments`);
  console.log("operator_work_assignments:");
  console.table((rows as any[]).map(r => ({
    id: r.id,
    poId: r.production_order_id?.slice(0, 8),
    soId: r.sales_order_id?.slice(0, 8),
    shiftId: r.shift_id?.slice(0, 8),
    opId: r.operator_id?.slice(0, 8),
    operation: r.operation,
    active: r.active
  })));
  await conn.end();
}

main().catch(console.error);
