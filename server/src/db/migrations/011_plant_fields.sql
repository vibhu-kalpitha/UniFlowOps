-- 011_plant_fields.sql
-- Add plant field to users and production_orders for multi-plant factory segregation

ALTER TABLE users 
  ADD COLUMN plant VARCHAR(191) NULL AFTER role;

ALTER TABLE production_orders 
  ADD COLUMN plant VARCHAR(191) NULL AFTER supervisor_id;
