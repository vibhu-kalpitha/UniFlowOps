-- 014_customers_hierarchy.sql
-- Establishes Customers table and links Customers -> Styles -> Production Orders -> Sales Orders

CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(191) PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  code VARCHAR(191) UNIQUE NOT NULL,
  contact_person VARCHAR(191) NULL,
  email VARCHAR(191) NULL,
  phone VARCHAR(191) NULL,
  address TEXT NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_customer_code (code),
  INDEX idx_customer_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
