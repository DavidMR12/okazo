-- Preuve de l'acceptation des conditions générales d'utilisation (décision du porteur, 15 octobre 2026).
-- Chaque acceptation est gardée (version, date, IP, appareil) : en cas de litige, on prouve qui a accepté quoi et quand.
-- Une nouvelle version des CGU (TERMS_VERSION de l'API) doit être acceptée avant de publier, contacter, écrire,
-- faire une offre, postuler ou donner un avis.
alter table users add column if not exists terms_version text;
alter table users add column if not exists terms_accepted_at timestamptz;

create table if not exists terms_acceptances (
  id bigint generated always as identity primary key,
  user_id uuid not null references users(id) on delete cascade,
  version text not null,
  accepted_at timestamptz not null default now(),
  ip inet,
  platform text check (platform in ('ios', 'android', 'web'))
);
create index if not exists terms_acceptances_user_idx on terms_acceptances (user_id, accepted_at desc);
