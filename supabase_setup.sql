-- =====================================================
-- SCRIPT SQL PARA SUPABASE
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- =====================================================

-- 1. Crear tabla de incidencias
CREATE TABLE IF NOT EXISTS incidents (
  id              BIGSERIAL PRIMARY KEY,
  image_url       TEXT NOT NULL,
  latitude        DOUBLE PRECISION NOT NULL,
  longitude       DOUBLE PRECISION NOT NULL,
  waste_type      TEXT NOT NULL,
  pollution_level TEXT NOT NULL CHECK (pollution_level IN ('BAJO', 'MEDIO', 'ALTO', 'CRÍTICO')),
  detected_objects INTEGER NOT NULL DEFAULT 0,
  keywords        TEXT[] DEFAULT '{}',
  is_critical     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_is_critical ON incidents (is_critical);
CREATE INDEX IF NOT EXISTS idx_incidents_pollution_level ON incidents (pollution_level);

-- 3. Habilitar Row Level Security
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

-- 4. Política: lectura pública (anon puede leer para el dashboard)
CREATE POLICY "Lectura pública" ON incidents
  FOR SELECT
  TO anon
  USING (true);

-- 5. Política: escritura solo con service_role (backend Next.js)
CREATE POLICY "Escritura solo backend" ON incidents
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 6. Habilitar Realtime para la tabla (opcional, para actualizaciones en vivo)
-- Ejecutar esto por separado si quieres Realtime:
-- ALTER PUBLICATION supabase_realtime ADD TABLE incidents;

-- =====================================================
-- DATOS DE PRUEBA (opcional, para verificar el setup)
-- =====================================================
INSERT INTO incidents (image_url, latitude, longitude, waste_type, pollution_level, detected_objects, keywords, is_critical)
VALUES
  ('https://example.com/test1.jpg', -16.495, -68.133, 'PLÁSTICOS', 'ALTO', 10, ARRAY['plastic', 'bottle', 'waste'], false),
  ('https://example.com/test2.jpg', -16.480, -68.110, 'RESIDUOS MEZCLADOS', 'CRÍTICO', 18, ARRAY['garbage', 'debris', 'trash'], true),
  ('https://example.com/test3.jpg', -16.505, -68.120, 'ORGÁNICOS', 'MEDIO', 5, ARRAY['food', 'organic waste'], false),
  ('https://example.com/test4.jpg', -16.502, -68.138, 'PAPEL', 'BAJO', 2, ARRAY['paper', 'cardboard'], false),
  ('https://example.com/test5.jpg', -16.510, -68.130, 'METALES', 'ALTO', 12, ARRAY['can', 'metal', 'aluminum'], false);
