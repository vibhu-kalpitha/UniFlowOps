-- 012_operation_line_numbers.sql
-- Add line_number to operation tables to track specific production line where operations occurred
-- and backfill historical records from production_orders

ALTER TABLE qc_results 
  ADD COLUMN line_number VARCHAR(100) NULL AFTER station;

ALTER TABLE qc_fail_log 
  ADD COLUMN line_number VARCHAR(100) NULL AFTER station;

ALTER TABLE pre_qc_results 
  ADD COLUMN line_number VARCHAR(100) NULL AFTER operator_id;

ALTER TABLE pre_qc_scans 
  ADD COLUMN line_number VARCHAR(100) NULL AFTER pre_qc_qr;

ALTER TABLE boxes 
  ADD COLUMN line_number VARCHAR(100) NULL AFTER box_number;

ALTER TABLE aql_inspections 
  ADD COLUMN line_number VARCHAR(100) NULL AFTER stage;

-- Backfill historical records from production_orders so existing data displays their allocated line
UPDATE qc_results qr
JOIN item_units iu ON iu.id = qr.item_id
JOIN production_orders po ON po.id = iu.production_order_id
SET qr.line_number = po.line_number
WHERE (qr.line_number IS NULL OR qr.line_number = '') AND po.line_number IS NOT NULL;

UPDATE qc_fail_log qf
JOIN production_orders po ON po.id = qf.po_id
SET qf.line_number = po.line_number
WHERE (qf.line_number IS NULL OR qf.line_number = '') AND po.line_number IS NOT NULL;

UPDATE pre_qc_results pq
JOIN production_orders po ON po.id = pq.production_order_id
SET pq.line_number = po.line_number
WHERE (pq.line_number IS NULL OR pq.line_number = '') AND po.line_number IS NOT NULL;

UPDATE pre_qc_scans pqs
JOIN production_orders po ON po.id = pqs.production_order_id
SET pqs.line_number = po.line_number
WHERE (pqs.line_number IS NULL OR pqs.line_number = '') AND po.line_number IS NOT NULL;

UPDATE boxes b
JOIN production_orders po ON po.id = b.production_order_id
SET b.line_number = po.line_number
WHERE (b.line_number IS NULL OR b.line_number = '') AND po.line_number IS NOT NULL;

UPDATE aql_inspections ai
JOIN production_orders po ON po.id = ai.production_order_id
SET ai.line_number = po.line_number
WHERE (ai.line_number IS NULL OR ai.line_number = '') AND po.line_number IS NOT NULL;
