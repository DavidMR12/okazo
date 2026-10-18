-- « Remise en main propre », comme sur LeBonCoin (décision du porteur, 13 octobre 2026).
-- Seulement pour les objets proposés (« Je propose » hors Emploi, Services et Immobilier) ;
-- NULL quand la question ne se pose pas. Aucun argent ne passe par l'application : l'acheteur
-- vérifie l'article et paie à la remise.
alter table listings add column if not exists hand_delivery boolean;

-- Annonces existantes d'objets : remise en main propre (c'était déjà la seule façon de faire)
update listings l set hand_delivery = true
 where l.hand_delivery is null
   and l.ad_type = 'offer'
   and not exists (
     select 1 from categories c join categories p on p.id = c.parent_id
      where c.id = l.category_id and p.slug in ('emploi', 'services', 'immobilier'));

create index if not exists listings_hand_delivery_idx on listings (hand_delivery) where hand_delivery;
