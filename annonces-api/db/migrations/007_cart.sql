-- =====================================================================
-- Migration 007 : panier (liste d'achats, SANS paiement : on contacte les vendeurs depuis le panier).
-- Le paiement en ligne viendra en phase 2.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS cart_items (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id  uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);
CREATE INDEX IF NOT EXISTS idx_cart_items_listing ON cart_items (listing_id);

COMMIT;
