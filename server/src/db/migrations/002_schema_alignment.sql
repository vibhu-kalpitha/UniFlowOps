-- 002_schema_alignment.sql — Idempotent Migration for Existing Databases

-- 1. Drop legacy obsolete allocation table if exists
DROP TABLE IF EXISTS so_operator_allocations;

-- 2. Align operator_work_assignments table
ALTER TABLE operator_work_assignments
  ADD COLUMN IF NOT EXISTS shift_id VARCHAR(191) NULL AFTER sales_order_id,
  ADD COLUMN IF NOT EXISTS assigned_by VARCHAR(191) NULL AFTER source,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME(3) NULL AFTER created_at;

-- Add foreign key constraint for shift_id if not present
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'operator_work_assignments' AND CONSTRAINT_NAME = 'fk_owa_shift');
SET @sql = IF(@fk_exists = 0, 'ALTER TABLE operator_work_assignments ADD CONSTRAINT fk_owa_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add unique constraint uq_owa_so_shift_operator if not present
SET @uq_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'operator_work_assignments' AND CONSTRAINT_NAME = 'uq_owa_so_shift_operator');
SET @sql = IF(@uq_exists = 0, 'ALTER TABLE operator_work_assignments ADD CONSTRAINT uq_owa_so_shift_operator UNIQUE (sales_order_id, shift_id, operator_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Align boxes table
ALTER TABLE boxes
  ADD COLUMN IF NOT EXISTS box_code VARCHAR(191) NULL AFTER box_number,
  ADD COLUMN IF NOT EXISTS production_order_id VARCHAR(191) NULL AFTER box_code;

UPDATE boxes SET box_code = box_number WHERE box_code IS NULL;

SET @fk_po_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'boxes' AND CONSTRAINT_NAME = 'fk_boxes_po');
SET @sql = IF(@fk_po_exists = 0, 'ALTER TABLE boxes ADD CONSTRAINT fk_boxes_po FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. Align box_items table for transfer support
ALTER TABLE box_items
  ADD COLUMN IF NOT EXISTS id VARCHAR(191) NULL FIRST,
  ADD COLUMN IF NOT EXISTS active TINYINT NOT NULL DEFAULT 1 AFTER packed_at;

UPDATE box_items SET id = CONCAT('bi-', box_id, '-', item_id) WHERE id IS NULL;

-- 5. Align aql_inspections table
ALTER TABLE aql_inspections
  ADD COLUMN IF NOT EXISTS sales_order_id VARCHAR(191) NULL AFTER box_id;

SET @fk_aql_so_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'aql_inspections' AND CONSTRAINT_NAME = 'fk_aql_so');
SET @sql = IF(@fk_aql_so_exists = 0, 'ALTER TABLE aql_inspections ADD CONSTRAINT fk_aql_so FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
