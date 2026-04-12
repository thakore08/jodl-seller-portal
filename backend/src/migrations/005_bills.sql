-- CM Inventory: bills table
DO $$ BEGIN
  CREATE TYPE cm_bill_status AS ENUM ('draft', 'open', 'paid');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS cm_bills (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_line_item_id   UUID NOT NULL REFERENCES cm_po_line_items(id) ON DELETE CASCADE,
  billed_qty        INTEGER NOT NULL DEFAULT 0,
  status            cm_bill_status NOT NULL DEFAULT 'draft',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cm_bills_line_item_idx ON cm_bills(po_line_item_id);
CREATE INDEX IF NOT EXISTS cm_bills_status_idx     ON cm_bills(status);
