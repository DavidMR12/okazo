-- =====================================================================
-- Schéma PostgreSQL de la plateforme d'annonces (MVP, zone XAF)
-- Prérequis : PostgreSQL 14 ou supérieur
-- Exécution : psql -d votre_base -f db/schema.sql
-- Le script est transactionnel : tout passe, ou rien n'est créé.
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- recherche approximative sur les titres

-- ---------------------------------------------------------------------
-- 1. TYPES ÉNUMÉRÉS
-- ---------------------------------------------------------------------

CREATE TYPE user_role            AS ENUM ('user', 'moderator', 'admin');
CREATE TYPE user_status          AS ENUM ('active', 'suspended', 'banned');
CREATE TYPE verification_level   AS ENUM ('phone', 'identity');
CREATE TYPE verification_status  AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE verification_kind    AS ENUM ('id_card', 'passport', 'driver_license', 'selfie', 'business_registration');

CREATE TYPE listing_status       AS ENUM ('draft', 'pending_review', 'active', 'rejected', 'expired', 'sold', 'removed');
CREATE TYPE price_type           AS ENUM ('fixed', 'negotiable', 'free', 'contact');
CREATE TYPE item_condition       AS ENUM ('new', 'like_new', 'good', 'fair', 'for_parts');

CREATE TYPE report_reason        AS ENUM ('scam', 'fake_photos', 'prohibited_item', 'duplicate', 'wrong_category', 'harassment', 'other');
CREATE TYPE report_status        AS ENUM ('open', 'reviewing', 'resolved', 'dismissed');

CREATE TYPE sanction_type        AS ENUM ('warning', 'suspension', 'ban');
CREATE TYPE moderation_action_type AS ENUM (
  'auto_approve', 'auto_reject', 'send_to_review',
  'approve', 'reject', 'remove', 'restore', 'request_changes'
);

CREATE TYPE blocklist_kind       AS ENUM ('phone', 'device', 'keyword', 'domain', 'image_hash');
CREATE TYPE blocklist_action     AS ENUM ('block', 'flag');   -- block = refus ; flag = envoi en revue humaine

-- ---------------------------------------------------------------------
-- 2. FONCTION UTILITAIRE : updated_at automatique
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 3. GÉOGRAPHIE
-- ---------------------------------------------------------------------

CREATE TABLE countries (
  code          char(2)  PRIMARY KEY,               -- ISO 3166-1 alpha-2
  name          text     NOT NULL,
  dial_code     text     NOT NULL,                  -- ex. '+237'
  currency_code char(3)  NOT NULL DEFAULT 'XAF',
  is_active     boolean  NOT NULL DEFAULT false     -- pays ouvert au public
);

CREATE TABLE cities (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  country_code  char(2) NOT NULL REFERENCES countries(code),
  name          text    NOT NULL,
  slug          text    NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  UNIQUE (country_code, slug),
  UNIQUE (id, country_code)                         -- sert à la clé étrangère composite des annonces
);

-- ---------------------------------------------------------------------
-- 4. UTILISATEURS, APPAREILS, VÉRIFICATIONS
-- ---------------------------------------------------------------------

CREATE TABLE users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164           text NOT NULL UNIQUE
                       CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  country_code         char(2) NOT NULL REFERENCES countries(code),
  city_id              integer REFERENCES cities(id),
  display_name         text NOT NULL DEFAULT 'Utilisateur'
                       CHECK (char_length(display_name) BETWEEN 2 AND 60),
  avatar_key           text,
  role                 user_role NOT NULL DEFAULT 'user',
  status               user_status NOT NULL DEFAULT 'active',
  verification_level   verification_level NOT NULL DEFAULT 'phone',
  trust_score          smallint NOT NULL DEFAULT 0 CHECK (trust_score BETWEEN -100 AND 100),
  daily_listing_limit  smallint NOT NULL DEFAULT 3 CHECK (daily_listing_limit >= 0),
  phone_verified_at    timestamptz NOT NULL DEFAULT now(),   -- le compte est créé après validation du SMS
  terms_accepted_at    timestamptz,
  last_login_at        timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_status ON users (status) WHERE status <> 'active';
CREATE INDEX idx_users_country ON users (country_code);
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE devices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint_hash  text NOT NULL,                    -- empreinte hachée côté serveur
  platform          text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  is_blocked        boolean NOT NULL DEFAULT false,
  last_ip           inet,
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fingerprint_hash)
);
CREATE INDEX idx_devices_fingerprint ON devices (fingerprint_hash);

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id   uuid REFERENCES devices(id) ON DELETE SET NULL,
  token_hash  text NOT NULL UNIQUE,                   -- jamais le jeton en clair
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);

CREATE TABLE user_verifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind              verification_kind NOT NULL,
  storage_key       text NOT NULL,                    -- fichier privé (bucket non public)
  status            verification_status NOT NULL DEFAULT 'pending',
  reviewed_by       uuid REFERENCES users(id),
  reviewed_at       timestamptz,
  rejection_reason  text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_verifications_pending ON user_verifications (created_at) WHERE status = 'pending';
CREATE INDEX idx_verifications_user ON user_verifications (user_id);

-- Quand une pièce d'identité ET un selfie sont approuvés, le vendeur passe au niveau 'identity'.
CREATE OR REPLACE FUNCTION trg_verification_upgrade() RETURNS trigger AS $$
BEGIN
  IF NEW.status <> 'approved' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'approved' THEN
      RETURN NEW;   -- déjà approuvée : rien à refaire
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM user_verifications
              WHERE user_id = NEW.user_id AND status = 'approved'
                AND kind IN ('id_card', 'passport', 'driver_license'))
     AND EXISTS (SELECT 1 FROM user_verifications
              WHERE user_id = NEW.user_id AND status = 'approved' AND kind = 'selfie')
  THEN
    UPDATE users
       SET verification_level = 'identity',
           daily_listing_limit = GREATEST(daily_listing_limit, 10),
           trust_score = LEAST(trust_score + 20, 100)
     WHERE id = NEW.user_id AND verification_level <> 'identity';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_verification_upgrade
  AFTER INSERT OR UPDATE OF status ON user_verifications
  FOR EACH ROW EXECUTE FUNCTION trg_verification_upgrade();

-- ---------------------------------------------------------------------
-- 5. LISTE DE BLOCAGE (numéros, appareils, mots-clés, domaines, images)
-- ---------------------------------------------------------------------

CREATE TABLE blocklist (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind        blocklist_kind NOT NULL,
  value       text NOT NULL,
  action      blocklist_action NOT NULL DEFAULT 'block',
  reason      text,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);

-- Un numéro bloqué ne peut plus créer de compte.
CREATE OR REPLACE FUNCTION trg_users_check_blocklist() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM blocklist
             WHERE kind = 'phone' AND value = NEW.phone_e164 AND action = 'block') THEN
    RAISE EXCEPTION 'PHONE_BLOCKED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_check_blocklist BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION trg_users_check_blocklist();

-- Un appareil bloqué est marqué automatiquement à son enregistrement (l'API refuse la session).
CREATE OR REPLACE FUNCTION trg_devices_check_blocklist() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM blocklist
             WHERE kind = 'device' AND value = NEW.fingerprint_hash AND action = 'block') THEN
    NEW.is_blocked := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_devices_check_blocklist BEFORE INSERT ON devices
  FOR EACH ROW EXECUTE FUNCTION trg_devices_check_blocklist();

-- ---------------------------------------------------------------------
-- 6. CATÉGORIES
-- ---------------------------------------------------------------------

CREATE TABLE categories (
  id                     integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_id              integer REFERENCES categories(id),
  slug                   text NOT NULL UNIQUE,
  name                   text NOT NULL,
  requires_verification  boolean NOT NULL DEFAULT false,  -- identité obligatoire pour publier
  attributes_schema      jsonb NOT NULL DEFAULT '{}'::jsonb, -- champs spécifiques (surface, kilométrage…)
  sort_order             integer NOT NULL DEFAULT 0,
  is_active              boolean NOT NULL DEFAULT true
);
CREATE INDEX idx_categories_parent ON categories (parent_id);

-- ---------------------------------------------------------------------
-- 7. ANNONCES
-- ---------------------------------------------------------------------

CREATE TABLE listings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  category_id     integer NOT NULL REFERENCES categories(id),
  country_code    char(2) NOT NULL REFERENCES countries(code),
  city_id         integer NOT NULL,
  title           text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 120),
  description     text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 5000),
  price_type      price_type NOT NULL DEFAULT 'fixed',
  price_xaf       bigint,                                   -- entier : le XAF n'a pas de centimes
  condition       item_condition,
  attributes      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          listing_status NOT NULL DEFAULT 'pending_review',
  rejection_reason text,
  boost_until     timestamptz,                              -- annonce boostée jusqu'à cette date
  views_count     integer NOT NULL DEFAULT 0,
  published_at    timestamptz,
  expires_at      timestamptz,
  search_vector   tsvector GENERATED ALWAYS AS (
                    to_tsvector('french', coalesce(title, '') || ' ' || coalesce(description, ''))
                  ) STORED,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- la ville doit appartenir au pays de l'annonce
  FOREIGN KEY (city_id, country_code) REFERENCES cities (id, country_code),

  CONSTRAINT chk_listing_price CHECK (
    (price_type = 'contact' AND price_xaf IS NULL)
    OR (price_type = 'free' AND price_xaf = 0)
    OR (price_type IN ('fixed', 'negotiable') AND price_xaf IS NOT NULL AND price_xaf > 0)
  )
);

-- Flux public : annonces actives d'une ville/catégorie, les plus récentes d'abord
CREATE INDEX idx_listings_feed ON listings (city_id, category_id, published_at DESC)
  WHERE status = 'active';
CREATE INDEX idx_listings_country_feed ON listings (country_code, published_at DESC)
  WHERE status = 'active';
CREATE INDEX idx_listings_boost ON listings (boost_until DESC)
  WHERE status = 'active' AND boost_until IS NOT NULL;
CREATE INDEX idx_listings_user ON listings (user_id, created_at DESC);
CREATE INDEX idx_listings_review_queue ON listings (created_at) WHERE status = 'pending_review';
CREATE INDEX idx_listings_expiry ON listings (expires_at) WHERE status = 'active';
CREATE INDEX idx_listings_search ON listings USING gin (search_vector);
CREATE INDEX idx_listings_title_trgm ON listings USING gin (title gin_trgm_ops);

CREATE TRIGGER trg_listings_updated_at BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Règles imposées par la base, en plus de celles de l'API (double protection).
CREATE OR REPLACE FUNCTION trg_listings_before_insert() RETURNS trigger AS $$
DECLARE
  v_user      users%ROWTYPE;
  v_requires  boolean;
  v_count     integer;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = NEW.user_id;

  IF v_user.status <> 'active' THEN
    RAISE EXCEPTION 'USER_NOT_ACTIVE';
  END IF;

  SELECT requires_verification INTO v_requires FROM categories WHERE id = NEW.category_id;
  IF coalesce(v_requires, false) AND v_user.verification_level <> 'identity' THEN
    RAISE EXCEPTION 'IDENTITY_VERIFICATION_REQUIRED';
  END IF;

  SELECT count(*) INTO v_count FROM listings
   WHERE user_id = NEW.user_id AND created_at > now() - interval '24 hours';
  IF v_count >= v_user.daily_listing_limit THEN
    RAISE EXCEPTION 'DAILY_LISTING_LIMIT_REACHED';
  END IF;

  -- Une annonce ne peut jamais naître "active" : elle passe d'abord par la modération.
  IF NEW.status NOT IN ('draft', 'pending_review') THEN
    NEW.status := 'pending_review';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_listings_before_insert BEFORE INSERT ON listings
  FOR EACH ROW EXECUTE FUNCTION trg_listings_before_insert();

-- À la mise en ligne : date de publication et expiration à 30 jours.
CREATE OR REPLACE FUNCTION trg_listings_before_update() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
    NEW.published_at := coalesce(NEW.published_at, now());
    NEW.expires_at   := coalesce(NEW.expires_at, now() + interval '30 days');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_listings_before_update BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION trg_listings_before_update();

CREATE TABLE listing_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id   uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  storage_key  text NOT NULL,
  position     smallint NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 7),  -- 8 photos maximum
  width        integer,
  height       integer,
  sha256       text,                 -- doublon exact
  phash        bit(64),              -- empreinte perceptuelle (doublon approximatif : photos volées)
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, position)
);
CREATE INDEX idx_listing_images_sha256 ON listing_images (sha256) WHERE sha256 IS NOT NULL;
CREATE INDEX idx_listing_images_phash  ON listing_images (phash)  WHERE phash IS NOT NULL;

-- Recherche de photos similaires déjà publiées par d'AUTRES vendeurs.
-- Distance de Hamming <= 6 sur 64 bits : images quasi identiques (recadrage, compression).
CREATE OR REPLACE FUNCTION find_similar_images(
  p_phash         bit(64),
  p_max_distance  integer DEFAULT 6,
  p_exclude_user  uuid DEFAULT NULL
) RETURNS TABLE (listing_id uuid, owner_id uuid, image_id uuid, distance integer) AS $$
  SELECT li.listing_id, l.user_id, li.id, bit_count(li.phash # p_phash)::integer
    FROM listing_images li
    JOIN listings l ON l.id = li.listing_id
   WHERE li.phash IS NOT NULL
     AND (p_exclude_user IS NULL OR l.user_id <> p_exclude_user)
     AND bit_count(li.phash # p_phash) <= p_max_distance
   ORDER BY bit_count(li.phash # p_phash)
   LIMIT 20;
$$ LANGUAGE sql STABLE;

CREATE TABLE favorites (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id  uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

-- ---------------------------------------------------------------------
-- 8. SIGNALEMENTS, MODÉRATION, SANCTIONS
-- ---------------------------------------------------------------------

CREATE TABLE reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id        uuid REFERENCES listings(id) ON DELETE CASCADE,
  reported_user_id  uuid REFERENCES users(id) ON DELETE CASCADE,
  reason            report_reason NOT NULL,
  details           text CHECK (char_length(details) <= 1000),
  status            report_status NOT NULL DEFAULT 'open',
  handled_by        uuid REFERENCES users(id),
  handled_at        timestamptz,
  resolution_note   text,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- un signalement vise soit une annonce, soit un utilisateur
  CONSTRAINT chk_report_target CHECK (
    (listing_id IS NOT NULL)::int + (reported_user_id IS NOT NULL)::int = 1
  )
);
CREATE INDEX idx_reports_queue ON reports (created_at) WHERE status IN ('open', 'reviewing');
CREATE INDEX idx_reports_listing ON reports (listing_id) WHERE listing_id IS NOT NULL;
CREATE INDEX idx_reports_user ON reports (reported_user_id) WHERE reported_user_id IS NOT NULL;
-- Pas de signalements en double par la même personne sur la même cible
CREATE UNIQUE INDEX ux_reports_open_listing ON reports (reporter_id, listing_id)
  WHERE listing_id IS NOT NULL AND status IN ('open', 'reviewing');
CREATE UNIQUE INDEX ux_reports_open_user ON reports (reporter_id, reported_user_id)
  WHERE reported_user_id IS NOT NULL AND status IN ('open', 'reviewing');

CREATE TABLE moderation_actions (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id    uuid REFERENCES listings(id) ON DELETE SET NULL,
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,    -- personne concernée
  moderator_id  uuid REFERENCES users(id),                       -- NULL = décision automatique
  action        moderation_action_type NOT NULL,
  reason_code   text,                                            -- ex. 'PRICE_TOO_LOW', 'DUPLICATE_IMAGE'
  note          text,
  rule_hits     jsonb NOT NULL DEFAULT '[]'::jsonb,              -- règles automatiques déclenchées
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_moderation_subject CHECK (listing_id IS NOT NULL OR user_id IS NOT NULL)
);
CREATE INDEX idx_moderation_listing ON moderation_actions (listing_id, created_at DESC);
CREATE INDEX idx_moderation_user ON moderation_actions (user_id, created_at DESC);

CREATE TABLE sanctions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type               sanction_type NOT NULL,
  reason             text NOT NULL,
  related_report_id  uuid REFERENCES reports(id),
  issued_by          uuid REFERENCES users(id),        -- NULL = sanction automatique
  starts_at          timestamptz NOT NULL DEFAULT now(),
  ends_at            timestamptz,                      -- NULL pour un bannissement
  revoked_at         timestamptz,
  revoked_by         uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_suspension_has_end CHECK (type <> 'suspension' OR ends_at IS NOT NULL)
);
CREATE INDEX idx_sanctions_user ON sanctions (user_id, created_at DESC);

-- Application automatique d'une sanction.
--  * suspension : le compte est suspendu (levée par lift_expired_suspensions()).
--  * bannissement : compte banni, annonces retirées, numéro et appareils bloqués.
CREATE OR REPLACE FUNCTION trg_apply_sanction() RETURNS trigger AS $$
BEGIN
  IF NEW.type = 'suspension' THEN
    UPDATE users SET status = 'suspended', trust_score = GREATEST(trust_score - 15, -100)
     WHERE id = NEW.user_id AND status = 'active';

  ELSIF NEW.type = 'ban' THEN
    UPDATE users SET status = 'banned', trust_score = -100 WHERE id = NEW.user_id;

    UPDATE listings SET status = 'removed', rejection_reason = 'Compte banni'
     WHERE user_id = NEW.user_id AND status IN ('active', 'pending_review', 'draft');

    INSERT INTO blocklist (kind, value, action, reason, created_by)
      SELECT 'phone'::blocklist_kind, u.phone_e164, 'block'::blocklist_action, 'Bannissement', NEW.issued_by
        FROM users u WHERE u.id = NEW.user_id
      ON CONFLICT (kind, value) DO NOTHING;

    INSERT INTO blocklist (kind, value, action, reason, created_by)
      SELECT 'device'::blocklist_kind, d.fingerprint_hash, 'block'::blocklist_action, 'Bannissement', NEW.issued_by
        FROM devices d WHERE d.user_id = NEW.user_id
      ON CONFLICT (kind, value) DO NOTHING;

    UPDATE devices SET is_blocked = true WHERE user_id = NEW.user_id;
    UPDATE refresh_tokens SET revoked_at = now()
     WHERE user_id = NEW.user_id AND revoked_at IS NULL;

  ELSIF NEW.type = 'warning' THEN
    UPDATE users SET trust_score = GREATEST(trust_score - 5, -100) WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_apply_sanction AFTER INSERT ON sanctions
  FOR EACH ROW EXECUTE FUNCTION trg_apply_sanction();

-- Seuil de signalements : 3 personnes différentes => l'annonce repasse en revue humaine.
CREATE OR REPLACE FUNCTION trg_reports_threshold() RETURNS trigger AS $$
DECLARE
  v_distinct integer;
BEGIN
  IF NEW.listing_id IS NOT NULL THEN
    SELECT count(DISTINCT reporter_id) INTO v_distinct
      FROM reports
     WHERE listing_id = NEW.listing_id AND status IN ('open', 'reviewing');

    IF v_distinct >= 3 THEN
      UPDATE listings SET status = 'pending_review'
       WHERE id = NEW.listing_id AND status = 'active';

      IF FOUND THEN
        INSERT INTO moderation_actions (listing_id, action, reason_code, rule_hits)
        VALUES (NEW.listing_id, 'send_to_review', 'REPORTS_THRESHOLD',
                jsonb_build_array(jsonb_build_object('rule', 'reports_threshold', 'distinct_reporters', v_distinct)));
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reports_threshold AFTER INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION trg_reports_threshold();

-- ---------------------------------------------------------------------
-- 9. TÂCHES PLANIFIÉES (à appeler depuis un cron / BullMQ, ex. toutes les heures)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION expire_old_listings() RETURNS integer AS $$
DECLARE
  n integer;
BEGIN
  UPDATE listings SET status = 'expired'
   WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION lift_expired_suspensions() RETURNS integer AS $$
DECLARE
  n integer;
BEGIN
  UPDATE users u SET status = 'active'
   WHERE u.status = 'suspended'
     AND NOT EXISTS (
       SELECT 1 FROM sanctions s
        WHERE s.user_id = u.id AND s.type = 'suspension' AND s.revoked_at IS NULL
          AND (s.ends_at IS NULL OR s.ends_at > now())
     );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 10. VUES
-- ---------------------------------------------------------------------

-- Annonces visibles par le public (vendeur actif, non expirée)
CREATE VIEW v_public_listings AS
SELECT l.*
  FROM listings l
  JOIN users u ON u.id = l.user_id
 WHERE l.status = 'active'
   AND u.status = 'active'
   AND (l.expires_at IS NULL OR l.expires_at > now());

-- File de modération humaine : annonces en attente, vendeurs peu fiables en premier
CREATE VIEW v_moderation_queue AS
SELECT l.id AS listing_id,
       l.title,
       l.price_xaf,
       l.created_at,
       u.id AS seller_id,
       u.trust_score,
       u.verification_level,
       (SELECT count(*) FROM reports r
         WHERE r.listing_id = l.id AND r.status IN ('open', 'reviewing')) AS open_reports,
       last_action.rule_hits
  FROM listings l
  JOIN users u ON u.id = l.user_id
  LEFT JOIN LATERAL (
        SELECT m.rule_hits FROM moderation_actions m
         WHERE m.listing_id = l.id ORDER BY m.created_at DESC LIMIT 1
  ) last_action ON true
 WHERE l.status = 'pending_review'
 ORDER BY (last_action.rule_hits <> '[]'::jsonb) DESC NULLS LAST,
          u.trust_score ASC,
          l.created_at ASC;

-- Appareils partagés par 3 comptes ou plus : signe possible de fraude en série
CREATE VIEW v_shared_devices AS
SELECT fingerprint_hash,
       count(DISTINCT user_id) AS accounts,
       array_agg(DISTINCT user_id) AS user_ids
  FROM devices
 GROUP BY fingerprint_hash
HAVING count(DISTINCT user_id) >= 3;

-- ---------------------------------------------------------------------
-- 11. DONNÉES INITIALES
-- ---------------------------------------------------------------------

INSERT INTO countries (code, name, dial_code, currency_code, is_active) VALUES
  ('CM', 'Cameroun',              '+237', 'XAF', true),
  ('GA', 'Gabon',                 '+241', 'XAF', true),
  ('CG', 'Congo (Brazzaville)',   '+242', 'XAF', true),
  ('TD', 'Tchad',                 '+235', 'XAF', false),
  ('CF', 'Centrafrique',          '+236', 'XAF', false),
  ('GQ', 'Guinée équatoriale',    '+240', 'XAF', false);

INSERT INTO cities (country_code, name, slug) VALUES
  ('CM', 'Douala',       'douala'),
  ('CM', 'Yaoundé',      'yaounde'),
  ('GA', 'Libreville',   'libreville'),
  ('GA', 'Port-Gentil',  'port-gentil'),
  ('CG', 'Brazzaville',  'brazzaville'),
  ('CG', 'Pointe-Noire', 'pointe-noire');

-- Catégories principales (identité obligatoire pour l'immobilier et les véhicules)
INSERT INTO categories (slug, name, requires_verification, sort_order) VALUES
  ('vehicules',    'Véhicules',                 true,  1),
  ('immobilier',   'Immobilier',                true,  2),
  ('electronique', 'Électronique et téléphones', false, 3),
  ('maison',       'Maison et jardin',          false, 4),
  ('mode',         'Mode et beauté',            false, 5),
  ('services',     'Services',                  false, 6),
  ('emploi',       'Emploi',                    false, 7),
  ('loisirs',      'Loisirs et divers',         false, 8);

-- Sous-catégories
INSERT INTO categories (parent_id, slug, name, requires_verification, sort_order)
SELECT p.id, s.slug, s.name, p.requires_verification, s.sort_order
  FROM (VALUES
    ('vehicules',    'voitures',            'Voitures',                  1),
    ('vehicules',    'motos',               'Motos et scooters',         2),
    ('vehicules',    'pieces-auto',         'Pièces et accessoires',     3),
    ('immobilier',   'ventes-immobilieres', 'Ventes',                    1),
    ('immobilier',   'locations',           'Locations',                 2),
    ('immobilier',   'terrains',            'Terrains',                  3),
    ('electronique', 'telephones',          'Téléphones',                1),
    ('electronique', 'ordinateurs',         'Ordinateurs',               2),
    ('electronique', 'tv-audio',            'TV et audio',               3),
    ('maison',       'meubles',             'Meubles',                   1),
    ('maison',       'electromenager',      'Électroménager',            2)
  ) AS s(parent_slug, slug, name, sort_order)
  JOIN categories p ON p.slug = s.parent_slug;

-- Signaux d'alerte : envoient l'annonce en revue humaine (action 'flag'), sans la refuser d'office.
INSERT INTO blocklist (kind, value, action, reason) VALUES
  ('keyword', 'western union',      'flag', 'Paiement à distance suspect'),
  ('keyword', 'acompte',            'flag', 'Demande de paiement anticipé'),
  ('keyword', 'frais de dossier',   'flag', 'Arnaque courante aux locations'),
  ('keyword', 'transfert d''argent','flag', 'Paiement à distance suspect'),
  ('keyword', 'envoi sans visite',  'flag', 'Livraison sans vérification');

COMMIT;
