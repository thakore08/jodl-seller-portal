-- Migration 008: Add zoho_bill_id and bill_date to cm_bills
-- Enables upsert (ON CONFLICT) when syncing bills from Zoho Books events

ALTER TABLE cm_bills
  ADD COLUMN IF NOT EXISTS zoho_bill_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS bill_date    DATE;

-- Unique index so ON CONFLICT (zoho_bill_id, po_line_item_id) works for upsert
CREATE UNIQUE INDEX IF NOT EXISTS cm_bills_zoho_bill_line_idx
  ON cm_bills (zoho_bill_id, po_line_item_id)
  WHERE zoho_bill_id IS NOT NULL;
