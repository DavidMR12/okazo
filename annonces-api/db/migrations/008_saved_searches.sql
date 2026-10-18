-- =====================================================================
-- Migration 008 : recherches sauvegardées (avec le nombre de nouvelles annonces depuis la dernière consultation).
-- Les filtres sont gardés tels qu'envoyés à GET /listings (pays, ville, catégorie, prix, a_<champ>…).
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS saved_searches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  query         jsonb NOT NULL,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches (user_id, created_at);

COMMIT;
