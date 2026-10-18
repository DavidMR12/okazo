# Application mobile (Expo / React Native)

Parcours complets : consultation, connexion par SMS, favoris, contact WhatsApp, signalements,
publication d'annonces, vérification d'identité, compte et suppression de compte.

## Installation

Prérequis : Node.js LTS, l'API qui tourne (voir `annonces-api`), l'application **Expo Go** sur votre téléphone.

```bash
bash setup.sh            # crée ../mobile avec la dernière version d'Expo
cd ../mobile
# éditez .env : EXPO_PUBLIC_API_URL=http://<IP-de-votre-ordinateur>:3000
npx expo start           # scannez le QR code avec Expo Go
```

Le script crée un projet Expo neuf puis y copie `app/` et `src/`, pour toujours partir de versions compatibles entre elles.
Sur un téléphone physique, `localhost` désigne le téléphone lui-même : utilisez l'IP locale de l'ordinateur (même Wi-Fi).

## Écrans

| Écran | Fichier |
|---|---|
| Accueil : recherche, pays, catégories, annonces « à la une » | `app/(tabs)/index.tsx` |
| Panier : articles regroupés par vendeur, total, « Écrire au vendeur » (aucun paiement) | `app/(tabs)/cart.tsx` |
| Favoris (depuis Compte) | `app/favorites.tsx` |
| Publier : photos, catégorie, prix, état, ville, brouillon automatique | `app/(tabs)/publish.tsx` |
| Vérification d'identité : pièce + selfie | `app/verify-identity.tsx` |
| Compte : nom, statut de vérification, déconnexion | `app/(tabs)/account.tsx` |
| Détail d'une annonce : photos, vendeur, conseils de sécurité, WhatsApp, appel | `app/listing/[id].tsx` |
| Profil public du vendeur et ses annonces | `app/seller/[id].tsx` |
| Messages : conversations, pastille des non-lus | `app/(tabs)/messages.tsx` |
| Conversation : envoi immédiat, « Vu », avertissements anti-arnaque, signaler, bloquer | `app/conversation/[id].tsx` |
| Premier message à un vendeur (message proposé) | `app/conversation/new.tsx` |
| Connexion par numéro, puis code SMS | `app/login.tsx`, `app/verify.tsx` |
| Signalement | `app/report.tsx` |
| Mes annonces : statut, motif de refus, modifier, republier, vendue, suppression | `app/my-listings.tsx` |
| Modifier une annonce (même formulaire que la publication) | `app/listing/edit/[id].tsx`, `src/components/ListingForm.tsx` |
| Suppression du compte (exigée par Apple et Google) | `app/delete-account.tsx` |

## Choix techniques

- **Réseau lent** : cache disque de 24 h (React Query + AsyncStorage), l'accueil et les annonces déjà vues s'ouvrent sans réseau ; images en cache mémoire et disque (expo-image) ; miniature affichée pendant le chargement de la photo ; recherche lancée 400 ms après la dernière frappe ; délai maximal de 20 s par requête.
- **Fluidité sur petits téléphones** : lignes de hauteur fixe, rendu par lots, pas de police à télécharger.
- **Sécurité** : jeton de rafraîchissement dans le stockage chiffré du système (SecureStore), jeton d'accès en mémoire ; un seul renouvellement de session à la fois (sinon le serveur y verrait un vol de session) ; les routes publiques partent sans jeton pour rester cacheables par le CDN.
- **Anti-fraude** : identifiant d'appareil envoyé à la connexion ; photos d'identité prises en direct ; conseils de sécurité affichés avant chaque contact ; numéro du vendeur demandé seulement au moment du contact ; signalement à deux touches depuis l'annonce ou le profil vendeur.

## Publication d'une annonce

1. Chaque photo est **compressée sur le téléphone** (1600 px, JPEG) : ~300-500 Ko au lieu de plusieurs Mo, soit moins de forfait consommé et un envoi bien plus rapide.
2. Elle part **aussitôt choisie**, en arrière-plan (2 envois à la fois au plus), pendant que le vendeur remplit le formulaire. Au moment de publier, l'envoi est généralement terminé.
3. En cas d'échec réseau, 3 essais automatiques ; sinon la photo passe en rouge et se relance d'une touche.
4. Le texte du formulaire est sauvegardé en brouillon : un appel, une coupure ou une fermeture de l'app ne font rien perdre (les photos sont à rajouter).
5. Immobilier et véhicules : si l'identité n'est pas vérifiée, le formulaire le signale et renvoie vers la vérification.

## Vérification d'identité

Pièce d'identité et selfie avec la pièce, **pris avec l'appareil photo uniquement** (pas de galerie) pour compliquer l'usage de documents trouvés en ligne. Qualité de compression plus élevée pour que le texte reste lisible. Les fichiers vont dans le dossier privé du stockage.

## Identité visuelle

Indigo pour les actions, safran réservé au prix, vert pour « identité vérifiée ». Le prix est présenté comme une étiquette de marché (`src/components/PriceTag.tsx`), seul élément coloré des listes. Contraste élevé pour la lecture en plein soleil. Couleurs dans `src/theme.ts`.

## Avant la publication sur les stores

- Choisir le nom définitif, puis le reporter dans la constante `BRAND` de `app.config.ts` (seul endroit). Les identifiants des stores ne pourront plus changer après la première publication. Ajouter l'icône et l'écran de démarrage.
- Rédiger les conditions d'utilisation et la politique de confidentialité (liens obligatoires sur les stores).
- Construire avec EAS Build (`npx eas build`) pour Android et iOS.
