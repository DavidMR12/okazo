-- =====================================================================
-- Migration 009 : candidatures aux offres d'emploi (message et CV).
-- Une candidature par personne et par annonce. Le CV est un fichier PRIVÉ (cvs/…), lu par le seul
-- recruteur via un lien de 5 minutes. La candidature ouvre aussi une conversation dans la messagerie.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS job_applications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id       uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  applicant_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employer_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id  uuid REFERENCES conversations(id) ON DELETE SET NULL,
  message          text NOT NULL CHECK (char_length(message) BETWEEN 20 AND 2000),
  cv_key           text,           -- 'deleted' après suppression du compte du candidat
  cv_content_type  text,
  status           text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'viewed', 'shortlisted', 'rejected')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, applicant_id)
);
CREATE INDEX IF NOT EXISTS idx_job_applications_listing ON job_applications (listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_applications_applicant ON job_applications (applicant_id, created_at DESC);

COMMIT;
