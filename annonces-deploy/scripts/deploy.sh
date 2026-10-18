#!/usr/bin/env bash
# Déploiement (sur le serveur, depuis /opt/annonces/deploy) : bash scripts/deploy.sh
# Récupère le code, construit les images, applique les migrations, redémarre les services.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo ".env manquant (voir .env.example)" >&2; exit 1; }
chmod 600 .env

echo "==> Récupération du code"
git -C .. pull --ff-only

echo "==> Construction des images"
docker compose build --pull

echo "==> Base de données et Redis"
docker compose up -d postgres redis

echo "==> Migrations"
docker compose run --rm migrate

echo "==> Redémarrage des services (quelques secondes d'interruption)"
docker compose up -d --remove-orphans

echo "==> Préchauffage : régénère l'accueil, construit vide pendant la création de l'image"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if docker compose exec -T web node -e "fetch('http://localhost:3001/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then break; fi
  sleep 3
done
sleep 5
docker compose exec -T web node -e "fetch('http://localhost:3001/').then(r=>console.log('Accueil :', r.status))" || true

docker image prune -f >/dev/null
docker compose ps
echo "Déploiement terminé."
