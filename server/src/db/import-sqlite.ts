import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';
import { db as mysqlDb, ensureDbConnected } from './connection.js';
import { runMigrations } from './migrate.js';

const dbPath = path.resolve(process.env.DATABASE_PATH || './server/data/uniflow.db');

export interface MigrationTableResult {
  table: string;
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  error?: string;
}

export async function importSqliteToMysql(): Promise<MigrationTableResult[]> {
  console.log('🚀 Starting Relational SQLite to MySQL Import Utility...');

  if (!fs.existsSync(dbPath)) {
    console.error(`❌ SQLite database file not found at: ${dbPath}`);
    return [];
  }

  const connected = await ensureDbConnected();
  if (!connected) {
    console.error('❌ Cannot connect to target MySQL database.');
    return [];
  }

  await runMigrations();

  const SQL = await initSqlJs();
  const filebuffer = fs.readFileSync(dbPath);
  const sqliteDb = new SQL.Database(filebuffer);

  // Strict parent-first dependency order
  const tables = [
    'users',
    'production_lines',
    'shifts',
    'shift_members',
    'styles',
    'production_orders',
    'production_order_operations',
    'sales_orders',
    'operator_work_assignments',
    'item_units',
    'qc_results',
    'qc_fail_log',
    'boxes',
    'box_items',
    'aql_inspections',
    'aql_samples',
    'box_transfers',
    'box_transfer_items',
    'alerts',
    'audit_logs',
    'scan_events'
  ];

  const results: MigrationTableResult[] = [];

  for (const table of tables) {
    let stmt: any;
    try {
      stmt = sqliteDb.prepare(`SELECT * FROM "${table}"`);
    } catch {
      // Table doesn't exist in SQLite
      results.push({ table, total: 0, imported: 0, skipped: 0, failed: 0 });
      continue;
    }

    const rows: any[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();

    if (rows.length === 0) {
      results.push({ table, total: 0, imported: 0, skipped: 0, failed: 0 });
      continue;
    }

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    let tableError: string | undefined = undefined;

    try {
      await mysqlDb.transaction(async (tx) => {
        for (const row of rows) {
          // Normalize column values
          const rawCols = Object.keys(row);

          // Handle box_items id requirement
          if (table === 'box_items' && !row['id']) {
            row['id'] = `bi-${row['box_id']}-${row['item_id']}`;
            if (!rawCols.includes('id')) rawCols.unshift('id');
          }

          const cols = rawCols.map(c => `\`${c}\``).join(', ');
          const placeholders = rawCols.map(() => '?').join(', ');
          const values = rawCols.map(c => row[c] === undefined ? null : row[c]);

          // Handle ON DUPLICATE KEY UPDATE / IGNORE
          const updateClauses = rawCols
            .filter(c => c !== 'id')
            .map(c => `\`${c}\` = VALUES(\`${c}\`)`)
            .join(', ');

          const sql = updateClauses.length > 0
            ? `INSERT INTO \`${table}\` (${cols}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClauses}`
            : `INSERT IGNORE INTO \`${table}\` (${cols}) VALUES (${placeholders})`;

          const res = await tx.execute(sql, values);
          if (res.changes > 0) {
            imported++;
          } else {
            skipped++;
          }
        }
      });
    } catch (err: any) {
      failed = rows.length - imported - skipped;
      tableError = err.message;
      console.error(`❌ Relational import failed for table '${table}':`, err.message);
    }

    results.push({ table, total: rows.length, imported, skipped, failed, error: tableError });
    console.log(`📊 Table '${table}': ${imported} imported, ${skipped} skipped, ${failed} failed.`);
  }

  sqliteDb.close();
  console.log('🎉 Relational SQLite to MySQL Import Complete.');
  return results;
}

if (process.argv[1]?.endsWith('import-sqlite.ts') || process.argv[1]?.endsWith('import-sqlite.js')) {
  importSqliteToMysql().then(() => process.exit(0)).catch(err => {
    console.error('Import process error:', err);
    process.exit(1);
  });
}
