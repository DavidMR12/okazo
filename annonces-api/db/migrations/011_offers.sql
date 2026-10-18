-- =====================================================================
-- Migration 011 : « Faire une offre » de prix dans la messagerie (comme LeBonCoin).
-- L'acheteur propose un montant inférieur au prix affiché ; le vendeur accepte ou refuse, l'acheteur peut
-- retirer son offre. Une seule offre en attente par conversation, valable 48 h. Aucun argent ne passe par
-- l'application : une offre acceptée fixe le prix convenu, la suite se règle à la rencontre.
-- Chaque étape est aussi un message de la conversation (kind), pour l'aperçu de la boîte de réception.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS offers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  listing_id       uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_xaf       integer NOT NULL CHECK (amount_xaf > 0),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn', 'expired')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  responded_at     timestamptz
);
-- Une seule offre en attente à la fois dans une conversation
CREATE UNIQUE INDEX IF NOT EXISTS uq_offers_pending ON offers (conversation_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_offers_conversation ON offers (conversation_id, created_at DESC);

-- Messages liés à une offre : 'offer' (la proposition), puis 'offer_accepted', 'offer_declined', 'offer_withdrawn'
ALTER TABLE messages ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text'
  CHECK (kind IN ('text', 'offer', 'offer_accepted', 'offer_declined', 'offer_withdrawn'));
ALTER TABLE messages ADD COLUMN IF NOT EXISTS offer_id uuid REFERENCES offers(id) ON DELETE SET NULL;

COMMIT;
