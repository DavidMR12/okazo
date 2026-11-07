# Mise en production

Architecture : **un serveur** Ubuntu en France qui fait tourner tous les services en conteneurs, **Cloudflare devant**, les photos sur **Cloudflare R2**. Le serveur n'ouvre aucun port web : le trafic arrive par **Cloudflare Tunnel**, une connexion sortante. Il n'y a ni certificat à gérer ni pare-feu à maintenir, et l'adresse du serveur reste cachée.

```
Visiteurs (mobile, navigateur)
        │ HTTPS
   Cloudflare ── cache, protection, limitation des abus
        │ tunnel chiffré (sortant)
   Serveur ─ cloudflared ─┬─ web (Next.js)  ── appelle l'API en interne
                          └─ api (NestJS)
                   worker (modération, tâches) · PostgreSQL · Redis
   Cloudflare R2 : annonces-media (public) · annonces-private · annonces-backups
```

Suivez les étapes dans l'ordre. Comptez une journée pour la première mise en ligne.

---

## 1. Décisions préalables

| Sujet | À décider |
|---|---|
| Marque et domaine | Nom définitif, après recherche d'antériorité et dépôt à l'OAPI (un seul dépôt couvre le Cameroun, le Gabon et le Congo), puis le domaine. Voir « Appliquer le nom définitif » plus bas. |
| Fournisseur SMS | Couverture et prix vérifiés sur +237, +241 et +242. Le code n'intègre que Twilio : pour un autre fournisseur, ajoutez une classe à côté de `api/src/auth/sms/twilio-sms.provider.ts`. |
| Serveur | 4 vCPU, 8 Go de RAM, 80 Go SSD, Ubuntu 24.04, hébergé en France. C'est largement suffisant pour la bêta. |

**Latence** : avant de louer, mesurez depuis Douala et Libreville (un proche sur place, `ping` ou les pages de test de débit de l'hébergeur) vers les datacenters de Paris et de Marseille de 2 ou 3 hébergeurs. Choisissez le plus rapide.

## 2. Dépôt Git unique

Le dépôt privé (github.com/DavidMR12/okazo) contient les quatre dossiers tels quels :

```
okazo/
├─ annonces-api/
├─ annonces-web/      ← avec package.json et package-lock.json : se construit sans setup.sh
├─ annonces-mobile/
└─ annonces-deploy/   ← ce dossier
```

Versionnez les `package-lock.json` (les images Docker en ont besoin), jamais les fichiers `.env`. Après une mise à jour des dépendances du site dans `web/`, recopiez `package.json` et `package-lock.json` dans `annonces-web/`.

## 3. Serveur

```bash
# Depuis votre ordinateur : envoyer le script, puis le lancer en root
scp annonces-deploy/scripts/server-setup.sh root@IP:/root/
ssh root@IP "bash /root/server-setup.sh deploy"
# Dans un AUTRE terminal, vérifier la nouvelle connexion avant de fermer la session root :
ssh deploy@IP
```

Ce script installe Docker, crée l'utilisateur `deploy`, interdit la connexion par mot de passe et la connexion root, ferme tous les ports sauf SSH, active les mises à jour de sécurité automatiques et ajoute 4 Go de mémoire d'échange.

Puis, en tant que `deploy` :

```bash
cd /opt/annonces
git clone git@github.com:DavidMR12/okazo.git .   # ou via une clé de déploiement en lecture seule
cp annonces-deploy/.env.example annonces-deploy/.env && chmod 600 annonces-deploy/.env
```

## 4. Cloudflare

### 4.1 Domaine
Ajoutez le domaine à Cloudflare et remplacez les serveurs DNS chez votre registraire.
- **SSL/TLS** : activez *Always Use HTTPS* et fixez *Minimum TLS* à 1.2.
- **Speed** : activez HTTP/3.

### 4.2 R2 : trois buckets

| Bucket | Accès | Contenu |
|---|---|---|
| `annonces-media` | **public** via le domaine personnalisé `media.votre-domaine.com` | Photos d'annonces modérées |
| `annonces-private` | **privé**, aucun accès public | Photos en attente de modération, pièces d'identité |
| `annonces-backups` | **privé** | Sauvegardes de la base |

Réglages à faire :
- Sur `annonces-media` : *Settings › Custom Domains*, ajoutez `media.votre-domaine.com`. Laissez l'accès `r2.dev` **désactivé**.
- Sur `annonces-private`, ajoutez une règle de cycle de vie : supprimer les objets du préfixe `pending/` après 1 jour. Ce sont les photos envoyées pour des annonces jamais publiées.
- Sur `annonces-private`, ajoutez une règle CORS. Elle est indispensable pour publier depuis le site :
  ```json
  [{ "AllowedOrigins": ["https://votre-domaine.com"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3600 }]
  ```
- Créez **deux jetons API R2** (*Object Read & Write*) :
  - le premier limité à `annonces-media` et `annonces-private`, pour l'application : `R2_ACCESS_KEY_ID` et `R2_SECRET_ACCESS_KEY` ;
  - le second limité à `annonces-backups` : `R2_BACKUP_…`.
- Notez l'identifiant de compte (`R2_ACCOUNT_ID`).

### 4.3 Tunnel
*Zero Trust › Networks › Tunnels* : créez un tunnel « Cloudflared » et copiez son **jeton** dans `CLOUDFLARE_TUNNEL_TOKEN`. Ajoutez ensuite ces *Public Hostnames* :

| Nom d'hôte | Service |
|---|---|
| `votre-domaine.com` | `http://web:3001` |
| `www.votre-domaine.com` | `http://web:3001` |
| `api.votre-domaine.com` | `http://api:3000` |

Puis *Rules › Redirect Rules* : redirigez `www.votre-domaine.com/*` vers `https://votre-domaine.com/$1` (301).

### 4.4 Cache
*Caching › Cache Rules*. Dans les trois cas, choisissez « Eligible for cache » et gardez les durées d'origine, que le code fixe déjà :

| Règle | Condition | Effet |
|---|---|---|
| Photos | nom d'hôte = `media.votre-domaine.com` | Photos servies depuis Cloudflare, cache d'un an (elles ne changent jamais) |
| API publique | nom d'hôte = `api…`, méthode GET, chemin commençant par `/listings`, `/geo`, `/categories` ou `/users` | Listes et annonces mises en cache 30 à 60 s |
| Pages du site | nom d'hôte = `votre-domaine.com`, chemin ne commençant pas par `/api/` | Pages d'annonces et accueil servis depuis Cloudflare |

Les réponses personnelles (numéro du vendeur, favoris, compte) portent `Cache-Control: private` et ne sont **jamais** mises en cache, même si elles correspondent à une règle.

### 4.5 Protection des SMS
*Security › WAF › Rate limiting rules* : chemin égal à `/auth/otp/request` (hôte `api…`) **ou** `/api/auth/request` (hôte du site). Au-delà de 5 requêtes par minute et par IP, bloquer 10 minutes. C'est un second rempart devant les limites de l'API, contre les attaques qui font exploser la facture SMS.

N'activez pas *Bot Fight Mode* sur l'hôte `api…` : il peut bloquer l'application mobile.

## 5. Variables d'environnement

```bash
cd /opt/annonces/annonces-deploy
bash scripts/generate-secrets.sh    # copiez les 3 lignes dans .env
nano .env                           # complétez le reste
```

Pour chiffrer les sauvegardes, générez une paire de clés **sur votre ordinateur**, pas sur le serveur : `age-keygen -o cle-sauvegardes.txt`. Mettez la ligne `age1…` (clé publique) dans `BACKUP_AGE_RECIPIENT` et gardez `cle-sauvegardes.txt` en lieu sûr, hors du serveur (gestionnaire de mots de passe, plus une copie hors ligne). Sans elle, les sauvegardes sont irrécupérables.

## 6. Premier déploiement

```bash
bash scripts/deploy.sh
```

Le script construit les images, applique les migrations SQL, démarre les services et préchauffe l'accueil. Les déploiements suivants se font avec la même commande, après un `git push` depuis votre ordinateur.

**Vos comptes d'administration** : connectez-vous une fois depuis l'application ou le site, puis :

```bash
bash scripts/make-admin.sh +237XXXXXXXXX admin
bash scripts/make-admin.sh +237YYYYYYYYY moderator   # vos modérateurs
```

## 7. Vérifications avant d'ouvrir

- `https://api.votre-domaine.com/health` renvoie `{"status":"ok"}`.
- Le site s'affiche, et `https://votre-domaine.com/sitemap.xml` liste les pays et catégories.
- **Parcours complet avec un vrai téléphone** : connexion par SMS, publication avec photos (web et mobile), l'annonce passe en revue, vous l'approuvez avec le compte modérateur, elle apparaît en ligne, contact WhatsApp, signalement.
- Une photo de pièce d'identité n'est **pas** accessible via `media.votre-domaine.com/verifications/…`. Elle est dans le bucket privé : vous devez obtenir une erreur 404.
- Les en-têtes de réponse d'une page d'annonce affichent `cf-cache-status: HIT` au deuxième chargement.

## 8. Sauvegardes

```bash
crontab -e
# ajouter :
15 3 * * * /opt/annonces/annonces-deploy/scripts/backup.sh >> /var/backups/annonces/backup.log 2>&1
```

Lancez-la une première fois à la main (`bash scripts/backup.sh`), puis **testez une restauration dès maintenant**, sur un serveur de test ou en local. Une sauvegarde jamais restaurée n'est pas une sauvegarde. Refaites ce test une fois par mois.

```bash
# Récupérer une sauvegarde depuis R2, puis restaurer (clé privée age copiée temporairement) :
bash scripts/restore.sh annonces-20261015-0315.dump.age ~/cle-sauvegardes.txt
```

## 9. Surveillance

- **Disponibilité** : dans un service de surveillance gratuit, créez deux sondes toutes les minutes, sur `https://api.votre-domaine.com/health` et sur `https://votre-domaine.com`, avec alerte par e-mail et SMS.
- **Sauvegardes** : créez une sonde « heartbeat » quotidienne et mettez son URL dans `BACKUP_HEARTBEAT_URL`. Vous êtes alerté si une nuit se passe sans sauvegarde réussie.
- **Commandes utiles** :
  ```bash
  docker compose ps                         # état des services
  docker compose logs -f --tail=100 api     # journaux (api, worker, web…)
  df -h                                     # espace disque
  ```
- **Coûts SMS** : surveillez le tableau de bord du fournisseur SMS la première semaine. Une hausse soudaine signale une attaque, et les plafonds (`OTP_DAILY_GLOBAL_CAP`) limitent les dégâts.

## 10. Applications mobiles

```bash
cd mobile
# Dans eas.json : remplacez api.votre-domaine.com. Dans app.config.ts : la constante BRAND (nom, identifiants), puis les icônes.
npx eas-cli login
npx eas-cli build --profile preview --platform android   # APK à installer pour la bêta
npx eas-cli build --profile production --platform all   # versions pour les stores
npx eas-cli submit --platform android
```

- **Google Play** : les nouveaux comptes développeur personnels doivent d'abord passer par une phase de **test fermé** avec des testeurs, avant la mise en production. Vérifiez les conditions actuelles et prévoyez ce délai dans votre planning ; vos testeurs de la bêta peuvent y servir.
- **App Store** : il faut un compte Apple Developer. L'examen vérifie notamment la suppression de compte dans l'application (déjà faite) et les liens vers la politique de confidentialité.
- Commencez par Android : c'est la grande majorité des téléphones sur vos marchés.

## 11. Google

- **Search Console** : ajoutez le domaine, validez-le via Cloudflare DNS et soumettez `/sitemap.xml`.
- **AdSense** : faites la demande une fois le site rempli de vraies annonces. Après approbation, renseignez `ADSENSE_*` dans `.env`, puis relancez `bash scripts/deploy.sh` (ces valeurs sont intégrées à la construction du site). Activez aussi le message de consentement certifié de Google pour l'Europe (*Confidentialité et messages*).

## 12. Avant l'ouverture au public

- [ ] Politique de confidentialité et conditions d'utilisation relues par un juriste, avec les obligations de déclaration de données personnelles au Cameroun, au Gabon et au Congo.
- [ ] Fournisseur SMS en production, avec un nom d'expéditeur validé par les opérateurs si nécessaire.
- [ ] Au moins un modérateur disponible chaque jour, sur le délai de traitement que vous vous fixez.
- [ ] Sauvegarde restaurée avec succès au moins une fois.
- [ ] Sondes de surveillance actives.
- [ ] Premières annonces publiées par vous et vos premiers vendeurs : une plateforme vide ne décolle pas.

## Appliquer le nom définitif

Le nom provisoire est « Annonces ». Il se change à **deux endroits seulement** :

1. `annonces-deploy/.env` : `APP_NAME=VotreNom`. Il alimente l'API (texte des SMS, nom interdit aux comptes) et le site (logo, titres, résultats Google), puis lancez `bash scripts/deploy.sh`.
2. `mobile/app.config.ts` : la constante `BRAND` en haut du fichier (nom affiché, identifiants des stores), puis reconstruisez l'application.

Les identifiants techniques (cookies, base de données, buckets) sont neutres et n'ont pas à changer.

## Faire évoluer

| Signal | Réponse |
|---|---|
| Processeur souvent au-dessus de 70 % | Serveur plus gros, ou `worker` sur un second serveur |
| Base au-delà de quelques Go, ou besoin de haute disponibilité | PostgreSQL managé, avec sauvegardes et bascule gérées par l'hébergeur |
| Coupure pendant les déploiements devenue gênante | Deux instances de `web` et `api` derrière le tunnel, remplacées l'une après l'autre |
| Plusieurs développeurs | Construction des images dans un service d'intégration continue, puis `docker compose pull` sur le serveur |
