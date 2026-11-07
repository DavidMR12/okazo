#!/usr/bin/env bash
# Sauvegarde quotidienne de PostgreSQL, chiffrée, envoyée sur R2 (30 jours), copie locale 7 jours.
# Crontab de l'utilisateur deploy :
#   15 3 * * * /opt/annonces/annonces-deploy/scripts/backup.sh >> /var/backups/annonces/backup.log 2>&1
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
set -a; . "$DIR/.env"; set +a
umask 077

# La base contient des numéros de téléphone : sans clé de chiffrement, rien ne part
[ -n "${BACKUP_AGE_RECIPIENT:-}" ] || { echo "BACKUP_AGE_RECIPIENT vide : sauvegarde annulée" >&2; exit 1; }

OUT=/var/backups/annonces
STAMP=$(date -u +%Y%m%d-%H%M)
FILE="$OUT/annonces-$STAMP.dump"

echo "[$(date -u +%FT%TZ)] début de la sauvegarde"
docker compose -f "$DIR/compose.yml" exec -T postgres pg_dump -U annonces -d annonces -Fc > "$FILE"
[ -s "$FILE" ] || { echo "Sauvegarde vide : échec" >&2; exit 1; }

age -r "$BACKUP_AGE_RECIPIENT" -o "$FILE.age" "$FILE"
rm -f "$FILE"
FILE="$FILE.age"

export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
  RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_BACKUP_ACCESS_KEY_ID" \
  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_BACKUP_SECRET_ACCESS_KEY" \
  RCLONE_CONFIG_R2_ENDPOINT="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"

rclone copy "$FILE" "r2:$R2_BACKUP_BUCKET/postgres/"
rclone delete --min-age 30d "r2:$R2_BACKUP_BUCKET/postgres/"
find "$OUT" -name 'annonces-*.dump*' -mtime +7 -delete

if [ -n "${BACKUP_HEARTBEAT_URL:-}" ]; then curl -fsS -m 10 "$BACKUP_HEARTBEAT_URL" >/dev/null || true; fi
echo "[$(date -u +%FT%TZ)] sauvegarde envoyée : $(basename "$FILE")"
