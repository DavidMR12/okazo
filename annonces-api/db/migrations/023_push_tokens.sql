-- Notifications push (22/11/2026) : jetons Expo des téléphones connectés.
-- Un jeton appartient à un seul compte : si un autre compte se connecte sur le même téléphone, il le reprend.
CREATE TABLE push_tokens (
  token        text PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform     text NOT NULL CHECK (platform IN ('android', 'ios')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_push_tokens_user ON push_tokens (user_id);
