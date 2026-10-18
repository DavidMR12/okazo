#!/usr/bin/env bash
# Donne un rôle à un compte existant (la personne doit s'être connectée une fois).
#   bash scripts/make-admin.sh +237677123456 admin|moderator|user
set -euo pipefail
cd "$(dirname "$0")/.."
PHONE="${1:?Numéro au format +237…}"
ROLE="${2:-moderator}"
[[ "$PHONE" =~ ^\+[1-9][0-9]{7,14}$ ]] || { echo "Numéro invalide (format +237677123456)" >&2; exit 1; }
[[ "$ROLE" =~ ^(admin|moderator|user)$ ]] || { echo "Rôle invalide : admin, moderator ou user" >&2; exit 1; }
docker compose exec -T postgres psql -U annonces -d annonces -v ON_ERROR_STOP=1 \
  -c "update users set role = '$ROLE' where phone_e164 = '$PHONE' returning display_name, role;"
echo "La personne doit se reconnecter (ou attendre 15 min) pour que le rôle s'applique."
