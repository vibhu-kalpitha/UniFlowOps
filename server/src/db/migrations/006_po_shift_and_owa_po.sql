-- 006_po_shift_and_owa_po.sql
-- Safely add shift_id to production_orders and production_order_id to operator_work_assignments

-- 1. Add shift_id to production_orders (if not exists)
ALTER TABLE production_orders
  ADD COLUMN IF NOT EXISTS shift_id VARCHAR(191) NULL AFTER qc_test_mode;

-- 2. Add foreign key fk_po_shift (skip if already exists — handled idempotently in migrate.ts)
-- (The FK is applied via migrate.ts constraintExists check, so no bare ALTER here)

-- 3. Add production_order_id to operator_work_assignments (if not exists)
ALTER TABLE operator_work_assignments
  ADD COLUMN IF NOT EXISTS production_order_id VARCHAR(191) NULL AFTER id;

-- 4. Ensure sales_order_id is nullable in operator_work_assignments
ALTER TABLE operator_work_assignments
  MODIFY COLUMN sales_order_id VARCHAR(191) NULL;

-- 5. Backfill production_order_id from linked sales_orders
UPDATE operator_work_assignments owa
  JOIN sales_orders so ON so.id = owa.sales_order_id
  SET owa.production_order_id = so.production_order_id
  WHERE owa.production_order_id IS NULL AND owa.sales_order_id IS NOT NULL;
