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
  console.log('🔧 Running Idempotent Schema Alignment (005 PO Product Configurations)...');

  if (await tableExists('production_orders')) {
    if (!(await columnExists('production_orders', 'qc_test_mode'))) {
      await db.exec(`ALTER TABLE production_orders ADD COLUMN qc_test_mode VARCHAR(50) NOT NULL DEFAULT 'QC_AND_TEST' AFTER supervisor_id;`);
    }
    if (!(await columnExists('production_orders', 'shift_id'))) {
      await db.exec(`ALTER TABLE production_orders ADD COLUMN shift_id VARCHAR(191) NULL AFTER qc_test_mode;`);
    }
    if (await tableExists('shifts') && !(await constraintExists('production_orders', 'fk_po_shift')) && !(await indexExists('production_orders', 'idx_po_shift'))) {
      await db.exec(`ALTER TABLE production_orders ADD CONSTRAINT fk_po_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL;`);
    }
  }

  if (!(await tableExists('production_order_configs'))) {
    await db.exec(`
      CREATE TABLE production_order_configs (
        id VARCHAR(191) PRIMARY KEY,
        production_order_id VARCHAR(191) NOT NULL,
        config_code VARCHAR(191) NOT NULL,
        product_type VARCHAR(50) NULL,
        size VARCHAR(50) NULL,
        product_qr_prefix VARCHAR(191) NULL,
        product_serial_start BIGINT NULL,
        product_serial_end BIGINT NULL,
        quantity INT NOT NULL,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        INDEX idx_poc_po (production_order_id),
        INDEX idx_poc_prefix (product_qr_prefix),
        FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  if (await tableExists('operator_work_assignments')) {
    if (!(await columnExists('operator_work_assignments', 'production_order_id'))) {
      await db.exec(`ALTER TABLE operator_work_assignments ADD COLUMN production_order_id VARCHAR(191) NULL AFTER id;`);
    }
    await db.exec(`ALTER TABLE operator_work_assignments MODIFY COLUMN sales_order_id VARCHAR(191) NULL;`);

    if (await tableExists('sales_orders')) {
      await db.exec(`
        UPDATE operator_work_assignments owa
        JOIN sales_orders so ON so.id = owa.sales_order_id
        SET owa.production_order_id = so.production_order_id
        WHERE owa.production_order_id IS NULL AND owa.sales_order_id IS NOT NULL;
      `);
    }

    if (!(await constraintExists('operator_work_assignments', 'fk_owa_po')) && !(await indexExists('operator_work_assignments', 'idx_owa_po'))) {
      await db.exec(`ALTER TABLE operator_work_assignments ADD CONSTRAINT fk_owa_po FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE CASCADE;`);
    }
  }

  if (await tableExists('item_units')) {
    await db.exec(`ALTER TABLE item_units MODIFY COLUMN sales_order_id VARCHAR(191) NULL;`);
    if (!(await columnExists('item_units', 'production_order_id'))) {
      await db.exec(`ALTER TABLE item_units ADD COLUMN production_order_id VARCHAR(191) NULL AFTER sales_order_id;`);
    }
    if (!(await columnExists('item_units', 'product_config_id'))) {
      await db.exec(`ALTER TABLE item_units ADD COLUMN product_config_id VARCHAR(191) NULL AFTER production_order_id;`);
    }

    if (await tableExists('sales_orders')) {
      await db.exec(`
        UPDATE item_units iu
        JOIN sales_orders so ON so.id = iu.sales_order_id
        SET iu.production_order_id = so.production_order_id
        WHERE iu.production_order_id IS NULL AND iu.sales_order_id IS NOT NULL;
      `);
    }
  }

  if (await tableExists('boxes')) {
    await db.exec(`ALTER TABLE boxes MODIFY COLUMN sales_order_id VARCHAR(191) NULL;`);
    if (await tableExists('sales_orders')) {
      await db.exec(`
        UPDATE boxes b
        JOIN sales_orders so ON so.id = b.sales_order_id
        SET b.production_order_id = so.production_order_id
        WHERE b.production_order_id IS NULL AND b.sales_order_id IS NOT NULL;
      `);
    }
  }

  if (await tableExists('aql_inspections')) {
    await db.exec(`ALTER TABLE aql_inspections MODIFY COLUMN sales_order_id VARCHAR(191) NULL;`);
    if (!(await columnExists('aql_inspections', 'production_order_id'))) {
      await db.exec(`ALTER TABLE aql_inspections ADD COLUMN production_order_id VARCHAR(191) NULL AFTER sales_order_id;`);
    }
    if (await tableExists('boxes')) {
      await db.exec(`
        UPDATE aql_inspections ai
        JOIN boxes b ON (b.id = ai.box_id OR UPPER(TRIM(b.box_code)) = UPPER(TRIM(ai.box_id)) OR UPPER(TRIM(b.box_number)) = UPPER(TRIM(ai.box_id)))
        SET ai.production_order_id = b.production_order_id
        WHERE ai.production_order_id IS NULL AND b.production_order_id IS NOT NULL;
      `);
    }
    if (await tableExists('sales_orders')) {
      await db.exec(`
        UPDATE aql_inspections ai
        JOIN sales_orders so ON so.id = ai.sales_order_id
        SET ai.production_order_id = so.production_order_id
        WHERE ai.production_order_id IS NULL AND so.production_order_id IS NOT NULL;
      `);
    }
  }
}

/**
 * runStartupColumnChecks — Runs on EVERY server startup.
 * Adds any missing critical columns that may not exist on servers where
 * older migrations were already recorded as applied before the columns were added.
 * Each statement is individually try/caught. The whole function is also wrapped
 * so it NEVER crashes the server — only logs warnings on failure.
 */
async function runStartupColumnChecks(): Promise<void> {
  try {
    console.log('🔍 Running startup column checks (idempotent)...');

    // ── production_orders columns ────────────────────────────────────
    if (await tableExists('production_orders')) {
      // qc_test_mode
      if (!(await columnExists('production_orders', 'qc_test_mode'))) {
        try {
          await db.exec(`ALTER TABLE production_orders ADD COLUMN qc_test_mode VARCHAR(50) NOT NULL DEFAULT 'QC_AND_TEST' AFTER supervisor_id`);
          console.log('  ✅ Added production_orders.qc_test_mode');
        } catch (e: any) { console.warn('  ⚠️ qc_test_mode:', e.message); }
      }

      // shift_id — the column missing on live server causing "unknown column" error
      if (!(await columnExists('production_orders', 'shift_id'))) {
        try {
          await db.exec(`ALTER TABLE production_orders ADD COLUMN shift_id VARCHAR(191) NULL AFTER qc_test_mode`);
          console.log('  ✅ Added production_orders.shift_id');
        } catch (e: any) { console.warn('  ⚠️ shift_id:', e.message); }
      }

      // FK fk_po_shift (only if shifts table exists and FK not already there)
      try {
        if (await tableExists('shifts')
          && !(await constraintExists('production_orders', 'fk_po_shift'))
          && !(await indexExists('production_orders', 'idx_po_shift'))
          && !(await indexExists('production_orders', 'fk_po_shift'))) {
          await db.exec(`ALTER TABLE production_orders ADD CONSTRAINT fk_po_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL`);
          console.log('  ✅ Added FK fk_po_shift');
        }
      } catch (e: any) { console.warn('  ⚠️ FK fk_po_shift (non-fatal):', e.message); }
    }

    // ── operator_work_assignments columns ────────────────────────────
    if (await tableExists('operator_work_assignments')) {
      if (!(await columnExists('operator_work_assignments', 'production_order_id'))) {
        try {
          await db.exec(`ALTER TABLE operator_work_assignments ADD COLUMN production_order_id VARCHAR(191) NULL AFTER id`);
          console.log('  ✅ Added operator_work_assignments.production_order_id');
        } catch (e: any) { console.warn('  ⚠️ production_order_id:', e.message); }
      }
      if (!(await columnExists('operator_work_assignments', 'assigned_by'))) {
        try {
          await db.exec(`ALTER TABLE operator_work_assignments ADD COLUMN assigned_by VARCHAR(191) NULL AFTER source`);
        } catch (e: any) { console.warn('  ⚠️ assigned_by:', e.message); }
      }
      if (!(await columnExists('operator_work_assignments', 'updated_at'))) {
        try {
          await db.exec(`ALTER TABLE operator_work_assignments ADD COLUMN updated_at DATETIME(3) NULL AFTER created_at`);
        } catch (e: any) { console.warn('  ⚠️ updated_at:', e.message); }
      }

      // Make sales_order_id nullable (safe to run even if already nullable)
      try {
        await db.exec(`ALTER TABLE operator_work_assignments MODIFY COLUMN sales_order_id VARCHAR(191) NULL`);
      } catch (_) { /* non-fatal */ }

      // FK fk_owa_po
      try {
        if (await tableExists('production_orders')
          && !(await constraintExists('operator_work_assignments', 'fk_owa_po'))
          && !(await indexExists('operator_work_assignments', 'fk_owa_po'))) {
          await db.exec(`ALTER TABLE operator_work_assignments ADD CONSTRAINT fk_owa_po FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE CASCADE`);
          console.log('  ✅ Added FK fk_owa_po');
        }
      } catch (e: any) { console.warn('  ⚠️ FK fk_owa_po (non-fatal):', e.message); }
    }

    // ── production_order_configs table ───────────────────────────────
    try {
      if (!(await tableExists('production_order_configs'))) {
        await db.exec(`
          CREATE TABLE production_order_configs (
            id VARCHAR(191) PRIMARY KEY,
            production_order_id VARCHAR(191) NOT NULL,
            config_code VARCHAR(191) NOT NULL,
            product_type VARCHAR(50) NULL,
            size VARCHAR(50) NULL,
            product_qr_prefix VARCHAR(191) NULL,
            product_serial_start BIGINT NULL,
            product_serial_end BIGINT NULL,
            quantity INT NOT NULL,
            created_at DATETIME(3) NOT NULL,
            updated_at DATETIME(3) NOT NULL,
            INDEX idx_poc_po (production_order_id),
            INDEX idx_poc_prefix (product_qr_prefix),
            FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE CASCADE
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('  ✅ Created production_order_configs table');
      } else {
        await db.exec(`ALTER TABLE production_order_configs MODIFY COLUMN product_serial_start BIGINT NULL;`).catch(() => {});
        await db.exec(`ALTER TABLE production_order_configs MODIFY COLUMN product_serial_end BIGINT NULL;`).catch(() => {});
        await db.exec(`ALTER TABLE production_order_configs MODIFY COLUMN product_qr_prefix VARCHAR(191) NULL;`).catch(() => {});
      }
    } catch (e: any) { console.warn('  ⚠️ production_order_configs:', e.message); }

    // ── production_order_operations table ────────────────────────────
    try {
      if (!(await tableExists('production_order_operations'))) {
        await db.exec(`
          CREATE TABLE production_order_operations (
            production_order_id VARCHAR(191) NOT NULL,
            operation ENUM('QC_TEST','PACKING','AQL','BOX_TRANSFER') NOT NULL,
            PRIMARY KEY (production_order_id, operation),
            FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE CASCADE
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('  ✅ Created production_order_operations table');
      }
    } catch (e: any) { console.warn('  ⚠️ production_order_operations:', e.message); }

    console.log('✅ Startup column checks complete.');
  } catch (outerErr: any) {
    // NEVER crash the server — just log and continue
    console.error('⚠️ runStartupColumnChecks encountered an error (non-fatal, server will continue):', outerErr?.message || outerErr);
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

  // 2. Always run critical column checks on every startup (idempotent)
  //    This handles cases where migrations were already applied before new columns were added
  await runStartupColumnChecks();

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
    } else if (file === '005_po_product_configurations.sql') {
      await runSchemaAlignment005();
    } else if (file === '006_po_shift_and_owa_po.sql') {
      // Safely add shift_id to production_orders
      if (await tableExists('production_orders') && !(await columnExists('production_orders', 'shift_id'))) {
        try { await db.exec(`ALTER TABLE production_orders ADD COLUMN shift_id VARCHAR(191) NULL`); }
        catch (e: any) { console.warn('  006: shift_id already exists (non-fatal)'); }
      }
      // Safely add production_order_id to operator_work_assignments
      if (await tableExists('operator_work_assignments') && !(await columnExists('operator_work_assignments', 'production_order_id'))) {
        try { await db.exec(`ALTER TABLE operator_work_assignments ADD COLUMN production_order_id VARCHAR(191) NULL`); }
        catch (e: any) { console.warn('  006: production_order_id already exists (non-fatal)'); }
      }
      // FK for shift_id (idempotent)
      try {
        if (await tableExists('shifts') && !(await constraintExists('production_orders', 'fk_po_shift')) && !(await indexExists('production_orders', 'fk_po_shift'))) {
          await db.exec(`ALTER TABLE production_orders ADD CONSTRAINT fk_po_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL`);
        }
      } catch (_) { /* non-fatal */ }
      // FK for production_order_id (idempotent)
      try {
        if (await tableExists('production_orders') && !(await constraintExists('operator_work_assignments', 'fk_owa_po')) && !(await indexExists('operator_work_assignments', 'fk_owa_po'))) {
          await db.exec(`ALTER TABLE operator_work_assignments ADD CONSTRAINT fk_owa_po FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE CASCADE`);
        }
      } catch (_) { /* non-fatal */ }
    } else {
      const sql = fs.readFileSync(filePath, 'utf-8');
      await db.exec(sql);
    }

    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
    await db.execute(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`, [file, now]);

    applied.push(file);
    console.log(`✅ Applied MySQL Migration: ${file}`);
  }

async function runSchemaAlignment007(): Promise<void> {
  console.log('🔧 Running Idempotent Schema Alignment (007 Permanently Removed Items & AQL Sample Actions)...');

  if (!(await tableExists('permanently_removed_items'))) {
    await db.exec(`
      CREATE TABLE permanently_removed_items (
        id VARCHAR(191) PRIMARY KEY,
        item_id VARCHAR(191) NULL,
        item_qr VARCHAR(191) NOT NULL,
        box_id VARCHAR(191) NULL,
        production_order_id VARCHAR(191) NULL,
        removed_by VARCHAR(191) NOT NULL,
        action_type VARCHAR(100) NOT NULL DEFAULT 'PERMANENTLY_REMOVE',
        reason TEXT NULL,
        removed_at DATETIME(3) NOT NULL,
        INDEX idx_prm_qr (item_qr),
        INDEX idx_prm_po (production_order_id),
        INDEX idx_prm_box (box_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  if (await tableExists('aql_samples')) {
    if (!(await columnExists('aql_samples', 'action_type'))) {
      await db.exec(`ALTER TABLE aql_samples ADD COLUMN action_type VARCHAR(100) NULL AFTER result;`);
    }
    if (!(await columnExists('aql_samples', 'failure_reason'))) {
      await db.exec(`ALTER TABLE aql_samples ADD COLUMN failure_reason TEXT NULL AFTER action_type;`);
    }
  }
}

  console.log(`🎉 Migrations summary: ${applied.length} applied, ${skipped.length} already up-to-date.`);
  await runSchemaAlignment007();
  return { applied, skipped };
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  ensureDbConnected()
    .then(() => runMigrations())
    .then(() => process.exit(0))
    .catch(err => {
      console.error('⚠️ Migration encountered an error (server will still start):', err?.message || err);
      // Exit 0 so the Dockerfile CMD "migrate.js && index.js" always continues to start the server
      process.exit(0);
    });
}
