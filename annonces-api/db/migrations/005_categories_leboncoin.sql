-- =====================================================================
-- Migration 005 : catégories complètes façon LeBonCoin (emploi, services à la personne…)
-- et « Je propose / Je recherche » (listings.ad_type).
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Je propose (offer) / Je recherche (request)
-- ---------------------------------------------------------------------
ALTER TABLE listings ADD COLUMN IF NOT EXISTS ad_type text NOT NULL DEFAULT 'offer'
  CHECK (ad_type IN ('offer', 'request'));
CREATE INDEX IF NOT EXISTS idx_listings_ad_type ON listings (ad_type) WHERE status = 'active' AND ad_type = 'request';

-- L'identité vérifiée n'est exigée que pour PROPOSER dans une catégorie sensible
-- (vendre un véhicule, recruter, garder des enfants…) : chercher un emploi ou une nounou reste libre.
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
  IF coalesce(v_requires, false) AND NEW.ad_type = 'offer' AND v_user.verification_level <> 'identity' THEN
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

-- ---------------------------------------------------------------------
-- 2. Nouvelles catégories principales et nouvel ordre (emploi et services mis en avant)
-- ---------------------------------------------------------------------
INSERT INTO categories (slug, name, requires_verification, sort_order) VALUES
  ('bebe-enfant',  'Bébé et enfant',         false, 8),
  ('animaux',      'Animaux',                false, 9),
  ('materiel-pro', 'Matériel professionnel', false, 11)
ON CONFLICT (slug) DO NOTHING;

UPDATE categories c SET sort_order = o.sort_order
  FROM (VALUES ('vehicules', 1), ('immobilier', 2), ('emploi', 3), ('services', 4), ('electronique', 5),
               ('maison', 6), ('mode', 7), ('bebe-enfant', 8), ('animaux', 9), ('loisirs', 10), ('materiel-pro', 11))
       AS o(slug, sort_order)
 WHERE c.slug = o.slug;

-- ---------------------------------------------------------------------
-- 3. Sous-catégories (une annonce se publie toujours dans une sous-catégorie)
-- ---------------------------------------------------------------------
INSERT INTO categories (parent_id, slug, name, requires_verification, sort_order)
SELECT p.id, s.slug, s.name, s.requires, s.sort_order
  FROM (VALUES
    ('vehicules',    'utilitaires',              'Utilitaires et camions',                 true,  4),
    ('immobilier',   'bureaux-commerces',        'Bureaux et commerces',                   true,  4),
    ('immobilier',   'colocations',              'Colocations',                            true,  5),
    ('emploi',       'offres-emploi',            'Offres d’emploi',                        true,  1),
    ('emploi',       'petits-boulots',           'Petits boulots et missions',             false, 2),
    ('emploi',       'stages',                   'Stages et apprentissage',                false, 3),
    ('services',     'cours-particuliers',       'Cours particuliers',                     false, 1),
    ('services',     'garde-enfants',            'Garde d’enfants',                        true,  2),
    ('services',     'menage-aide-domicile',     'Ménage et aide à domicile',              true,  3),
    ('services',     'bricolage-reparations',    'Bricolage et réparations',               false, 4),
    ('services',     'reparation-electronique',  'Réparation de téléphones et électronique', false, 5),
    ('services',     'coiffure-beaute',          'Coiffure et beauté',                     false, 6),
    ('services',     'couture',                  'Couture et retouches',                   false, 7),
    ('services',     'demenagement-transport',   'Déménagement et transport',              false, 8),
    ('services',     'evenements',               'Événements et traiteur',                 false, 9),
    ('services',     'autres-services',          'Autres services',                        false, 10),
    ('electronique', 'tablettes',                'Tablettes',                              false, 4),
    ('electronique', 'consoles-jeux',            'Consoles et jeux vidéo',                 false, 5),
    ('electronique', 'photo-video',              'Photo et vidéo',                         false, 6),
    ('electronique', 'accessoires-electroniques', 'Accessoires',                           false, 7),
    ('maison',       'decoration',               'Décoration',                             false, 3),
    ('maison',       'cuisine',                  'Cuisine et vaisselle',                   false, 4),
    ('maison',       'linge-maison',             'Linge de maison',                        false, 5),
    ('maison',       'jardin-bricolage',         'Jardin et bricolage',                    false, 6),
    ('mode',         'vetements-femme',          'Vêtements femme',                        false, 1),
    ('mode',         'vetements-homme',          'Vêtements homme',                        false, 2),
    ('mode',         'chaussures',               'Chaussures',                             false, 3),
    ('mode',         'sacs-accessoires',         'Sacs et accessoires',                    false, 4),
    ('mode',         'montres-bijoux',           'Montres et bijoux',                      false, 5),
    ('mode',         'beaute-soins',             'Beauté et soins',                        false, 6),
    ('mode',         'tissus-pagnes',            'Tissus et pagnes',                       false, 7),
    ('bebe-enfant',  'vetements-enfant',         'Vêtements enfant',                       false, 1),
    ('bebe-enfant',  'equipement-bebe',          'Équipement bébé',                        false, 2),
    ('bebe-enfant',  'jouets',                   'Jouets',                                 false, 3),
    ('bebe-enfant',  'fournitures-scolaires',    'Fournitures scolaires',                  false, 4),
    ('animaux',      'animaux-compagnie',        'Animaux de compagnie',                   false, 1),
    ('animaux',      'animaux-ferme',            'Animaux de ferme',                       false, 2),
    ('animaux',      'accessoires-animaux',      'Accessoires pour animaux',               false, 3),
    ('loisirs',      'sport-velos',              'Sport et vélos',                         false, 1),
    ('loisirs',      'instruments-musique',      'Instruments de musique',                 false, 2),
    ('loisirs',      'livres',                   'Livres',                                 false, 3),
    ('loisirs',      'billetterie',              'Billetterie',                            false, 4),
    ('loisirs',      'collection',               'Collection',                             false, 5),
    ('loisirs',      'autres-loisirs',           'Autres',                                 false, 6),
    ('materiel-pro', 'materiel-agricole',        'Matériel agricole',                      false, 1),
    ('materiel-pro', 'btp-outillage',            'BTP et outillage',                       false, 2),
    ('materiel-pro', 'commerce-restauration',    'Équipement commerce et restauration',    false, 3),
    ('materiel-pro', 'materiel-bureau',          'Matériel de bureau',                     false, 4)
  ) AS s(parent_slug, slug, name, requires, sort_order)
  JOIN categories p ON p.slug = s.parent_slug
ON CONFLICT (slug) DO NOTHING;

-- La catégorie principale « Emploi » ou « Services » n'exige rien en soi : seules certaines sous-catégories
UPDATE categories SET requires_verification = false WHERE slug IN ('emploi', 'services');

COMMIT;
