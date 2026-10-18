-- =====================================================================
-- Migration 013 : connexion avec Google ou Facebook (en plus du code par SMS ou WhatsApp).
-- Un compte peut être lié à un compte Google et à un compte Facebook. Le numéro de téléphone reste la
-- clé anti-fraude : un compte sans numéro peut parcourir et garder des favoris, mais doit vérifier un
-- numéro avant de publier, contacter, écrire, faire une offre, postuler ou donner un avis.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS user_identities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    text NOT NULL CHECK (provider IN ('google', 'facebook')),
  subject     text NOT NULL,          -- identifiant stable chez le fournisseur (« sub » Google, id Facebook)
  email       text,                   -- informatif, jamais utilisé pour fusionner des comptes
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, subject),
  UNIQUE (user_id, provider)
);

-- Un compte actif peut n'avoir pas encore de numéro (créé avec Google ou Facebook) ;
-- un compte supprimé n'en a jamais (anonymisation). Remplace la contrainte de la migration 002.
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_phone_presence;
ALTER TABLE users ADD CONSTRAINT chk_users_phone_presence CHECK (deleted_at IS NULL OR phone_e164 IS NULL);

COMMIT;
