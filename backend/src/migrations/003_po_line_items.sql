-- CM Inventory: po_line_items table
CREATE TABLE IF NOT EXISTS cm_po_line_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id       UUID NOT NULL REFERENCES cm_purchase_orders(id) ON DELETE CASCADE,
  po_item_id  VARCHAR(100),
  description TEXT,
  po_qty      INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cm_po_line_items_po_idx ON cm_po_line_items(po_id);
