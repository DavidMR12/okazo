-- Connexion par e-mail et mot de passe (décision du porteur, 15 octobre 2026).
-- L'adresse est vérifiée par un code avant la création du compte ; le mot de passe est haché (scrypt).
-- Comme pour Google, un compte créé par e-mail n'a pas de numéro : il en vérifie un avant de publier,
-- contacter, écrire, faire une offre ou postuler (PhoneRequiredGuard).
alter table users add column if not exists email text;
alter table users add column if not exists email_verified_at timestamptz;
alter table users add column if not exists password_hash text;

-- Une adresse = un compte (comparaison sans tenir compte des majuscules)
create unique index if not exists users_email_unique on users (lower(email)) where email is not null;

-- Compte supprimé : ni adresse ni mot de passe (anonymisation)
alter table users drop constraint if exists chk_users_deleted_email;
alter table users add constraint chk_users_deleted_email check (deleted_at is null or (email is null and password_hash is null));
