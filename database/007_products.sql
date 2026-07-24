-- ============================================================================
-- Tecno San Juan - Tabla de productos (catálogo)
-- ============================================================================

CREATE TABLE products (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url   TEXT NOT NULL DEFAULT '',
  price       DECIMAL(12,2) CHECK (price IS NULL OR price >= 0),
  category    TEXT NOT NULL DEFAULT '',
  features    TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE products IS 'Productos en venta (catálogo con imágenes, descripción y precio)';
COMMENT ON COLUMN products.features IS 'Características del producto (una por línea)';

-- Index for category filtering
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_active ON products(is_active);
