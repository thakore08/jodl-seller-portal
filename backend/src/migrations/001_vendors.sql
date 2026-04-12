-- CM Inventory: vendors table
CREATE TABLE IF NOT EXISTS cm_vendors (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     VARCHAR(255) NOT NULL,
  zoho_vendor_id           VARCHAR(255),
  is_contract_manufacturer BOOLEAN NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
