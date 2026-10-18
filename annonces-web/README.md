# Site web (Next.js)

Le site sert deux objectifs : **être trouvé sur Google** (chaque annonce, catégorie et ville a sa page)
et **générer les revenus publicitaires** (Google AdSense). Il utilise la même API que l'application mobile.

## Installation

```bash
bash setup.sh          # crée ../web avec la dernière version de Next.js
cd ../web
npm run dev            # http://localhost:3001 (l'API tourne sur le port 3000)
```

## Pages

| Adresse | Contenu | Google |
|---|---|---|
| `/` | Recherche, catégories, dernières annonces de chaque pays | indexée |
| `/cm`, `/cm/telephones`, `/cm/telephones/douala`, `/cm/toutes/douala` | Listes par pays, catégorie et ville | indexées |
| `/cm/telephones?q=samsung` | Recherche libre | non indexée |
| `/annonce/samsung-galaxy-a15-<id>` | Annonce : photos, prix, vendeur, contact, conseils de sécurité | indexée |
| `/vendeur/<id>` | Profil et annonces du vendeur | suivie, non indexée |
| `/publier` | Publication d'une annonce | exclue |
| `/messages`, `/messages/<id>` | Messagerie (pastille des non-lus dans l'en-tête) | exclues |
| `/mes-annonces` | Suivi : en vérification, en ligne, refusée (avec motif), vendue ; Modifier, Corriger, Republier | exclue |
| `/mes-annonces/<id>/modifier` | Modification (même formulaire que la publication) | exclue |
| `/connexion`, `/favoris`, `/compte`, `/signaler` | Espace personnel | exclues |
| `/admin`… | Back-office de modération (rôles moderator et admin) | exclues |
| `/confidentialite` | Politique de confidentialité et cookies | indexée |
| `/sitemap.xml`, `/robots.txt`, `/ads.txt`, `/manifest.webmanifest` | Fichiers techniques | — |

## Référencement Google

- Pages rendues côté serveur et **mises en cache** (60 s pour une annonce, 30 s pour une liste) : Google et les visiteurs reçoivent une page complète immédiatement.
- URL lisibles ; si le titre d'une annonce change, l'ancienne adresse redirige définitivement vers la nouvelle.
- **Données structurées** (Product, Offer en XAF, fil d'Ariane) : Google peut afficher le prix et la disponibilité dans ses résultats.
- Une page par combinaison catégorie × ville (« Téléphones à Douala ») : ce sont les recherches que font réellement les gens.
- Plan du site généré automatiquement (pages de listes et 5 000 annonces les plus récentes).
- Annonces vendues : visibles mais retirées de l'index.

## Publicité et cookies

1. Faites approuver le site par AdSense (il doit déjà contenir de vraies annonces et la page de confidentialité).
2. Renseignez `NEXT_PUBLIC_ADSENSE_CLIENT` (ca-pub-…) et créez deux blocs d'annonces : liste (`…_SLOT_FEED`) et annonce (`…_SLOT_LISTING`).
3. **Visiteurs de l'Union européenne, du Royaume-Uni et de la Suisse** (diaspora) : activez le message de consentement certifié de Google dans AdSense (*Confidentialité et messages*). Il est obligatoire pour y diffuser des annonces ; notre bandeau couvre les autres pays.

Fonctionnement :
- Le script AdSense ne se charge **qu'après le choix** du visiteur. « Accepter » : publicités personnalisées ; « Refuser » : publicités non personnalisées.
- « Accepter » et « Refuser » ont le même poids visuel ; le choix est modifiable à tout moment (« Gérer les cookies » en pied de page).
- Emplacements : une publicité toutes les 8 annonces dans les listes (jamais en tête), une sous la description d'une annonce. Aucune sur la connexion, le compte ou les erreurs (interdit par le règlement AdSense). Leur hauteur est réservée pour éviter que la page « saute ».
- `ads.txt` est généré automatiquement à partir de votre identifiant.

## Connexion et sécurité

- Connexion par SMS, comme sur l'application. Les jetons sont stockés dans des **cookies httpOnly** : le JavaScript de la page ne peut pas les lire, donc un script malveillant ne peut pas les voler.
- Le navigateur n'appelle que le site (`/api/…`), qui relaie vers l'API avec le jeton et l'**IP réelle du visiteur** (sinon les limites anti-abus de l'API s'appliqueraient à tous les visiteurs à la fois). L'API doit donc accepter l'en-tête `X-Forwarded-For` venant du serveur du site, et de lui seul.
- Protection CSRF : cookies `SameSite=Lax` et vérification de l'origine pour toute écriture.
- Le renouvellement de session est unique par visiteur sur une instance. Avec plusieurs instances du site, activez l'affinité de session sur le répartiteur de charge.
- Le numéro du vendeur n'apparaît jamais dans la page : il est demandé au clic, par un visiteur connecté.

## Réseau lent et hors ligne

- Polices système, peu de JavaScript : l'essentiel de chaque page est du HTML rendu par le serveur.
- La recherche est un formulaire HTML classique : elle fonctionne même sans JavaScript.
- **Service worker** (en production) : les pages et photos déjà consultées s'ouvrent sans réseau ; sinon une page « Pas de connexion » s'affiche. Les données personnelles (`/api/…`) et la publicité ne sont jamais mises en cache.
- Le site peut être ajouté à l'écran d'accueil comme une application (manifeste). Ajoutez `public/icon-192.png` et `public/icon-512.png`.

## Publication d'une annonce

- Photos par glisser-déposer ou sélection, **compressées dans le navigateur** (1600 px, JPEG) puis envoyées **directement au stockage**, dès leur ajout, pendant que le vendeur remplit le formulaire (2 envois à la fois, 3 essais).
- **Règle CORS obligatoire sur le bucket** : autoriser la méthode `PUT` et l'en-tête `Content-Type` depuis le domaine du site (sinon les photos restent en erreur). L'application mobile n'en a pas besoin.
- Aperçu en direct de la carte telle qu'elle apparaîtra dans les listes ; brouillon du texte gardé dans le navigateur.
- Immobilier et véhicules : si l'identité n'est pas vérifiée, le formulaire l'indique et renvoie vers l'application (la vérification par photo se fait sur mobile).
- Après publication, `/mes-annonces` affiche le statut et se met à jour toutes les 20 s tant qu'une annonce est en vérification.

## Back-office de modération (`/admin`)

Réservé aux comptes « moderator » et « admin » (voir `deploy/scripts/make-admin.sh`). Utilisable sur téléphone. L'API vérifie elle-même les droits à chaque action.

| Écran | Usage |
|---|---|
| Annonces à vérifier | File triée par risque, rafraîchie toutes les 30 s. Chaque annonce montre en clair les règles déclenchées (rouge : refus probable, ambre : à relire) |
| Revue d'une annonce | Photos, description, vendeur (confiance, identité, statut), historique. **Approuver** ou **Refuser** avec un message type pour le vendeur ; l'annonce suivante s'ouvre automatiquement |
| Signalements | Arnaques en tête. « Fondé » : retrait de l'annonce, blocage de ses photos, sanction du vendeur en une seule action. « Sans suite » : l'annonce suspendue par les signalements est remise en ligne |
| Identités | Pièce et selfie côte à côte (liens valables 5 min, rechargés automatiquement), validation ou refus avec motif type |
| Conversations signalées | Lecture seule d'une conversation, uniquement si elle a été signalée (lien depuis le signalement) |
| Utilisateurs | Recherche par numéro. Fiche : historique, signalements reçus, **comptes partageant le même appareil**, sanctions (le bannissement et sa levée sont réservés aux admins) |

## Pas encore sur le web

La vérification d'identité (photo de la pièce et selfie) se fait depuis l'application mobile, où la prise de vue en direct est garantie.

## Avant la mise en ligne

- Compléter `/confidentialite` (éditeur, contact, durées de conservation) avec un juriste.
- Choisir le nom définitif (`NEXT_PUBLIC_SITE_NAME`) et le domaine (`NEXT_PUBLIC_SITE_URL`).
- Placer le site derrière Cloudflare, puis déclarer le domaine dans Google Search Console et y soumettre `/sitemap.xml`.
