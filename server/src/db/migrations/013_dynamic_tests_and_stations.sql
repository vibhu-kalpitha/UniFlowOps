-- 013_dynamic_tests_and_stations.sql
-- Add dynamic test configuration and station counts for QC and Pre-QC

ALTER TABLE production_orders
  ADD COLUMN qc_tests TEXT NULL AFTER qc_station_count,
  ADD COLUMN pre_qc_tests TEXT NULL AFTER qc_tests,
  ADD COLUMN pre_qc_station_count INT NOT NULL DEFAULT 1 AFTER pre_qc_tests;

ALTER TABLE qc_results
  ADD COLUMN test_details TEXT NULL AFTER failure_reason;

ALTER TABLE pre_qc_results
  ADD COLUMN test_details TEXT NULL AFTER failure_reason;
