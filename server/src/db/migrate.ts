import { db, ensureDbConnected } from './connection';

export function runMigrations(database = db) {
  database.exec(`
    -- 1. users
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      employee_no TEXT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('OPERATOR', 'SUPERVISOR', 'ADMIN')),
      phone TEXT,
      avatar_url TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 2. production_lines
    CREATE TABLE IF NOT EXISTS production_lines (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    -- 3. shifts
    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    -- 4. shift_members
    CREATE TABLE IF NOT EXISTS shift_members (
      id TEXT PRIMARY KEY,
      shift_id TEXT NOT NULL REFERENCES shifts(id),
      operator_id TEXT NOT NULL REFERENCES users(id),
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      active INTEGER NOT NULL DEFAULT 1
    );

    -- 5. production_orders
    CREATE TABLE IF NOT EXISTS production_orders (
      id TEXT PRIMARY KEY,
      po_number TEXT UNIQUE NOT NULL,
      map_po TEXT NOT NULL,
      customer TEXT NOT NULL,
      start_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      supervisor_id TEXT REFERENCES users(id),
      remarks TEXT,
      status TEXT NOT NULL CHECK(status IN ('DRAFT', 'CURRENT', 'COMPLETED', 'CANCELLED')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 6. production_order_operations
    CREATE TABLE IF NOT EXISTS production_order_operations (
      production_order_id TEXT NOT NULL REFERENCES production_orders(id),
      operation TEXT NOT NULL CHECK(operation IN ('QC_TEST', 'PACKING', 'AQL', 'BOX_TRANSFER')),
      PRIMARY KEY (production_order_id, operation)
    );

    -- 7. sales_orders
    CREATE TABLE IF NOT EXISTS sales_orders (
      id TEXT PRIMARY KEY,
      production_order_id TEXT NOT NULL REFERENCES production_orders(id),
      so_number TEXT UNIQUE NOT NULL,
      map_so TEXT NOT NULL,
      product TEXT NOT NULL,
      style_code TEXT NOT NULL,
      colour TEXT NOT NULL,
      size_range TEXT NOT NULL,
      order_quantity INTEGER NOT NULL,
      line_id TEXT REFERENCES production_lines(id),
      shift_id TEXT REFERENCES shifts(id),
      box_capacity INTEGER NOT NULL DEFAULT 12,
      status TEXT NOT NULL DEFAULT 'CURRENT',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 8. operator_work_assignments
    CREATE TABLE IF NOT EXISTS operator_work_assignments (
      id TEXT PRIMARY KEY,
      operator_id TEXT NOT NULL REFERENCES users(id),
      sales_order_id TEXT NOT NULL REFERENCES sales_orders(id),
      operation TEXT NOT NULL,
      assigned_date TEXT NOT NULL,
      source TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- 9. item_units
    CREATE TABLE IF NOT EXISTS item_units (
      id TEXT PRIMARY KEY,
      qr_code TEXT UNIQUE NOT NULL,
      sales_order_id TEXT NOT NULL REFERENCES sales_orders(id),
      size TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('CREATED', 'QC_PASSED', 'QC_FAILED', 'PACKED', 'TRANSFERRED')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 10. qc_results
    CREATE TABLE IF NOT EXISTS qc_results (
      id TEXT PRIMARY KEY,
      item_id TEXT UNIQUE NOT NULL REFERENCES item_units(id),
      operator_id TEXT NOT NULL REFERENCES users(id),
      qc_result TEXT NOT NULL CHECK(qc_result IN ('PASS', 'FAIL')),
      test_result TEXT NOT NULL CHECK(test_result IN ('PASS', 'FAIL')),
      failure_reason TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      first_scanned_at TEXT NOT NULL,
      scanned_at TEXT NOT NULL
    );

    -- 10b. qc_fail_log — one row per individual failure attempt
    CREATE TABLE IF NOT EXISTS qc_fail_log (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES item_units(id),
      operator_id TEXT NOT NULL REFERENCES users(id),
      qc_result TEXT NOT NULL CHECK(qc_result IN ('PASS', 'FAIL')),
      test_result TEXT NOT NULL CHECK(test_result IN ('PASS', 'FAIL')),
      failure_reason TEXT,
      attempt_number INTEGER NOT NULL DEFAULT 1,
      scanned_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_qc_fail_log_item ON qc_fail_log(item_id);

    -- 11. boxes
    CREATE TABLE IF NOT EXISTS boxes (
      id TEXT PRIMARY KEY,
      box_number TEXT UNIQUE NOT NULL,
      sales_order_id TEXT NOT NULL REFERENCES sales_orders(id),
      capacity INTEGER NOT NULL DEFAULT 12,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'COMPLETE', 'AQL_PASSED', 'AQL_FAILED')),
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    -- 12. box_items
    CREATE TABLE IF NOT EXISTS box_items (
      box_id TEXT NOT NULL REFERENCES boxes(id),
      item_id TEXT UNIQUE NOT NULL REFERENCES item_units(id),
      packed_by TEXT NOT NULL REFERENCES users(id),
      packed_at TEXT NOT NULL,
      PRIMARY KEY (box_id, item_id)
    );

    -- 13. aql_inspections
    CREATE TABLE IF NOT EXISTS aql_inspections (
      id TEXT PRIMARY KEY,
      box_id TEXT NOT NULL REFERENCES boxes(id),
      inspector_id TEXT NOT NULL REFERENCES users(id),
      required_samples INTEGER NOT NULL DEFAULT 3,
      result TEXT NOT NULL CHECK(result IN ('PENDING', 'PASSED', 'FAILED')),
      failure_reason TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    -- 14. aql_samples
    CREATE TABLE IF NOT EXISTS aql_samples (
      id TEXT PRIMARY KEY,
      inspection_id TEXT NOT NULL REFERENCES aql_inspections(id),
      item_id TEXT NOT NULL REFERENCES item_units(id),
      sample_number INTEGER NOT NULL,
      result TEXT NOT NULL CHECK(result IN ('PASS', 'FAIL')),
      scanned_at TEXT NOT NULL,
      UNIQUE(inspection_id, item_id),
      UNIQUE(inspection_id, sample_number)
    );

    -- 15. box_transfers
    CREATE TABLE IF NOT EXISTS box_transfers (
      id TEXT PRIMARY KEY,
      from_box_id TEXT NOT NULL REFERENCES boxes(id),
      to_box_id TEXT NOT NULL REFERENCES boxes(id),
      operator_id TEXT NOT NULL REFERENCES users(id),
      transferred_at TEXT NOT NULL
    );

    -- 16. box_transfer_items
    CREATE TABLE IF NOT EXISTS box_transfer_items (
      transfer_id TEXT NOT NULL REFERENCES box_transfers(id),
      item_id TEXT NOT NULL REFERENCES item_units(id),
      PRIMARY KEY (transfer_id, item_id)
    );

    -- 17. alerts
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      role_target TEXT,
      category TEXT NOT NULL CHECK(category IN ('WORK', 'QUALITY', 'SYSTEM')),
      severity TEXT NOT NULL CHECK(severity IN ('INFO', 'SUCCESS', 'WARNING', 'ERROR')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      reference_type TEXT,
      reference_id TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL
    );

    -- 18. audit_logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL
    );

    -- 19. scan_events
    CREATE TABLE IF NOT EXISTS scan_events (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT UNIQUE NOT NULL,
      operator_id TEXT REFERENCES users(id),
      operation TEXT NOT NULL,
      raw_code TEXT NOT NULL,
      normalized_code TEXT NOT NULL,
      device_type TEXT NOT NULL DEFAULT 'wedge',
      result TEXT NOT NULL CHECK(result IN ('ACCEPTED', 'REJECTED', 'DUPLICATE')),
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_po_number ON production_orders(po_number);
    CREATE INDEX IF NOT EXISTS idx_so_number ON sales_orders(so_number);
    CREATE INDEX IF NOT EXISTS idx_item_qr ON item_units(qr_code);
    CREATE INDEX IF NOT EXISTS idx_box_num ON boxes(box_number);
    CREATE INDEX IF NOT EXISTS idx_box_so ON boxes(sales_order_id);
    CREATE INDEX IF NOT EXISTS idx_shift_members_shift ON shift_members(shift_id);
    CREATE INDEX IF NOT EXISTS idx_shift_members_op ON shift_members(operator_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_role ON alerts(role_target);
    CREATE INDEX IF NOT EXISTS idx_scan_idempotency ON scan_events(idempotency_key);
  `);

  // Safe ALTER TABLE for existing databases
  try { db.exec(`ALTER TABLE qc_results ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0`); } catch (_) {}
  try { db.exec(`ALTER TABLE qc_results ADD COLUMN first_scanned_at TEXT NOT NULL DEFAULT ''`); } catch (_) {}

  console.log('✅ SQLite Database Migrations Completed.');
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  ensureDbConnected().then(() => runMigrations());
}
