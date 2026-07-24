-- ============================================================================
-- Tecno San Juan - Datos de ejemplo
-- ============================================================================
-- IDEMPOTENTE: Se puede ejecutar múltiples veces sin duplicar datos
-- (usa DELETE/INSERT en tablas de una fila y ON CONFLICT DO NOTHING)
-- ============================================================================

-- --------------------------------------------------------------------------
-- business_info
-- --------------------------------------------------------------------------
DELETE FROM business_info;
INSERT INTO business_info (id, name, legal_name, tax_id, slogan, description, primary_color, secondary_color, website, founded_year)
VALUES (1, 'Tecno San Juan', 'Tecno San Juan S.R.L.', '30-71234567-8',
  'Soluciones tecnológicas a tu alcance',
  'Empresa sanjuanina especializada en reparación de equipos electrónicos, venta de accesorios, servicios de impresión 3D y soporte técnico integral para hogares y empresas.',
  '#2563eb', '#1e40af', 'https://tecnosanjuan.com', 2020);

-- --------------------------------------------------------------------------
-- categories
-- --------------------------------------------------------------------------
DELETE FROM categories;
INSERT INTO categories (name, description, icon, sort_order) VALUES
  ('Reparación de Celulares', 'Reparación de smartphones y tablets', 'smartphone', 1),
  ('Reparación de PC', 'Reparación y mantenimiento de computadoras', 'computer', 2),
  ('Accesorios', 'Venta de accesorios tecnológicos', 'headphones', 3),
  ('Impresión 3D', 'Servicios de impresión 3D', 'print', 4);

-- --------------------------------------------------------------------------
-- services
-- --------------------------------------------------------------------------
DELETE FROM services;
INSERT INTO services (category_id, name, description, price, estimated_duration) VALUES
  (1, 'Cambio de pantalla', 'Reemplazo de pantalla táctil para smartphones', 25000.00, '1 day'),
  (1, 'Cambio de batería', 'Reemplazo de batería para dispositivos móviles', 12000.00, '2 hours'),
  (1, 'Reparación de pin de carga', 'Reparación o reemplazo del puerto de carga', 8000.00, '1 hour'),
  (1, 'Desbloqueo de software', 'Desbloqueo de cuentas y patrones', 5000.00, '30 minutes'),
  (2, 'Limpieza y mantenimiento', 'Limpieza interna y cambio de pasta térmica', 10000.00, '2 hours'),
  (2, 'Actualización de hardware', 'Actualización de RAM, disco SSD, etc.', 15000.00, '1 hour'),
  (2, 'Formateo e instalación', 'Formateo e instalación de sistema operativo', 8000.00, '3 hours'),
  (2, 'Armado de PC', 'Armado personalizado de equipos', 20000.00, '1 day'),
  (3, 'Cargador USB-C', 'Cargador rápido para smartphones modernos', 3500.00, NULL),
  (3, 'Funda protectora', 'Funda de silicona para celular', 2500.00, NULL),
  (3, 'Auriculares Bluetooth', 'Auriculares inalámbricos calidad HD', 8500.00, NULL),
  (3, 'Pendrive 64GB', 'Memoria USB 3.0 de 64GB', 6500.00, NULL);

-- --------------------------------------------------------------------------
-- prices
-- --------------------------------------------------------------------------
DELETE FROM prices;
INSERT INTO prices (service_id, label, amount, currency) VALUES
  (1, 'Estándar', 25000.00, 'ARS'),
  (1, 'Premium (vidrio original)', 35000.00, 'ARS'),
  (2, 'Batería estándar', 12000.00, 'ARS'),
  (2, 'Batería original', 18000.00, 'ARS');

-- --------------------------------------------------------------------------
-- promotions
-- --------------------------------------------------------------------------
DELETE FROM promotions;
INSERT INTO promotions (title, description, discount_type, discount_value, valid_from, valid_until) VALUES
  ('Descuento por renovación', '15% de descuento en cambio de pantalla + batería', 'percentage', 15.00, '2026-01-01', '2026-12-31'),
  ('Combo limpieza + formateo', '$2000 de descuento en mantenimiento completo de PC', 'fixed', 2000.00, '2026-01-01', '2026-12-31');

-- --------------------------------------------------------------------------
-- warranties
-- --------------------------------------------------------------------------
DELETE FROM warranties;
INSERT INTO warranties (title, description, duration, duration_days, terms) VALUES
  ('Garantía en reparaciones', 'Todas nuestras reparaciones tienen garantía', '6 meses', 180,
   'La garantía cubre defectos en los repuestos instalados. No cubre daños por mal uso, golpes o humedad.'),
  ('Garantía en accesorios', 'Accesorios nuevos con garantía de fábrica', '3 meses', 90,
   'Cubre defectos de fábrica. No cubre desgaste normal ni daños por uso inadecuado.');

-- --------------------------------------------------------------------------
-- print3d
-- --------------------------------------------------------------------------
DELETE FROM print3d;
INSERT INTO print3d (material, description, price_per_gram, colors, max_dimensions, layer_height, infill_options, lead_time) VALUES
  ('PLA', 'Filamento PLA de alta calidad para piezas resistentes y ecológicas', 0.50,
   'Blanco, Negro, Azul, Rojo, Verde', '250x210x200 mm', '0.12 - 0.28 mm', '10% - 50%', '3-5 días hábiles'),
  ('PETG', 'Filamento PETG con mayor resistencia térmica y mecánica', 0.80,
   'Transparente, Negro, Azul', '250x210x200 mm', '0.12 - 0.28 mm', '10% - 50%', '5-7 días hábiles'),
  ('Resina', 'Impresión en resina para piezas de alta definición y detalle', 1.50,
   'Gris, Blanco', '150x120x150 mm', '0.025 - 0.05 mm', 'N/A', '7-10 días hábiles');

-- --------------------------------------------------------------------------
-- faqs
-- --------------------------------------------------------------------------
DELETE FROM faqs;
INSERT INTO faqs (question, answer, category, sort_order) VALUES
  ('¿Cuánto tiempo tarda una reparación?',
   'Depende del tipo de reparación y la disponibilidad de repuestos. Por lo general, las reparaciones simples como cambio de batería o pin de carga se realizan en el día. Las más complejas como cambio de pantalla pueden demorar entre 24 y 48 horas.',
   'Reparaciones', 1),
  ('¿Hacen envíos?',
   'Sí, realizamos envíos dentro de la provincia de San Juan. Consultá por el costo según tu ubicación.',
   'General', 2),
  ('¿Aceptan tarjetas de crédito?',
   'Sí, aceptamos todas las tarjetas de crédito y débito. También transferencias bancarias, Mercado Pago y efectivo.',
   'Medios de pago', 3),
  ('¿Cómo solicito un presupuesto de impresión 3D?',
   'Podés contactarnos por WhatsApp o redes sociales con el archivo STL o las medidas de la pieza que necesitás. Te enviaremos un presupuesto sin compromiso en menos de 24 horas.',
   'Impresión 3D', 4),
  ('¿Ofrecen servicio técnico a domicilio?',
   'Sí, contamos con servicio técnico a domicilio en Gran San Juan con un costo adicional. Consultanos por tu zona.',
   'Servicios', 5),
  ('¿Qué debo hacer antes de llevar mi equipo?',
   'Realizá una copia de seguridad de tus datos. No nos responsabilizamos por información perdida durante el servicio. También recomendás traer el cargador original si es necesario para pruebas.',
   'Reparaciones', 6);

-- --------------------------------------------------------------------------
-- hours
-- --------------------------------------------------------------------------
DELETE FROM hours;
INSERT INTO hours (day_of_week, day_name, open_time, close_time, is_closed) VALUES
  (0, 'Domingo', NULL, NULL, true),
  (1, 'Lunes', '09:00', '19:00', false),
  (2, 'Martes', '09:00', '19:00', false),
  (3, 'Miércoles', '09:00', '19:00', false),
  (4, 'Jueves', '09:00', '19:00', false),
  (5, 'Viernes', '09:00', '19:00', false),
  (6, 'Sábado', '10:00', '14:00', false);

-- --------------------------------------------------------------------------
-- social_media
-- --------------------------------------------------------------------------
DELETE FROM social_media;
INSERT INTO social_media (platform, url, icon, sort_order) VALUES
  ('WhatsApp', 'https://wa.me/5492641234567', 'whatsapp', 1),
  ('Instagram', 'https://instagram.com/tecnosanjuan', 'instagram', 2),
  ('Facebook', 'https://facebook.com/tecnosanjuan', 'facebook', 3);

-- --------------------------------------------------------------------------
-- phones
-- --------------------------------------------------------------------------
DELETE FROM phones;
INSERT INTO phones (label, number, is_whatsapp, country_code, sort_order) VALUES
  ('WhatsApp', '264 123-4567', true, '+54', 1),
  ('Teléfono fijo', '0264 422-1234', false, '+54', 2);

-- --------------------------------------------------------------------------
-- emails
-- --------------------------------------------------------------------------
DELETE FROM emails;
INSERT INTO emails (label, email, sort_order) VALUES
  ('Consultas', 'info@tecnosanjuan.com', 1),
  ('Ventas', 'ventas@tecnosanjuan.com', 2);

-- --------------------------------------------------------------------------
-- address
-- --------------------------------------------------------------------------
DELETE FROM address;
INSERT INTO address (id, street, number, city, province, postal_code, country, latitude, longitude, maps_url, additional_info, notes)
VALUES (1, 'Av. General Acha', '123', 'San Juan', 'San Juan', 'J5400', 'Argentina',
  -31.5375000, -68.5363900,
  'https://goo.gl/maps/ejemplo',
  'Local 4',
  'A media cuadra de la plaza principal.');

-- --------------------------------------------------------------------------
-- featured_messages
-- --------------------------------------------------------------------------
DELETE FROM featured_messages;
INSERT INTO featured_messages (message, type, sort_order) VALUES
  ('¡Aprovechá nuestras promociones de temporada con hasta 15% de descuento!', 'promo', 1),
  ('Realizamos envíos a todo Gran San Juan', 'info', 2);

-- --------------------------------------------------------------------------
-- chatbot_config
-- --------------------------------------------------------------------------
DELETE FROM chatbot_config;
INSERT INTO chatbot_config (id, welcome_message, system_prompt, fallback_message, temperature, max_tokens)
VALUES (1,
  '¡Hola! Soy el asistente virtual de Tecno San Juan. Consultame sobre servicios, precios, horarios y más.',
  '',
  'No dispongo de esa información en este momento. ¿Querés consultar otro tema?',
  0.30,
  1024);
