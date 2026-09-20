-- 001_initial_schema.sql — Fresh MySQL Schema for UniFlow Ops

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(191) PRIMARY KEY,
  employee_no VARCHAR(191) NULL,
  username VARCHAR(191) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(191) NOT NULL,
  role VARCHAR(50) NOT NULL,
  phone VARCHAR(191) NULL,
  avatar_url TEXT NULL,
  active TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS production_lines (
  id VARCHAR(191) PRIMARY KEY,
  code VARCHAR(191) UNIQUE NOT NULL,
  name VARCHAR(191) NOT NULL,
  active TINYINT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shifts (
  id VARCHAR(191) PRIMARY KEY,
  code VARCHAR(191) UNIQUE NOT NULL,
  name VARCHAR(191) NOT NULL,
  start_time VARCHAR(50) NOT NULL,
  end_time VARCHAR(50) NOT NULL,
  active TINYINT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shift_members (
  id VARCHAR(191) PRIMARY KEY,
  shift_id VARCHAR(191) NOT NULL,
  operator_id VARCHAR(191) NOT NULL,
  effective_from DATETIME(3) NOT NULL,
  effective_to DATETIME(3) NULL,
  active TINYINT NOT NULL DEFAULT 1,
  INDEX idx_shift_members_shift (shift_id),
  INDEX idx_shift_members_op (operator_id),
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
  FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS styles (
  id VARCHAR(191) PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  code VARCHAR(191) UNIQUE NOT NULL,
  customer VARCHAR(191) NULL,
  season VARCHAR(191) NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_styles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS production_orders (
  id VARCHAR(191) PRIMARY KEY,
  po_number VARCHAR(191) UNIQUE NOT NULL,
  map_po VARCHAR(191) NOT NULL,
  customer VARCHAR(191) NOT NULL,
  style_id VARCHAR(191) NULL,
  start_date VARCHAR(50) NOT NULL,
  due_date VARCHAR(50) NOT NULL,
  supervisor_id VARCHAR(191) NULL,
  remarks TEXT NULL,
  status VARCHAR(50) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_po_number (po_number),
  INDEX idx_po_style (style_id),
  FOREIGN KEY (style_id) REFERENCES styles(id) ON DELETE SET NULL,
  FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS production_order_operations (
  production_order_id VARCHAR(191) NOT NULL,
  operation VARCHAR(50) NOT NULL,
  PRIMARY KEY (production_order_id, operation),
  FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_orders (
  id VARCHAR(191) PRIMARY KEY,
  production_order_id VARCHAR(191) NOT NULL,
  so_number VARCHAR(191) UNIQUE NOT NULL,
  map_so VARCHAR(191) NOT NULL,
  product VARCHAR(191) NOT NULL,
  style_code VARCHAR(191) NOT NULL,
  colour VARCHAR(191) NOT NULL,
  size_range VARCHAR(191) NOT NULL,
  order_quantity INT NOT NULL,
  line_id VARCHAR(191) NULL,
  shift_id VARCHAR(191) NULL,
  box_capacity INT NOT NULL DEFAULT 12,
  status VARCHAR(50) NOT NULL DEFAULT 'CURRENT',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_so_number (so_number),
  INDEX idx_so_po (production_order_id),
  FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (line_id) REFERENCES production_lines(id) ON DELETE SET NULL,
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS operator_work_assignments (
  id VARCHAR(191) PRIMARY KEY,
  sales_order_id VARCHAR(191) NOT NULL,
  shift_id VARCHAR(191) NULL,
  operator_id VARCHAR(191) NOT NULL,
  operation VARCHAR(50) NOT NULL DEFAULT 'ALL',
  assigned_date VARCHAR(50) NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'SUPERVISOR',
  assigned_by VARCHAR(191) NULL,
  active TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_owa_so (sales_order_id),
  INDEX idx_owa_op (operator_id),
  INDEX idx_owa_shift (shift_id),
  UNIQUE KEY uq_owa_so_shift_operator (sales_order_id, shift_id, operator_id),
  FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL,
  FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS item_units (
  id VARCHAR(191) PRIMARY KEY,
  qr_code VARCHAR(191) UNIQUE NOT NULL,
  sales_order_id VARCHAR(191) NOT NULL,
  size VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_item_qr (qr_code),
  INDEX idx_item_so (sales_order_id),
  FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qc_results (
  id VARCHAR(191) PRIMARY KEY,
  item_id VARCHAR(191) UNIQUE NOT NULL,
  operator_id VARCHAR(191) NOT NULL,
  qc_result VARCHAR(50) NOT NULL,
  test_result VARCHAR(50) NOT NULL,
  failure_reason TEXT NULL,
  retry_count INT NOT NULL DEFAULT 0,
  first_scanned_at DATETIME(3) NOT NULL,
  scanned_at DATETIME(3) NOT NULL,
  FOREIGN KEY (item_id) REFERENCES item_units(id) ON DELETE CASCADE,
  FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qc_fail_log (
  id VARCHAR(191) PRIMARY KEY,
  item_id VARCHAR(191) NOT NULL,
  operator_id VARCHAR(191) NOT NULL,
  qc_result VARCHAR(50) NOT NULL,
  test_result VARCHAR(50) NOT NULL,
  failure_reason TEXT NULL,
  attempt_number INT NOT NULL DEFAULT 1,
  scanned_at DATETIME(3) NOT NULL,
  idempotency_key VARCHAR(191) NULL,
  raw_qr VARCHAR(191) NULL,
  so_id VARCHAR(191) NULL,
  po_id VARCHAR(191) NULL,
  shift_id VARCHAR(191) NULL,
  failure_type VARCHAR(50) NULL,
  INDEX idx_qc_fail_log_item (item_id),
  FOREIGN KEY (item_id) REFERENCES item_units(id) ON DELETE CASCADE,
  FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS boxes (
  id VARCHAR(191) PRIMARY KEY,
  box_code VARCHAR(191) UNIQUE NOT NULL,
  box_number VARCHAR(191) NULL,
  production_order_id VARCHAR(191) NULL,
  sales_order_id VARCHAR(191) NOT NULL,
  capacity INT NOT NULL DEFAULT 12,
  status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
  created_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3) NULL,
  INDEX idx_box_code (box_code),
  INDEX idx_box_num (box_number),
  INDEX idx_box_so (sales_order_id),
  INDEX idx_box_po (production_order_id),
  FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS box_items (
  id VARCHAR(191) PRIMARY KEY,
  box_id VARCHAR(191) NOT NULL,
  item_id VARCHAR(191) NOT NULL,
  packed_by VARCHAR(191) NOT NULL,
  packed_at DATETIME(3) NOT NULL,
  active TINYINT NOT NULL DEFAULT 1,
  INDEX idx_box_items_box (box_id),
  INDEX idx_box_items_item (item_id),
  INDEX idx_box_items_active (item_id, active),
  FOREIGN KEY (box_id) REFERENCES boxes(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES item_units(id) ON DELETE CASCADE,
  FOREIGN KEY (packed_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aql_inspections (
  id VARCHAR(191) PRIMARY KEY,
  box_id VARCHAR(191) NOT NULL,
  sales_order_id VARCHAR(191) NULL,
  inspector_id VARCHAR(191) NOT NULL,
  required_samples INT NOT NULL DEFAULT 3,
  result VARCHAR(50) NOT NULL,
  failure_reason TEXT NULL,
  started_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3) NULL,
  INDEX idx_aql_box (box_id),
  INDEX idx_aql_so (sales_order_id),
  FOREIGN KEY (box_id) REFERENCES boxes(id) ON DELETE CASCADE,
  FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (inspector_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aql_samples (
  id VARCHAR(191) PRIMARY KEY,
  inspection_id VARCHAR(191) NOT NULL,
  item_id VARCHAR(191) NOT NULL,
  sample_number INT NOT NULL,
  result VARCHAR(50) NOT NULL,
  scanned_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_aql_samples_insp_item (inspection_id, item_id),
  UNIQUE KEY uq_aql_samples_insp_num (inspection_id, sample_number),
  FOREIGN KEY (inspection_id) REFERENCES aql_inspections(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES item_units(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS box_transfers (
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

CREATE TABLE IF NOT EXISTS box_transfer_items (
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

CREATE TABLE IF NOT EXISTS alerts (
  id VARCHAR(191) PRIMARY KEY,
  user_id VARCHAR(191) NULL,
  role_target VARCHAR(50) NULL,
  category VARCHAR(50) NOT NULL,
  severity VARCHAR(50) NOT NULL,
  title VARCHAR(191) NOT NULL,
  message TEXT NOT NULL,
  reference_type VARCHAR(50) NULL,
  reference_id VARCHAR(191) NULL,
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_alerts_user (user_id),
  INDEX idx_alerts_role (role_target),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(191) PRIMARY KEY,
  actor_id VARCHAR(191) NULL,
  action VARCHAR(191) NOT NULL,
  entity_type VARCHAR(191) NOT NULL,
  entity_id VARCHAR(191) NULL,
  payload_json TEXT NULL,
  created_at DATETIME(3) NOT NULL,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scan_events (
  id VARCHAR(191) PRIMARY KEY,
  idempotency_key VARCHAR(191) UNIQUE NOT NULL,
  operator_id VARCHAR(191) NULL,
  operation VARCHAR(50) NOT NULL,
  raw_code TEXT NOT NULL,
  normalized_code VARCHAR(191) NOT NULL,
  device_type VARCHAR(50) NOT NULL DEFAULT 'wedge',
  result VARCHAR(50) NOT NULL,
  error_code VARCHAR(191) NULL,
  error_message TEXT NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_scan_idempotency (idempotency_key),
  FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
