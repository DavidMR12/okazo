#!/usr/bin/env bash
# Okazo : nouvelle version Android sur Google Play, d'une seule commande (comme Louam, 19/11/2026).
#
#   bash annonces-deploy/deploie-android.sh                      → versionCode +1, construction, envoi en test interne
#   bash annonces-deploy/deploie-android.sh --piste production   → envoi en production (alpha = test fermé, beta = test ouvert)
#   bash annonces-deploy/deploie-android.sh --notes "Nouveautés…"
#   bash annonces-deploy/deploie-android.sh --sans-envoi         → construit seulement le fichier .aab
#   bash annonces-deploy/deploie-android.sh --premier            → construit le tout premier .aab (versionCode inchangé),
#                                                                  à déposer à la main dans la Play Console
#
# Étapes : versionCode +1 dans annonces-mobile/app.config.ts ; copie du code dans mobile/ ; lecteur K: (chemins
# courts, obligatoire sous Windows) ; « expo prebuild --clean » (retouches Windows et signature par les plugins
# with-windows-build et with-upload-signing) ; gradlew bundleRelease ; copie du .aab dans livraisons/ ;
# envoi par annonces-deploy/play-upload.mjs.
#
# Clés (jamais dans Git) : C:\Personnel\Kaba\cles-android\ (key.properties + okazo-upload.jks pour la signature,
# play-compte-service.json pour l'envoi).
set -euo pipefail

PISTE="internal"
NOTES=""
ENVOI=1
PREMIER=0
while [ $# -gt 0 ]; do
  case "$1" in
    --piste) PISTE="$2"; shift 2 ;;
    --notes) NOTES="$2"; shift 2 ;;
    --sans-envoi) ENVOI=0; shift ;;
    --premier) PREMIER=1; ENVOI=0; shift ;;
    *) echo "Option inconnue : $1"; exit 1 ;;
  esac
done

RACINE="C:/Personnel/Kaba"
SRC="$RACINE/annonces-mobile"
DEST="$RACINE/mobile"
SORTIE="$RACINE/livraisons"
SDK="C:/Users/makos/AppData/Local/Android/Sdk"
CONFIG="$SRC/app.config.ts"
CLES="$RACINE/cles-android"

[ -f "$CLES/key.properties" ] || { echo "✗ Clé de signature absente : $CLES/key.properties"; exit 1; }
[ -f "$DEST/package.json" ] || { echo "✗ Copie de travail absente : lancez d'abord  cd annonces-mobile && bash setup.sh"; exit 1; }

# 1. versionCode + 1 (remis en place si la construction échoue)
ANCIEN=$(sed -n 's/^const ANDROID_VERSION_CODE = \([0-9]*\);.*/\1/p' "$CONFIG")
[ -n "$ANCIEN" ] || { echo "✗ ANDROID_VERSION_CODE introuvable dans $CONFIG"; exit 1; }
if [ "$PREMIER" = "1" ]; then NOUVEAU=$ANCIEN; else NOUVEAU=$((ANCIEN + 1)); fi
sed -i "s/const ANDROID_VERSION_CODE = $ANCIEN;/const ANDROID_VERSION_CODE = $NOUVEAU;/" "$CONFIG"
echo "→ versionCode $ANCIEN → $NOUVEAU"
retour_arriere() {
  sed -i "s/const ANDROID_VERSION_CODE = $NOUVEAU;/const ANDROID_VERSION_CODE = $ANCIEN;/" "$CONFIG"
  echo "✗ Échec : versionCode remis à $ANCIEN"
}
trap retour_arriere ERR

# 2. Code à jour dans la copie de travail
rm -rf "$DEST/app" "$DEST/src" "$DEST/plugins"
cp -R "$SRC/app" "$SRC/src" "$SRC/plugins" "$DEST/"
cp "$SRC/app.config.ts" "$SRC/eas.json" "$DEST/"
(cd "$DEST" && npx tsc --noEmit)

# 3. Lecteur K: (chemins courts)
if [ ! -d "K:/mobile/app" ]; then
  cmd //c "subst K: C:\\Personnel\\Kaba"   # pas mobile/ directement : à la racine d'un lecteur, Expo ne trouve pas package.json
fi

# 4. Dossier Android régénéré. L'adresse de l'API de production l'emporte sur le .env local (réseau de la maison).
export EXPO_PUBLIC_API_URL="https://api.okazo.org"
cd "K:/mobile"
CI=1 npx expo prebuild --platform android --clean --no-install
echo "sdk.dir=$SDK" > android/local.properties
grep -q "okazo-chemins.js" android/settings.gradle
grep -q 'cmake { version "3.31.6" }' android/app/build.gradle
grep -q "okazoUpload" android/app/build.gradle
grep -q "CMAKE_JOB_POOLS" android/build.gradle
grep -q "versionCode $NOUVEAU" android/app/build.gradle

# 5. Construction du fichier .aab signé (téléphones seulement : x86 ne sert qu'aux émulateurs ; machine de 8 Go)
cd android
./gradlew bundleRelease --no-daemon --max-workers=2 -Dorg.gradle.workers.max=2 -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
mkdir -p "$SORTIE"
AAB="$SORTIE/Okazo-v${NOUVEAU}.aab"
cp app/build/outputs/bundle/release/app-release.aab "$AAB"
trap - ERR
echo "✓ Fichier prêt : $AAB"

# 6. Envoi sur Google Play
if [ "$ENVOI" = "1" ]; then
  node "$RACINE/annonces-deploy/play-upload.mjs" "$AAB" "$PISTE" "$NOTES"
elif [ "$PREMIER" = "1" ]; then
  echo "Premier envoi : déposez ce fichier dans la Play Console (Tester > Tests internes > Créer une version)."
  echo "Les suivants partiront tout seuls :  bash annonces-deploy/deploie-android.sh"
else
  echo "(envoi non demandé)"
fi
