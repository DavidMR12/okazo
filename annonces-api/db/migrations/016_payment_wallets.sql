-- Moyens de paiement acceptés par le vendeur (décision du porteur, 15 octobre 2026).
-- Le vendeur coche les portefeuilles électroniques qu'il accepte ; le paiement se fait entre acheteur et
-- vendeur, à la remise : aucun argent ne passe par l'application (le vrai paiement en ligne reste en phase 2).

-- Portefeuilles proposés selon le pays (ordre d'affichage). Le nom et le logo sont dans le code des clients.
create table if not exists country_wallets (
  country_code char(2) not null references countries(code),
  wallet text not null check (wallet in ('mtn_momo', 'orange_money', 'airtel_money', 'moov_money', 'wave')),
  position smallint not null default 0,
  primary key (country_code, wallet)
);

-- Côte d'Ivoire (zone XOF, phase 2) : créée inactive, pour préparer Wave
insert into countries (code, name, dial_code, currency_code, is_active)
values ('CI', 'Côte d''Ivoire', '+225', 'XOF', false)
on conflict (code) do nothing;

insert into country_wallets (country_code, wallet, position)
select v.country_code, v.wallet, v.position
  from (values
    ('CM', 'mtn_momo', 1), ('CM', 'orange_money', 2),
    ('GA', 'airtel_money', 1), ('GA', 'moov_money', 2),
    ('CG', 'mtn_momo', 1), ('CG', 'airtel_money', 2),
    ('TD', 'airtel_money', 1), ('TD', 'moov_money', 2),
    ('CF', 'orange_money', 1), ('CF', 'moov_money', 2),
    ('CI', 'wave', 1), ('CI', 'orange_money', 2), ('CI', 'mtn_momo', 3), ('CI', 'moov_money', 4)
  ) as v(country_code, wallet, position)
  join countries c on c.code = v.country_code
on conflict do nothing;

-- Portefeuilles acceptés par annonce (vide : non précisé, ou sans objet)
alter table listings add column if not exists payment_methods text[] not null default '{}';
create index if not exists listings_payment_methods_idx on listings using gin (payment_methods);
