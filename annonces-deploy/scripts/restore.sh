#!/usr/bin/env bash
# Restauration d'une sauvegarde (écrase la base actuelle).
#   bash scripts/restore.sh /chemin/annonces-AAAAMMJJ-HHMM.dump[.age] [/chemin/cle-age.txt]
# Sauvegarde chiffrée : fournir la clé privée age (à copier temporairement, puis supprimer).
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:?Fichier de sauvegarde manquant}"
KEY="${2:-}"

read -r -p "Cette opération REMPLACE la base de production. Taper RESTAURER pour continuer : " ok
[ "$ok" = "RESTAURER" ] || { echo "Annulé."; exit 1; }

if [[ "$FILE" == *.age ]]; then
  [ -n "$KEY" ] || { echo "Clé privée age requise pour une sauvegarde chiffrée." >&2; exit 1; }
  PLAIN="$(mktemp)"; trap 'rm -f "$PLAIN"' EXIT
  age -d -i "$KEY" -o "$PLAIN" "$FILE"
  FILE="$PLAIN"
fi

docker compose stop api worker web
docker compose exec -T postgres pg_restore -U annonces -d annonces --clean --if-exists --no-owner < "$FILE"
docker compose start api worker web
echo "Restauration terminée. Vérifiez le site et l'API."
