-- Unique index on zoho_line_item_id for ON CONFLICT upserts
CREATE UNIQUE INDEX IF NOT EXISTS cm_po_line_items_zoho_id_idx
  ON cm_po_line_items(zoho_line_item_id)
  WHERE zoho_line_item_id IS NOT NULL;
