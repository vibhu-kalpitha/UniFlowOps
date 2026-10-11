import Database from 'better-sqlite3';
const db = new Database('server/uniflow.db');

const rows = db.prepare('SELECT * FROM operator_work_assignments').all();
console.log(rows);
