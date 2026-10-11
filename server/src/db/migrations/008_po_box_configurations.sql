-- 008_po_box_configurations.sql — Box Configurations per Production Order

CREATE TABLE IF NOT EXISTS production_order_box_configs (
  id VARCHAR(191) PRIMARY KEY,
  production_order_id VARCHAR(191) NOT NULL,
  prefix VARCHAR(191) NOT NULL,
  size VARCHAR(50) NOT NULL,
  capacity INT NOT NULL DEFAULT 12,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_pbc_po_prefix_size (production_order_id, prefix, size),
  INDEX idx_pbc_po (production_order_id),
  FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
