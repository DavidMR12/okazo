-- =====================================================================
-- Migration 002 : suppression de compte (exigence Apple / Google, protection des données)
-- Base existante : psql -d votre_base -f db/migrations/002_account_deletion.sql
-- Nouvelle base (docker compose) : appliquée automatiquement après schema.sql
-- Pas de BEGIN/COMMIT : ALTER TYPE ... ADD VALUE doit être validé avant d'utiliser la nouvelle valeur.
-- =====================================================================

ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'deleted';

-- Un compte supprimé n'a plus de numéro : le même numéro peut créer un nouveau compte.
ALTER TABLE users ALTER COLUMN phone_e164 DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_phone_presence') THEN
    ALTER TABLE users ADD CONSTRAINT chk_users_phone_presence
      CHECK ((deleted_at IS NULL) = (phone_e164 IS NOT NULL));
  END IF;
END $$;
