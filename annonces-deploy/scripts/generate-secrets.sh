#!/usr/bin/env bash
# Affiche des secrets aléatoires au format .env (hexadécimal : sans caractère spécial qui casserait une URL)
set -euo pipefail
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "JWT_ACCESS_SECRET=$(openssl rand -hex 32)"
echo "OTP_SECRET=$(openssl rand -hex 32)"
