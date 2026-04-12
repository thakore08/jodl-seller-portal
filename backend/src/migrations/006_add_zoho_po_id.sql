-- Add zoho_po_id to cm_purchase_orders for upsert tracking + add zoho_line_item_id to line items
ALTER TABLE cm_purchase_orders
  ADD COLUMN IF NOT EXISTS zoho_po_id    VARCHAR(255),
  ADD COLUMN IF NOT EXISTS zoho_status   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS po_date       DATE;

CREATE UNIQUE INDEX IF NOT EXISTS cm_purchase_orders_zoho_po_id_idx
  ON cm_purchase_orders(zoho_po_id)
  WHERE zoho_po_id IS NOT NULL;

ALTER TABLE cm_po_line_items
  ADD COLUMN IF NOT EXISTS zoho_line_item_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS unit_price         NUMERIC(12,2) DEFAULT 0;
