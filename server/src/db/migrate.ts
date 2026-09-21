import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, ensureDbConnected } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper functions for safe MySQL 8.0 information_schema inspections
export async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const rows = await db.query<{ cnt: number }>(`
    SELECT COUNT(*) as cnt FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
  `, [tableName, columnName]);
  return (rows[0]?.cnt || 0) > 0;
}

export async function indexExists(tableName: string, indexName: string): Promise<boolean> {
  const rows = await db.query<{ cnt: number }>(`
    SELECT COUNT(*) as cnt FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
  `, [tableName, indexName]);
  return (rows[0]?.cnt || 0) > 0;
}

export async function constraintExists(tableName: string, constraintName: string): Promise<boolean> {
  const rows = await db.query<{ cnt: number }>(`
    SELECT COUNT(*) as cnt FROM information_schema.table_constraints
    WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = ?
  `, [tableName, constraintName]);
  return (rows[0]?.cnt || 0) > 0;
}

export async function tableExists(tableName: string): Promise<boolean> {
  const rows = await db.query<{ cnt: number }>(`
    SELECT COUNT(*) as cnt FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = ?
  `, [tableName]);
  return (rows[0]?.cnt || 0) > 0;
}

async function runSchemaAlignment002(): Promise<void> {
  console.log('🔧 Running Idempotent Schema Alignment (002) via information_schema...');

  // 1. Drop obsolete legacy table if present
  if (await tableExists('so_operator_allocations')) {
    await db.exec(`DROP TABLE so_operator_allocations;`);
  }

  // 2. Align operator_work_assignments table
  if (await tableExists('operator_work_assignments')) {
    if (!(await columnExists('operator_work_assignments', 'shift_id'))) {
      await db.exec(`ALTER TABLE operator_work_assignments ADD COLUMN shift_id VARCHAR(191) NULL AFTER sales_order_id;`);
    }
    if (!(await columnExists('operator_work_assignments', 'assigned_by'))) {
      await db.exec(`ALTER TABLE operator_work_assignments ADD COLUMN assigned_by VARCHAR(191) NULL AFTER source;`);
    }
    if (!(await columnExists('operator_work_assignments', 'updated_at'))) {
      await db.exec(`ALTER TABLE operator_work_assignments ADD COLUMN updated_at DATETIME(3) NULL AFTER created_at;`);
    }
    if (!(await constraintExists('operator_work_assignments', 'fk_owa_shift'))) {
      await db.exec(`ALTER TABLE operator_work_assignments ADD CONSTRAINT fk_owa_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL;`);
    }
    if (!(await constraintExists('operator_work_assignments', 'uq_owa_so_shift_operator')) && !(await indexExists('operator_work_assignments', 'uq_owa_so_shift_operator'))) {
      await db.exec(`ALTER TABLE operator_work_assignments ADD CONSTRAINT uq_owa_so_shift_operator UNIQUE (sales_order_id, shift_id, operator_id);`);
    }
  }

  // 3. Align boxes table
  if (await tableExists('boxes')) {
    if (!(await columnExists('boxes', 'box_code'))) {
      await db.exec(`ALTER TABLE boxes ADD COLUMN box_code VARCHAR(191) NULL AFTER box_number;`);
    }
    if (!(await columnExists('boxes', 'production_order_id'))) {
      await db.exec(`ALTER TABLE boxes ADD COLUMN production_order_id VARCHAR(191) NULL AFTER box_code;`);
    }
    await db.exec(`UPDATE boxes SET box_code = box_number WHERE box_code IS NULL;`);
    if (!(await constraintExists('boxes', 'fk_boxes_po'))) {
      await db.exec(`ALTER TABLE boxes ADD CONSTRAINT fk_boxes_po FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE CASCADE;`);
    }
  }

  // 4. Align box_items table
  if (await tableExists('box_items')) {
    if (!(await columnExists('box_items', 'id'))) {
      await db.exec(`ALTER TABLE box_items ADD COLUMN id VARCHAR(191) NULL FIRST;`);
    }
    if (!(await columnExists('box_items', 'active'))) {
      await db.exec(`ALTER TABLE box_items ADD COLUMN active TINYINT NOT NULL DEFAULT 1 AFTER packed_at;`);
    }
    await db.exec(`UPDATE box_items SET id = CONCAT('bi-', box_id, '-', item_id) WHERE id IS NULL;`);
  }

  // 5. Align aql_inspections table
  if (await tableExists('aql_inspections')) {
    if (!(await columnExists('aql_inspections', 'sales_order_id'))) {
      await db.exec(`ALTER TABLE aql_inspections ADD COLUMN sales_order_id VARCHAR(191) NULL AFTER box_id;`);
    }
    if (!(await constraintExists('aql_inspections', 'fk_aql_so'))) {
      await db.exec(`ALTER TABLE aql_inspections ADD CONSTRAINT fk_aql_so FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE CASCADE;`);
    }
  }

  // 6. Ensure box_transfers and box_transfer_items exist
  if (!(await tableExists('box_transfers'))) {
    await db.exec(`
      CREATE TABLE box_transfers (
        id VARCHAR(191) PRIMARY KEY,
        source_box_id VARCHAR(191) NOT NULL,
        destination_box_id VARCHAR(191) NOT NULL,
        production_order_id VARCHAR(191) NULL,
        sales_order_id VARCHAR(191) NULL,
        transferred_by VARCHAR(191) NOT NULL,
        item_count INT NOT NULL DEFAULT 1,
        transferred_at DATETIME(3) NOT NULL,
        remarks TEXT NULL,
        INDEX idx_trf_source (source_box_id),
        INDEX idx_trf_dest (destination_box_id),
        FOREIGN KEY (source_box_id) REFERENCES boxes(id) ON DELETE CASCADE,
        FOREIGN KEY (destination_box_id) REFERENCES boxes(id) ON DELETE CASCADE,
        FOREIGN KEY (transferred_by) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  if (!(await tableExists('box_transfer_items'))) {
    await db.exec(`
      CREATE TABLE box_transfer_items (
        id VARCHAR(191) PRIMARY KEY,
        transfer_id VARCHAR(191) NOT NULL,
        item_id VARCHAR(191) NOT NULL,
        source_box_item_id VARCHAR(191) NULL,
        destination_box_item_id VARCHAR(191) NULL,
        transferred_at DATETIME(3) NOT NULL,
        INDEX idx_trf_items_trf (transfer_id),
        INDEX idx_trf_items_item (item_id),
        FOREIGN KEY (transfer_id) REFERENCES box_transfers(id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES item_units(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }
}

async function runSchemaAlignment004(): Promise<void> {
  console.log('🔧 Running Idempotent Schema Alignment (004 Product QR Range)...');
  if (await tableExists('sales_orders')) {
    if (!(await columnExists('sales_orders', 'product_qr_prefix'))) {
      await db.exec(`ALTER TABLE sales_orders ADD COLUMN product_qr_prefix VARCHAR(100) NULL AFTER box_capacity;`);
    }
    if (!(await columnExists('sales_orders', 'product_serial_start'))) {
      await db.exec(`ALTER TABLE sales_orders ADD COLUMN product_serial_start BIGINT NULL AFTER product_qr_prefix;`);
    }
    if (!(await columnExists('sales_orders', 'product_serial_end'))) {
      await db.exec(`ALTER TABLE sales_orders ADD COLUMN product_serial_end BIGINT NULL AFTER product_serial_start;`);
    }
  }
}

async function runSchemaAlignment005(): Promise<void> {
  console.log('🔧 Running Idempotent Schema Alignment (005 Performance Indexes)...');
  const indexSpecs = [
    { table: 'user_sessions', index: 'idx_sessions_lookup', sql: 'ALTER TABLE user_sessions ADD INDEX idx_sessions_lookup (token_hash, active);' },
    { table: 'production_orders', index: 'idx_po_status_sup', sql: 'ALTER TABLE production_orders ADD INDEX idx_po_status_sup (status, supervisor_id, created_at);' },
    { table: 'sales_orders', index: 'idx_so_po_status', sql: 'ALTER TABLE sales_orders ADD INDEX idx_so_po_status (production_order_id, status);' },
    { table: 'operator_work_assignments', index: 'idx_owa_active_lookup', sql: 'ALTER TABLE operator_work_assignments ADD INDEX idx_owa_active_lookup (sales_order_id, operator_id, active);' },
    { table: 'qc_results', index: 'idx_qc_metrics', sql: 'ALTER TABLE qc_results ADD INDEX idx_qc_metrics (operator_id, qc_result, test_result);' },
    { table: 'item_units', index: 'idx_item_units_so_status', sql: 'ALTER TABLE item_units ADD INDEX idx_item_units_so_status (sales_order_id, status);' },
    { table: 'boxes', index: 'idx_boxes_so_status', sql: 'ALTER TABLE boxes ADD INDEX idx_boxes_so_status (sales_order_id, status);' },
    { table: 'box_items', index: 'idx_box_items_active', sql: 'ALTER TABLE box_items ADD INDEX idx_box_items_active (box_id, active);' },
    { table: 'aql_inspections', index: 'idx_aql_so_result', sql: 'ALTER TABLE aql_inspections ADD INDEX idx_aql_so_result (sales_order_id, result);' }
  ];

  for (const item of indexSpecs) {
    if (await tableExists(item.table)) {
      if (!(await indexExists(item.table, item.index))) {
        await db.exec(item.sql);
      }
    }
  }
}

export async function runMigrations(): Promise<{ applied: string[]; skipped: string[] }> {
  const connected = await ensureDbConnected();
  if (!connected) {
    console.error('❌ Cannot run migrations: MySQL connection failed');
    return { applied: [], skipped: [] };
  }

  // 1. Ensure schema_migrations version tracking table exists
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(191) PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  const appliedRows = await db.query<{ version: string }>(`SELECT version FROM schema_migrations`);
  const appliedSet = new Set(appliedRows.map(r => r.version));

  const migrationsDir = path.resolve(__dirname, './migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.warn(`⚠️ Migrations directory not found: ${migrationsDir}`);
    return { applied: [], skipped: [] };
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (appliedSet.has(file)) {
      skipped.push(file);
      continue;
    }

    console.log(`📦 Applying MySQL Migration: ${file}...`);
    const filePath = path.join(migrationsDir, file);

    if (file === '002_schema_alignment.sql') {
      await runSchemaAlignment002();
      if (fs.existsSync(filePath)) {
        const sql = fs.readFileSync(filePath, 'utf-8').trim();
        if (sql) {
          await db.exec(sql);
        }
      }
    } else if (file === '004_so_product_qr_range.sql') {
      await runSchemaAlignment004();
    } else if (file === '005_performance_indexes.sql') {
      await runSchemaAlignment005();
    } else {
      const sql = fs.readFileSync(filePath, 'utf-8');
      await db.exec(sql);
    }

    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
    await db.execute(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`, [file, now]);

    applied.push(file);
    console.log(`✅ Applied MySQL Migration: ${file}`);
  }

  console.log(`🎉 Migrations summary: ${applied.length} applied, ${skipped.length} already up-to-date.`);
  return { applied, skipped };
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  ensureDbConnected().then(() => runMigrations()).then(() => process.exit(0)).catch(err => {
    console.error('Migration error:', err);
    process.exit(1);
  });
}
