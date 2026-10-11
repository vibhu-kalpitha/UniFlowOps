-- 005_po_product_configurations.sql — Remove SO dependency & Add PO Product Configurations

-- 1. Add qc_test_mode to production_orders if not exists
-- Handled idempotently in migrate.ts

-- 2. Create production_order_configs table
CREATE TABLE IF NOT EXISTS production_order_configs (
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
