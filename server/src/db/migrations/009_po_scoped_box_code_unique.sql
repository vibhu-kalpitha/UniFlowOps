-- 009_po_scoped_box_code_unique.sql — PO-scoped box code uniqueness constraint

-- Safe alignment logic is executed idempotently via migrate.ts runSchemaAlignment009():
-- 1. Verifies no duplicate (production_order_id, box_code) pairs exist in boxes table.
-- 2. Safely drops global single-column UNIQUE index box_code on boxes.
-- 3. Adds composite UNIQUE constraint uq_boxes_po_code (production_order_id, box_code).
