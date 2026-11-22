-- Paiements Mobile Money (22/11/2026) : achat d'une mise « À la une » (boost), encaissé par pawaPay.
-- L'identifiant du paiement est aussi celui envoyé au prestataire (depositId) : une relance ne paie jamais deux fois.
-- Le numéro de téléphone du payeur n'est pas gardé : il est saisi sur la page de pawaPay, pas chez nous.
CREATE TABLE payments (
  id               uuid PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id       uuid REFERENCES listings(id) ON DELETE SET NULL,
  product          text NOT NULL CHECK (product = 'boost'),
  boost_days       smallint NOT NULL CHECK (boost_days BETWEEN 1 AND 90),
  amount_xaf       integer NOT NULL CHECK (amount_xaf > 0),
  country_code     char(2) NOT NULL,
  provider         text NOT NULL,                      -- pawapay (ou fake en développement)
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
  failure_code     text,
  provider_tx_id   text,                               -- référence de l'opérateur (Airtel, MTN…), pour les réclamations
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  checked_at       timestamptz
);

CREATE INDEX idx_payments_user ON payments (user_id, created_at DESC);
CREATE INDEX idx_payments_pending ON payments (created_at) WHERE status = 'pending';
