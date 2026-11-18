#!/usr/bin/env bash
# Okazo : construit l'application et l'envoie aux stores, en une commande (EAS Build + EAS Submit, dans le cloud d'Expo).
#
#   bash annonces-deploy/deploie-stores.sh            # Android et iOS
#   bash annonces-deploy/deploie-stores.sh android    # Play Store seulement
#   bash annonces-deploy/deploie-stores.sh ios        # App Store seulement
#
# Ce que fait le script :
#   1. recopie le code de annonces-mobile/ dans la copie de travail mobile/ (comme pour les essais avec Expo Go) ;
#   2. vérifie les types (rien ne part si le code ne compile pas) ;
#   3. lance la construction chez Expo ; le numéro de version (versionCode / buildNumber) monte tout seul ;
#   4. une fois la construction finie, Expo l'envoie lui-même :
#        - Play Store : piste « Tests internes » (testeurs de la Play Console), à promouvoir ensuite en production ;
#        - App Store : TestFlight, à soumettre ensuite à la revue d'Apple.
#
# Prérequis, une seule fois (voir « Publication sur les stores » dans CLAUDE.md) : compte Expo connecté
# (npx eas-cli login), projet lié (npx eas-cli init), clé du compte de service Google Play et clé API App Store
# Connect enregistrées chez Expo (npx eas-cli credentials). Aucun secret n'est dans ce dépôt.
set -euo pipefail

PLATFORM="${1:-all}"
case "$PLATFORM" in android|ios|all) ;; *) echo "Usage : $0 [android|ios|all]" >&2; exit 1 ;; esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/annonces-mobile"
DEST="$ROOT/mobile"
[ -f "$DEST/package.json" ] || { echo "Copie de travail absente : lancez d'abord  cd annonces-mobile && bash setup.sh" >&2; exit 1; }

echo "1/3 Copie du code dans mobile/"
rm -rf "$DEST/app" "$DEST/src"
cp -R "$SRC/app" "$SRC/src" "$DEST/"
cp "$SRC/app.config.ts" "$SRC/eas.json" "$DEST/"

# mobile/ est exclu de Git : Expo prend le dossier tel quel (EAS_NO_VCS), sans les fichiers ci-dessous.
# Le .env local (adresse de l'API sur le réseau de la maison) ne part jamais : l'adresse vient de eas.json.
cat > "$DEST/.easignore" <<'EOF'
node_modules/
.expo/
dist/
web-build/
.env
.env.*
*.log
EOF
export EAS_NO_VCS=1

cd "$DEST"
echo "2/3 Vérification des types"
npx tsc --noEmit

echo "3/3 Construction et envoi ($PLATFORM)"
npx --yes eas-cli@latest whoami >/dev/null 2>&1 || { echo "Pas connecté à Expo : lancez  npx eas-cli login" >&2; exit 1; }
npx --yes eas-cli@latest build --platform "$PLATFORM" --profile production --auto-submit --non-interactive --no-wait

echo
echo "Construction lancée. Suivi : https://expo.dev (onglet Builds), ou  npx eas-cli build:list"
echo "Expo envoie ensuite tout seul l'application aux stores (onglet Submissions)."
