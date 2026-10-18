-- =====================================================================
-- Migration 012 : quartier dans la localisation des annonces.
-- Liste de quartiers par ville (choix dans une liste : pas de faute de frappe, filtre fiable).
-- Le quartier est FACULTATIF et public : jamais d'adresse précise. La clé étrangère composite
-- (district_id, city_id) garantit en base qu'un quartier appartient bien à la ville de l'annonce.
-- Première liste à compléter avec le porteur.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS districts (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  city_id    integer NOT NULL REFERENCES cities(id),
  slug       text    NOT NULL,
  name       text    NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  UNIQUE (city_id, slug),
  UNIQUE (id, city_id) -- sert à la clé étrangère composite des annonces
);

INSERT INTO districts (city_id, slug, name)
SELECT c.id, v.slug, v.name
  FROM (VALUES
    -- Douala
    ('douala', 'akwa', 'Akwa'), ('douala', 'bonanjo', 'Bonanjo'), ('douala', 'bonapriso', 'Bonapriso'), ('douala', 'bali', 'Bali'),
    ('douala', 'deido', 'Deïdo'), ('douala', 'bonaberi', 'Bonabéri'), ('douala', 'bonamoussadi', 'Bonamoussadi'), ('douala', 'makepe', 'Makepe'),
    ('douala', 'kotto', 'Kotto'), ('douala', 'logpom', 'Logpom'), ('douala', 'logbessou', 'Logbessou'), ('douala', 'ndokoti', 'Ndokoti'),
    ('douala', 'bepanda', 'Bépanda'), ('douala', 'new-bell', 'New Bell'), ('douala', 'bassa', 'Bassa'), ('douala', 'ndogbong', 'Ndogbong'),
    ('douala', 'cite-des-palmiers', 'Cité des Palmiers'), ('douala', 'japoma', 'Japoma'), ('douala', 'yassa', 'Yassa'), ('douala', 'pk', 'PK (Village)'),
    -- Yaoundé
    ('yaounde', 'centre-ville', 'Centre-ville'), ('yaounde', 'bastos', 'Bastos'), ('yaounde', 'nlongkak', 'Nlongkak'), ('yaounde', 'etoudi', 'Etoudi'),
    ('yaounde', 'emana', 'Emana'), ('yaounde', 'essos', 'Essos'), ('yaounde', 'omnisport', 'Omnisport'), ('yaounde', 'mimboman', 'Mimboman'),
    ('yaounde', 'ekounou', 'Ekounou'), ('yaounde', 'odza', 'Odza'), ('yaounde', 'mvog-mbi', 'Mvog-Mbi'), ('yaounde', 'mvog-ada', 'Mvog-Ada'),
    ('yaounde', 'ngoa-ekelle', 'Ngoa-Ekellé'), ('yaounde', 'melen', 'Melen'), ('yaounde', 'mokolo', 'Mokolo'), ('yaounde', 'biyem-assi', 'Biyem-Assi'),
    ('yaounde', 'mendong', 'Mendong'), ('yaounde', 'simbock', 'Simbock'), ('yaounde', 'nkolbisson', 'Nkolbisson'), ('yaounde', 'nkoabang', 'Nkoabang'),
    -- Libreville
    ('libreville', 'centre-ville', 'Centre-ville'), ('libreville', 'glass', 'Glass'), ('libreville', 'louis', 'Louis'), ('libreville', 'quaben', 'Quaben'),
    ('libreville', 'batterie-iv', 'Batterie IV'), ('libreville', 'nombakele', 'Nombakélé'), ('libreville', 'mont-bouet', 'Mont-Bouët'), ('libreville', 'akebe', 'Akébé'),
    ('libreville', 'kalikak', 'Kalikak'), ('libreville', 'nzeng-ayong', 'Nzeng-Ayong'), ('libreville', 'sabliere', 'Sablière'), ('libreville', 'charbonnages', 'Charbonnages'),
    ('libreville', 'okala', 'Okala'), ('libreville', 'angondje', 'Angondjé'), ('libreville', 'akanda', 'Akanda'), ('libreville', 'owendo', 'Owendo'),
    ('libreville', 'pk8', 'PK8'), ('libreville', 'lalala', 'Lalala'),
    -- Port-Gentil
    ('port-gentil', 'centre-ville', 'Centre-ville'), ('port-gentil', 'grand-village', 'Grand Village'), ('port-gentil', 'balise', 'Balise'), ('port-gentil', 'chateau', 'Château'),
    ('port-gentil', 'matanda', 'Matanda'), ('port-gentil', 'sindara', 'Sindara'), ('port-gentil', 'bac-aviation', 'Bac Aviation'), ('port-gentil', 'ntchengue', 'Ntchengué'),
    -- Brazzaville
    ('brazzaville', 'centre-ville', 'Centre-ville (Plateau)'), ('brazzaville', 'poto-poto', 'Poto-Poto'), ('brazzaville', 'bacongo', 'Bacongo'), ('brazzaville', 'makelekele', 'Makélékélé'),
    ('brazzaville', 'moungali', 'Moungali'), ('brazzaville', 'ouenze', 'Ouenzé'), ('brazzaville', 'talangai', 'Talangaï'), ('brazzaville', 'mfilou', 'Mfilou'),
    ('brazzaville', 'madibou', 'Madibou'), ('brazzaville', 'djiri', 'Djiri'), ('brazzaville', 'plateau-des-15-ans', 'Plateau des 15 ans'), ('brazzaville', 'mpila', 'Mpila'),
    -- Pointe-Noire
    ('pointe-noire', 'centre-ville', 'Centre-ville'), ('pointe-noire', 'lumumba', 'Lumumba'), ('pointe-noire', 'mvou-mvou', 'Mvou-Mvou'), ('pointe-noire', 'tie-tie', 'Tié-Tié'),
    ('pointe-noire', 'loandjili', 'Loandjili'), ('pointe-noire', 'mongo-mpoukou', 'Mongo-Mpoukou'), ('pointe-noire', 'ngoyo', 'Ngoyo'), ('pointe-noire', 'mpita', 'Mpita'),
    ('pointe-noire', 'siafoumou', 'Siafoumou')
  ) AS v(city_slug, slug, name)
  JOIN cities c ON c.slug = v.city_slug
ON CONFLICT (city_id, slug) DO NOTHING;

ALTER TABLE listings ADD COLUMN IF NOT EXISTS district_id integer;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_listings_district') THEN
    -- MATCH SIMPLE : sans quartier (district_id nul), rien n'est vérifié ; avec quartier, il doit être dans la ville
    ALTER TABLE listings ADD CONSTRAINT fk_listings_district FOREIGN KEY (district_id, city_id) REFERENCES districts (id, city_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_listings_district ON listings (district_id) WHERE district_id IS NOT NULL;

COMMIT;
