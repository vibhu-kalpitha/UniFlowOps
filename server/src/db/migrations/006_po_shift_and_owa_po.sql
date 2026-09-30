ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS shift_id VARCHAR(191) NULL;
ALTER TABLE operator_work_assignments ADD COLUMN IF NOT EXISTS production_order_id VARCHAR(191) NULL;
