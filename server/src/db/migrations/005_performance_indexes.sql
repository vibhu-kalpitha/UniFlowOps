-- 005_performance_indexes.sql — Non-destructive indexes for query optimization

CREATE INDEX idx_sessions_lookup ON user_sessions (token_hash, active);
CREATE INDEX idx_po_status_sup ON production_orders (status, supervisor_id, created_at);
CREATE INDEX idx_so_po_status ON sales_orders (production_order_id, status);
CREATE INDEX idx_owa_active_lookup ON operator_work_assignments (sales_order_id, operator_id, active);
CREATE INDEX idx_qc_metrics ON qc_results (operator_id, qc_result, test_result);
CREATE INDEX idx_item_units_so_status ON item_units (sales_order_id, status);
CREATE INDEX idx_boxes_so_status ON boxes (sales_order_id, status);
CREATE INDEX idx_box_items_active ON box_items (box_id, active);
CREATE INDEX idx_aql_so_result ON aql_inspections (sales_order_id, result);
