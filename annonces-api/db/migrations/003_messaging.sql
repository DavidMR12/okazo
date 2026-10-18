-- =====================================================================
-- Migration 003 : messagerie entre utilisateurs
-- =====================================================================
BEGIN;

-- Préférence du vendeur : « all » (messagerie + WhatsApp/appel) ou « messages_only » (numéro jamais donné)
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_preference text NOT NULL DEFAULT 'all'
  CHECK (contact_preference IN ('all', 'messages_only'));

-- Une conversation par annonce et par acheteur
CREATE TABLE conversations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id            uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id              uuid NOT NULL REFERENCES users(id),
  seller_id             uuid NOT NULL REFERENCES users(id),
  last_message_at       timestamptz NOT NULL DEFAULT now(),
  last_message_preview  text,
  last_sender_id        uuid REFERENCES users(id),
  buyer_last_read_at    timestamptz,
  seller_last_read_at   timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, buyer_id),
  CONSTRAINT chk_conversation_parties CHECK (buyer_id <> seller_id)
);
CREATE INDEX idx_conversations_buyer  ON conversations (buyer_id, last_message_at DESC);
CREATE INDEX idx_conversations_seller ON conversations (seller_id, last_message_at DESC);

CREATE TABLE messages (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id        uuid NOT NULL REFERENCES users(id),
  body             text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  flags            jsonb NOT NULL DEFAULT '[]'::jsonb,   -- signaux anti-arnaque détectés
  created_at       timestamptz NOT NULL DEFAULT now()
);
-- L'identifiant croissant sert au relevé des nouveaux messages (« après le message n° X »)
CREATE INDEX idx_messages_conversation ON messages (conversation_id, id);
CREATE INDEX idx_messages_sender ON messages (sender_id, created_at DESC);

CREATE TABLE user_blocks (
  blocker_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

-- Un signalement peut viser un utilisateur DANS une conversation : c'est la seule situation
-- où un modérateur peut lire cette conversation.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_reports_conversation ON reports (conversation_id) WHERE conversation_id IS NOT NULL;

COMMIT;
