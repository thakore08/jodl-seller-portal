-- CM Inventory: purchase_orders table
DO $$ BEGIN
  CREATE TYPE cm_po_status AS ENUM ('draft', 'open', 'closed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS cm_purchase_orders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number  VARCHAR(255) UNIQUE NOT NULL,
  vendor_id  UUID NOT NULL REFERENCES cm_vendors(id) ON DELETE CASCADE,
  status     cm_po_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cm_purchase_orders_vendor_idx ON cm_purchase_orders(vendor_id);
