-- 002_schema_alignment.sql — MySQL 8.0 Compatible Idempotent Alignment Migration

-- 1. Drop legacy obsolete allocation table if exists
DROP TABLE IF EXISTS so_operator_allocations;

-- 2. Align operator_work_assignments columns and constraints
-- Executed step-by-step with information_schema checks in migration runner

-- 3. Align boxes table
UPDATE boxes SET box_code = box_number WHERE box_code IS NULL;

-- 4. Align box_items table
UPDATE box_items SET id = CONCAT('bi-', box_id, '-', item_id) WHERE id IS NULL;
