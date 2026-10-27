-- Sessions sans fin (demande du porteur, 20 octobre 2026) : un appareil connecté une fois le reste.
-- replaced_at distingue un jeton REMPLACÉ par un renouvellement (un réessai réseau récent est encore accepté)
-- d'un jeton RETIRÉ par une déconnexion, une suppression de compte ou un vol détecté (jamais accepté).
-- Les sessions ouvertes sont prolongées à 10 ans ; chaque renouvellement repousse encore l'échéance.
begin;
alter table refresh_tokens add column if not exists replaced_at timestamptz;
update refresh_tokens set expires_at = now() + interval '3650 days' where revoked_at is null;
commit;
