-- 007_pre_qc_results.sql — Pre QC Results Table
CREATE TABLE IF NOT EXISTS pre_qc_results (
  id VARCHAR(191) PRIMARY KEY,
  item_id VARCHAR(191) NOT NULL,
  operator_id VARCHAR(191) NOT NULL,
  production_order_id VARCHAR(191) NULL,
  pre_qc_result VARCHAR(50) NOT NULL DEFAULT 'PASS',
  scanned_at DATETIME(3) NOT NULL,
  INDEX idx_pre_qc_item (item_id),
  INDEX idx_pre_qc_po (production_order_id),
  INDEX idx_pre_qc_op (operator_id),
  FOREIGN KEY (item_id) REFERENCES item_units(id) ON DELETE CASCADE,
  FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
