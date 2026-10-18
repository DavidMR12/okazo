# API de la plateforme d'annonces

NestJS + Fastify + Drizzle + PostgreSQL + Redis (+ BullMQ pour la modération, stockage S3/R2 pour les photos).

## Démarrage local

```bash
cp .env.example .env            # puis générez les 2 secrets : openssl rand -hex 32
docker compose up -d            # PostgreSQL (schéma appliqué), Redis, MinIO (stockage des photos)
npm install
npm run start:dev
```

En développement (`SMS_PROVIDER=console`), le code OTP s'affiche dans les logs de l'API.
Pour tester la modération humaine, passez votre compte en modérateur :
`UPDATE users SET role = 'admin' WHERE phone_e164 = '+237…';` puis reconnectez-vous.

## Tests

```bash
npm run test:db     # PostgreSQL et Redis jetables (ports 5433 et 6380), séparés de la base de développement
npm test            # 105 tests, 1 à 2 minutes
npm run typecheck   # vérifie aussi les types des tests
```

Les tests de bout en bout (`test/e2e`) font tourner l'API complète sur une vraie base : déclencheurs SQL, limites Redis et traitement des photos compris. Seuls l'envoi des SMS et le stockage des photos sont simulés.
Ils couvrent la connexion par SMS, le renouvellement de session (vol de jeton compris), le bannissement, la publication et la modification d'annonce, les règles de la base, la modération automatique, le contact du vendeur, la pagination, la messagerie et la suppression de compte. `test/unit` couvre les règles pures (signaux d'arnaque, curseurs, clés de stockage).
Arrêt de la base de test : `docker compose -f test/compose.yml down`.

## Routes

**Authentification** : `POST /auth/otp/request`, `/auth/otp/verify`, `/auth/refresh`, `/auth/logout`, `GET /auth/me`

**Données publiques (cache CDN)** : `GET /geo/countries`, `/geo/cities?country=CM`, `/categories`

**Annonces**

| Méthode | Route | Accès |
|---|---|---|
| GET | `/listings` (filtres : country, cityId, categoryId, minPrice, maxPrice, q, cursor, limit) | public |
| GET | `/listings/:id` | public |
| GET | `/listings/sitemap` (5 000 dernières annonces, pour le site web) | public |
| POST | `/media/upload-urls` | connecté |
| POST | `/listings` | connecté |
| GET | `/me/listings/:id` (annonce complète, quel que soit son statut) | propriétaire |
| PATCH | `/listings/:id` (texte, prix, état, catégorie, ville, photos) | propriétaire |
| POST | `/listings/:id/mark-sold` | propriétaire |
| DELETE | `/listings/:id` | propriétaire |
| GET | `/listings/:id/contact` | connecté (limité par jour) |
| GET | `/me/listings` | connecté |

**Modération (rôles moderator/admin)** : `GET /admin/moderation/queue`, `GET /admin/listings/:id`, `POST /admin/listings/:id/approve`, `POST /admin/listings/:id/reject`

**Profil et favoris**

| Méthode | Route | Accès |
|---|---|---|
| PATCH | `/me` (`displayName`, `cityId`) | connecté |
| POST | `/me/delete/request` (code SMS de confirmation) | connecté |
| DELETE | `/me` (`code`) | connecté |
| GET | `/users/:id` (profil public du vendeur) | public |
| GET | `/listings?sellerId=…` (ses annonces) | public |
| PUT | `/favorites/:listingId` | connecté |
| DELETE | `/favorites/:listingId` | connecté |
| GET | `/me/favorites` (paginé) | connecté |
| GET | `/me/favorites/ids` | connecté |

**Messagerie**

| Méthode | Route | Accès |
|---|---|---|
| POST | `/conversations` (`listingId`, `body`) : premier message, ou ajout à la conversation existante | connecté |
| GET | `/conversations` (boîte de réception, paginée) | connecté |
| GET | `/conversations/unread-count` | connecté |
| GET | `/conversations/with-listing/:listingId` | connecté |
| GET | `/conversations/:id` (`?after=` nouveaux messages, `?before=` plus anciens ; marque comme lu) | participant |
| POST | `/conversations/:id/messages` | participant |
| POST | `/conversations/:id/report` | participant |
| POST/DELETE | `/users/:id/block` | connecté |
| GET | `/admin/conversations/:id` (uniquement si signalée) | modérateur |

**Signalements**

| Méthode | Route | Accès |
|---|---|---|
| POST | `/reports` (`listingId` ou `userId`, `reason`, `details`) | connecté (20/jour) |
| GET | `/admin/reports?status=open` | modérateur |
| POST | `/admin/reports/:id/resolve` | modérateur |

**Sanctions et enquêtes**

| Méthode | Route | Accès |
|---|---|---|
| POST | `/admin/sanctions` | modérateur (bannissement : admin) |
| POST | `/admin/sanctions/:id/revoke` | modérateur (levée de bannissement : admin) |
| GET | `/admin/users?phone=+237…` (recherche par numéro) | modérateur |
| GET | `/admin/users/:id` | modérateur |

**Vérification d'identité**

| Méthode | Route | Accès |
|---|---|---|
| POST | `/verifications/upload-urls` | connecté |
| POST | `/verifications` (`documentKind`, `documentKey`, `selfieKey`) | connecté (3/jour) |
| GET | `/me/verification` | connecté |
| GET | `/admin/verifications` | modérateur |
| POST | `/admin/verifications/:userId/review` | modérateur |

## Publier une annonce (côté client)

1. `POST /media/upload-urls` avec `{"files":[{"contentType":"image/jpeg","sizeBytes":412000}]}` → une URL par photo.
2. Envoyer chaque photo directement à son `uploadUrl` (PUT, avec l'en-tête `Content-Type` renvoyé). Compresser avant (JPEG ~1600 px).
3. `POST /listings` avec les `key` reçues dans `imageKeys` → réponse `pending_review`.
4. Un worker traite l'annonce en quelques secondes : elle devient `active`, `rejected`, ou reste en attente d'un modérateur. Le client interroge `GET /me/listings`.

## Pipeline de modération

1. **Photos** : conversion WebP (1200 px + miniature 400 px), suppression des métadonnées (GPS…), calcul de l'empreinte exacte (SHA-256) et perceptuelle (dHash).
2. **Règles** (fichier `moderation/rules.service.ts`) :
   - refus automatique : mot-clé ou domaine en liste `block`, photo connue comme frauduleuse, photo d'un vendeur banni ;
   - relecture humaine : mot-clé `flag`, lien externe, prix < 30 % de la médiane de la catégorie, photo déjà utilisée par un autre vendeur, annonce en double, vendeur ayant moins de 3 annonces approuvées, score de confiance négatif.
3. **Décision** : aucune règle → publiée automatiquement ; sinon file des modérateurs. Chaque décision est journalisée dans `moderation_actions`.
4. En cas de panne du worker ou de Redis, l'annonce reste `pending_review` : elle n'est **jamais** publiée par erreur.
5. Toute modification d'une annonce la repasse en modération (anti « bait and switch »).
6. **Modification** : possible pour une annonce en ligne, refusée (pour corriger) ou expirée (elle est alors republiée pour 30 jours). Bloquée pendant l'analyse, pour qu'aucune modification ne soit publiée sans vérification. `photos` est la liste complète et ordonnée : clés existantes gardées, nouvelles clés `pending/…` ajoutées ; les photos gardées ne sont pas retraitées, celles retirées sont supprimées du stockage. Passer dans une catégorie à identité vérifiée exige la même vérification qu'à la création.
7. Les photos traitées sont nommées par leur identifiant (`listings/<annonce>/<photo>-1200.webp`) : réordonner ou remplacer ne peut jamais écraser un fichier.

Les listes de mots-clés et de domaines se gèrent dans la table `blocklist` (cache de 60 s), sans redéploiement.

**Photos volées : seuil à régler.** Une photo réutilisée est repérée si son empreinte perceptuelle diffère de 6 bits au plus sur 64 (`MAX_HAMMING` dans `rules.service.ts`). Mesuré sur 240 copies d'images de test (recompression, redimensionnement, WebP) : 88 % repérées. Les copies manquées s'écartent jusqu'à 18 bits, alors que deux images différentes restent à 17 bits ou plus. Les images de test ont de grands aplats, le point faible de cette empreinte : refaites la mesure sur de vraies photos d'annonces avant de monter le seuil vers 8 ou 10. Une photo repérée envoie l'annonce en relecture humaine. Elle n'est refusée d'office que si l'autre vendeur est banni.

## Profil et favoris

- **Nom affiché** : noms évoquant l'équipe ou le service client refusés (« Support », « Admin », « Équipe <marque> »…, et le nom de la marque seul, lu dans `APP_NAME` ; il reste autorisé dans un nom complet, une marque pouvant aussi être un nom de famille), car l'usurpation du support est une arnaque classique. Pas de numéro de téléphone dans le nom. 3 changements maximum par 30 jours.
- **Ville** : doit appartenir au pays du compte.
- **Profil public** : nom, niveau de vérification, ancienneté, ville, nombre d'annonces actives et vendues. Jamais le téléphone ni le score de confiance.
- **Favoris** : `PUT` idempotent (rejouable sans risque sur réseau instable), 500 maximum. `GET /me/favorites/ids` sert à afficher les cœurs dans les listes sans requête supplémentaire. Les annonces vendues ou expirées restent visibles avec `available: false` ; celles retirées pour fraude disparaissent.

## Suppression de compte

Obligatoire pour la publication sur l'App Store et Google Play. Confirmée par un code SMS (un jeton volé ne suffit pas).
Le compte est **anonymisé** : numéro, nom, ville, photos des annonces, pièces d'identité, favoris et sessions sont supprimés ;
les annonces sont retirées. Restent les empreintes de photos et d'appareils (anti-fraude) et l'historique de modération.
Un compte supprimé alors qu'il était suspendu, ou avec un historique négatif, laisse son numéro « à surveiller » : un nouveau compte avec ce numéro démarre avec 1 annonce par jour et passe en relecture.
Base existante : appliquer `db/migrations/002_account_deletion.sql`. Faites valider cette politique de conservation par un juriste.

## Messagerie

- Une conversation par annonce et par acheteur. Écrire demande un compte, comme contacter par WhatsApp (c'est le moment de l'achat).
- **Avertissements anti-arnaque** : chaque message est analysé (paiement à l'avance, Western Union, lien, demande de code SMS). L'avertissement s'affiche au destinataire, sous le message. Rien n'est bloqué.
- **Préférence vendeur « messagerie uniquement »** (`PATCH /me`, `contactPreference`) : WhatsApp et appel disparaissent de ses annonces et `GET /listings/:id/contact` refuse de donner son numéro.
- Blocage : message neutre (« Vous ne pouvez pas écrire à cet utilisateur »), sans révéler qui a bloqué.
- Limites anti-spam : comptes de moins de 24 h, 5 nouvelles conversations par jour et 30 messages par heure ; ensuite 30 et 150.
- Confidentialité : un modérateur ne peut lire une conversation **que si elle a été signalée** (vérifié par l'API).
- Suppression de compte : le contenu des messages de la personne est remplacé par « Message supprimé ».
- Relevé des nouveaux messages toutes les 4 s quand la conversation est ouverte (requête minuscule, sans connexion permanente). Notifications push : après la bêta.
- Base existante : appliquer `db/migrations/003_messaging.sql` (le déploiement le fait automatiquement).

## Signalements

- Un signalement ne retire jamais rien seul. À 3 signalements de personnes différentes, l'annonce repasse en revue humaine (déclencheur SQL), ce qui empêche un concurrent de faire supprimer une annonce honnête.
- Les arnaques sont en tête de la file des modérateurs.
- **Résoudre** (`decision: "uphold"`) peut, en une seule opération : retirer l'annonce, ajouter ses photos à la liste noire (`blockImages`, refus automatique si elles réapparaissent) et sanctionner le vendeur (`sanction`). Tous les signalements ouverts sur la même cible sont clos, et leurs auteurs gagnent +1 en fiabilité.
- **Rejeter** (`decision: "dismiss"`) : si l'annonce avait été suspendue par le seuil de signalements, elle est remise en ligne.
- Approuver ou refuser une annonce dans la file de modération clôt aussi ses signalements.

Exemple de résolution d'une arnaque :

```json
{ "decision": "uphold", "removeListing": true, "blockImages": true,
  "sanction": { "type": "ban", "reason": "Fausse location avec frais de dossier" } }
```

## Sanctions

- **Avertissement** : score de confiance -5. **Suspension** (durée obligatoire) : plus de publication ni de signalement, levée automatique à l'échéance. **Bannissement** : annonces retirées, numéro et appareils bloqués, sessions révoquées **immédiatement** (vérification Redis dans `JwtAuthGuard`).
- Garde-fous : seul un admin peut bannir ou lever un bannissement ; un modérateur suspend 30 jours au plus, ne peut sanctionner ni un autre modérateur ni un admin, ni lui-même.
- `GET /admin/users/:id` : fiche d'enquête avec historique, signalements reçus, et **comptes partageant un même appareil** (repère les fraudeurs qui recréent des comptes).

## Vérification d'identité

1. `POST /verifications/upload-urls` avec 2 fichiers, puis envoi direct au stockage (dossier `verifications/`, **privé**).
2. `POST /verifications` : pièce (CNI, passeport ou permis) + selfie en tenant la pièce à côté du visage.
3. Le modérateur voit les photos via des liens valables 5 minutes, puis approuve ou refuse avec un motif.
4. À l'approbation, le compte passe au niveau `identity` : accès à l'immobilier et aux véhicules, limite portée à 10 annonces/jour, score de confiance +20.

**Consignes pour les modérateurs** : le visage du selfie correspond à la photo de la pièce ; la pièce est lisible, entière et non expirée ; pas de capture d'écran ni de photo d'écran ; en cas de doute, refuser avec un motif clair (l'utilisateur peut renvoyer une demande).

**Données personnelles** : les pièces d'identité sont des données sensibles. Définissez une durée de conservation et vérifiez les obligations de déclaration auprès des autorités de protection des données du Cameroun, du Gabon et du Congo avant le lancement, idéalement avec un juriste local. Plus tard, la vérification peut être automatisée par un fournisseur KYC spécialisé en Afrique.

## Tâches planifiées

Toutes les 15 minutes (BullMQ) : expiration des annonces de plus de 30 jours et levée des suspensions arrivées à terme. Désactivable par instance avec `RUN_MAINTENANCE_WORKER=false`.

## Stockage des photos (production)

- Cloudflare R2 ou équivalent S3. Ne rendre **public** que le préfixe `listings/`.
- Le préfixe `pending/` (photos non modérées) doit rester privé. Ajouter une règle de cycle de vie qui le vide après 1 jour.
- Vérifier la configuration CORS du bucket pour les envois depuis le navigateur.

## Latence

- `GET /listings`, `/listings/:id`, `/geo/*` et `/categories` envoient des en-têtes `Cache-Control` publics : configurez une règle de cache Cloudflare pour ces routes (le JSON n'est pas mis en cache par défaut).
- Pagination par curseur, miniatures de 400 px dans les listes, photos immuables (cache d'un an).

## Sécurité et anti-fraude déjà en place

- Connexion SMS : pays autorisés, limites par numéro / IP / jour, code haché à usage unique.
- Jetons de session renouvelés à chaque usage, avec détection de réutilisation.
- Règles imposées aussi par la base : limite d'annonces par jour, identité vérifiée pour l'immobilier et les véhicules.
- Numéro du vendeur jamais exposé publiquement, consultation limitée par jour.
- Bannissement : annonces retirées, numéro et appareils bloqués.

## Production

Image Docker (`Dockerfile`), migrations suivies (`db/migrate.sh`, table `schema_migrations`), déploiement complet : voir le dossier `deploy/` et son guide.
En production, `S3_PRIVATE_BUCKET` sépare les pièces d'identité et photos non modérées du bucket public, et `TRUSTED_PROXIES=uniquelocal` n'accepte l'en-tête `X-Forwarded-For` que des relais du réseau Docker privé (Cloudflare Tunnel, site) : un client ne peut pas choisir son IP pour contourner les limites.

## À faire avant la production

- Choisir le fournisseur SMS après vérification de sa couverture (+237, +241, +242).
- Restreindre l'accès au serveur aux IP de Cloudflare.
- Ne jamais rendre public le dossier `verifications/` du bucket.
- Régler le seuil de détection des photos volées (voir « Modération » plus haut) sur de vraies photos.
- Modules à venir : photo de profil, boosts payants par mobile money, notifications.

## Dépendances

- `fastify` est fixé à la version utilisée par `@nestjs/platform-fastify` (bloc `overrides` de `package.json`) : deux copies différentes cassent la compilation. À la mise à jour de Nest, alignez les deux.
- npm 11 et plus bloque les scripts d'installation de `sharp` et `msgpackr-extract` : sans conséquence, `sharp` utilise ses binaires précompilés et BullMQ se passe de `msgpackr-extract`.
