-- Ville et quartier hors liste (demande du porteur, 19 octobre 2026) : « Autre » + champ libre à la publication.
-- Chaque pays reçoit une ville « Autres villes » (slug « autre ») : l'annonce y est rattachée et garde le nom
-- saisi dans city_other. Les filtres et les jointures sur les villes restent inchangés.
-- Le quartier saisi va dans district_other, seulement quand aucun quartier de la liste n'est choisi.
-- Les noms saisis sont affichés à la place de « Autres villes » ; pas de chiffres (pas de numéro de téléphone caché).
begin;

insert into cities (country_code, name, slug)
select c.code, 'Autres villes', 'autre' from countries c
on conflict (country_code, slug) do nothing;

alter table listings add column if not exists city_other text;
alter table listings add column if not exists district_other text;

alter table listings drop constraint if exists listings_city_other_check;
alter table listings add constraint listings_city_other_check
  check (city_other is null or char_length(city_other) between 2 and 60);
alter table listings drop constraint if exists listings_district_other_check;
alter table listings add constraint listings_district_other_check
  check (district_other is null or (char_length(district_other) between 2 and 60 and district_id is null));

commit;
