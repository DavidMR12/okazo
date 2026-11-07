#!/usr/bin/env bash
# Crée le projet Expo à la dernière version, puis y installe le code de ce dossier.
# Usage : bash setup.sh [dossier]   (par défaut ../mobile, comme dans le dépôt de déploiement)
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="${1:-../mobile}"

# Jamais dans le dossier source : le script y supprime app/ avant de copier
mkdir -p "$DEST" && [ "$(cd "$DEST" && pwd)" != "$SRC" ] || { echo "Choisissez un autre dossier que $SRC" >&2; exit 1; }
rmdir "$DEST" 2>/dev/null || true   # create-* exige un dossier absent ou vide

npx create-expo-app@latest "$DEST" --yes
cd "$DEST"

# Retire l'exemple fourni par le modèle et copie notre application.
# Depuis le SDK 57, l'exemple est dans src/ (src/app passerait avant notre app/ : on le supprime entièrement).
rm -rf app src components constants hooks scripts app-example
cp -R "$SRC/app" "$SRC/src" .
rm -f app.json   # remplacé par app.config.ts (nom de la marque à un seul endroit)
cp "$SRC/app.config.ts" "$SRC/.env.example" "$SRC/eas.json" .
cp .env.example .env

# expo install choisit les versions compatibles avec le SDK Expo installé
npx expo install expo-router expo-secure-store expo-application expo-image expo-status-bar \
  expo-image-picker expo-document-picker @react-native-community/netinfo expo-auth-session expo-crypto expo-web-browser expo-image-manipulator expo-constants \
  react-native-safe-area-context react-native-screens @react-native-async-storage/async-storage @expo/vector-icons \
  expo-font expo-splash-screen @expo-google-fonts/inter @expo-google-fonts/outfit
npm install @tanstack/react-query @tanstack/react-query-persist-client @tanstack/query-async-storage-persister

npx tsc --noEmit || echo "⚠️  Erreurs TypeScript ci-dessus : à corriger avant de continuer."
echo
echo "Projet prêt dans $DEST"
echo "1. Mettez l'adresse de votre API dans .env (EXPO_PUBLIC_API_URL)"
echo "2. Lancez : npx expo start"
