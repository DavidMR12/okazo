#!/usr/bin/env bash
# Crée le projet Next.js à la dernière version, puis y installe le code de ce dossier.
# Usage : bash setup.sh [dossier]   (par défaut ../web, comme dans le dépôt de déploiement)
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="${1:-../web}"

# Jamais dans le dossier source : le script y supprime app/ avant de copier
mkdir -p "$DEST" && [ "$(cd "$DEST" && pwd)" != "$SRC" ] || { echo "Choisissez un autre dossier que $SRC" >&2; exit 1; }
rmdir "$DEST" 2>/dev/null || true   # create-* exige un dossier absent ou vide

npx create-next-app@latest "$DEST" --ts --app --eslint --no-tailwind --no-src-dir --import-alias "@/*" --use-npm --yes
cd "$DEST"

# Remplace l'exemple du modèle par notre site
rm -rf app
cp -R "$SRC/app" "$SRC/lib" "$SRC/components" .
cp -R "$SRC/public/." public/
cp "$SRC/next.config.ts" "$SRC/.env.example" "$SRC/Dockerfile" "$SRC/.dockerignore" .
rm -f next.config.js next.config.mjs
cp .env.example .env.local

npm install server-only ionicons@8.1.0  # ionicons : icônes pleines, les mêmes que l'application
npm pkg set scripts.dev="next dev -p 3001" scripts.start="next start -p 3001"

npx tsc --noEmit || echo "⚠️  Erreurs TypeScript ci-dessus : à corriger avant de continuer."
echo
echo "Site prêt dans $DEST"
echo "1. Vérifiez .env.local (API_URL, NEXT_PUBLIC_SITE_URL…)"
echo "2. Lancez l'API, puis : npm run dev  →  http://localhost:3001"
