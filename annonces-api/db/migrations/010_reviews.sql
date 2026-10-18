-- =====================================================================
-- Migration 010 : avis et notes entre acheteurs et vendeurs.
-- Un avis naît d'une vraie conversation (les deux personnes ont écrit) : un avis par personne et par
-- conversation, de 1 à 5 étoiles, commentaire facultatif. La note moyenne est tenue à jour sur users
-- par un déclencheur (lecture rapide des profils et des annonces). Un avis signalé à tort ou à raison
-- passe par la modération ; un avis masqué ne compte plus dans la moyenne.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS reviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  listing_id       uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  author_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_role      text NOT NULL CHECK (author_role IN ('buyer', 'seller')), -- rôle de l'auteur dans l'échange
  rating           smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment          text CHECK (comment IS NULL OR char_length(comment) BETWEEN 10 AND 500),
  status           text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, author_id),
  CHECK (author_id <> target_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews (target_id, created_at DESC, id DESC) WHERE status = 'published';

ALTER TABLE users ADD COLUMN IF NOT EXISTS rating_avg numeric(2,1);
ALTER TABLE users ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0;

-- Moyenne et nombre d'avis publiés de la personne notée
CREATE OR REPLACE FUNCTION refresh_user_rating() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  t uuid := COALESCE(NEW.target_id, OLD.target_id);
BEGIN
  UPDATE users u
     SET rating_count = s.n,
         rating_avg = CASE WHEN s.n = 0 THEN NULL ELSE round(s.avg, 1) END
    FROM (SELECT count(*)::int AS n, avg(rating) AS avg FROM reviews WHERE target_id = t AND status = 'published') s
   WHERE u.id = t;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_reviews_rating ON reviews;
CREATE TRIGGER trg_reviews_rating AFTER INSERT OR UPDATE OF status, rating OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION refresh_user_rating();

-- Signaler un avis : le signalement vise son auteur et garde l'avis concerné
ALTER TABLE reports ADD COLUMN IF NOT EXISTS review_id uuid REFERENCES reviews(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_reports_review ON reports (review_id) WHERE review_id IS NOT NULL;

COMMIT;

-- Nouveau motif (hors transaction : une valeur d'énumération ajoutée ne sert qu'après validation)
ALTER TYPE report_reason ADD VALUE IF NOT EXISTS 'fake_review';
