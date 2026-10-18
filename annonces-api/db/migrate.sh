#!/bin/sh
# Applique les migrations dans l'ordre, une seule fois chacune (suivi dans la table schema_migrations).
# Usage (conteneur postgres) : DATABASE_URL=postgres://… sh /db/migrate.sh
set -eu
: "${DATABASE_URL:?DATABASE_URL manquant}"
PSQL="psql $DATABASE_URL -v ON_ERROR_STOP=1 -q"

$PSQL -c "create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())"

apply() {
  version="$1"; file="$2"
  if [ "$($PSQL -tAc "select 1 from schema_migrations where version = '$version'")" = "1" ]; then
    echo "déjà appliquée : $version"
  else
    echo "application : $version"
    $PSQL -f "$file"
    $PSQL -c "insert into schema_migrations (version) values ('$version')"
  fi
}

apply 001_schema /db/schema.sql
for f in $(ls /db/migrations/*.sql 2>/dev/null | sort); do
  apply "$(basename "$f" .sql)" "$f"
done
echo "Migrations à jour."
