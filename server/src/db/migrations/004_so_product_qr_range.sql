-- Migration 004: Add Product QR Range columns to sales_orders
ALTER TABLE sales_orders
ADD COLUMN product_qr_prefix VARCHAR(100) NULL,
ADD COLUMN product_serial_start BIGINT NULL,
ADD COLUMN product_serial_end BIGINT NULL;
