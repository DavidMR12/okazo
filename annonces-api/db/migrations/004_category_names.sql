-- =====================================================================
-- Migration 004 : noms de catégories des maquettes validées (« Électronique »)
-- =====================================================================
UPDATE categories SET name = 'Électronique' WHERE slug = 'electronique' AND name = 'Électronique et téléphones';
