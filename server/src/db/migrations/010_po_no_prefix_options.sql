-- 010_po_no_prefix_options.sql — Add optional no-prefix mode flags for product and box configuration

ALTER TABLE production_orders
  ADD COLUMN allow_no_product_prefix TINYINT NOT NULL DEFAULT 0,
  ADD COLUMN allow_no_box_prefix TINYINT NOT NULL DEFAULT 0;
