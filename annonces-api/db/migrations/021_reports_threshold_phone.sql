-- Seuil de signalements : seuls comptent les comptes avec un numéro vérifié.
-- Sinon trois adresses e-mail jetables suffiraient à retirer du site l'annonce d'un concurrent.
CREATE OR REPLACE FUNCTION trg_reports_threshold() RETURNS trigger AS $$
DECLARE
  v_distinct integer;
BEGIN
  IF NEW.listing_id IS NOT NULL THEN
    SELECT count(DISTINCT r.reporter_id) INTO v_distinct
      FROM reports r
      JOIN users u ON u.id = r.reporter_id
     WHERE r.listing_id = NEW.listing_id AND r.status IN ('open', 'reviewing') AND u.phone_e164 IS NOT NULL;

    IF v_distinct >= 3 THEN
      UPDATE listings SET status = 'pending_review'
       WHERE id = NEW.listing_id AND status = 'active';

      IF FOUND THEN
        INSERT INTO moderation_actions (listing_id, action, reason_code, rule_hits)
        VALUES (NEW.listing_id, 'send_to_review', 'REPORTS_THRESHOLD',
                jsonb_build_array(jsonb_build_object('rule', 'reports_threshold', 'distinct_reporters', v_distinct)));
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
