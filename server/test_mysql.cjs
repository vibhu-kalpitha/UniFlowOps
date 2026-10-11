const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../.env' });

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'uniflow_ops_db'
  });
  
  const [cols] = await db.query('SHOW COLUMNS FROM operator_work_assignments');
  console.log(cols);
  
  const [rows] = await db.query('SELECT * FROM operator_work_assignments');
  console.log(rows);
  
  process.exit(0);
}
main();
