-- CM Inventory: production_control table
CREATE TABLE IF NOT EXISTS cm_production_control (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_line_item_id   UUID NOT NULL REFERENCES cm_po_line_items(id) ON DELETE CASCADE,
  planned_qty       INTEGER NOT NULL DEFAULT 0,
  actual_qty        INTEGER NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(po_line_item_id)
);
