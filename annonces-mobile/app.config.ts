import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Nom de la marque : SEUL endroit à modifier dans l'application.
 * Les identifiants (bundleIdentifier, package) ne peuvent plus changer une fois l'application publiée
 * sur les stores : fixez-les avec le nom définitif, avant la première publication.
 */
const BRAND = {
  name: 'Okazo', // nom définitif (décision du porteur, 14 octobre 2026)
  slug: 'okazo',
  scheme: 'okazo',
  appId: 'org.okazo.app', // fiche Play Console créée par le porteur avec ce nom (19/11/2026) : ne plus jamais le changer
};

/** Numéro de version Play Store : augmenté de 1 par annonces-deploy/deploie-android.sh à chaque envoi. */
const ANDROID_VERSION_CODE = 3;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: BRAND.name,
  slug: BRAND.slug,
  scheme: BRAND.scheme,
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  // Logo Okazo provisoire, découpé dans la maquette : à remplacer par le fichier source (1024 px) avant les stores
  icon: './src/assets/okazo-icon.png',
  web: { favicon: './src/assets/okazo-favicon.png' },
  ios: {
    bundleIdentifier: BRAND.appId,
    supportsTablet: false,
    // Application en français : boutons des fenêtres du système (« Autoriser », « Refuser ») en français
    infoPlist: { CFBundleDevelopmentRegion: 'fr', CFBundleAllowMixedLocalizations: true },
  },
  // Textes des demandes d'autorisation en français (aussi pour un téléphone réglé dans une autre langue)
  locales: { fr: './src/locales/fr.json', en: './src/locales/fr.json' },
  android: {
    package: BRAND.appId,
    versionCode: ANDROID_VERSION_CODE,
    // Ajoutées par des modules mais jamais utilisées par Okazo (micro, fenêtre par-dessus les autres applis)
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW'],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-image',
    // Police embarquée dans l'application : disponible dès l'ouverture, sans téléchargement
    ['expo-font', { fonts: [
          'node_modules/@expo-google-fonts/outfit/400Regular/Outfit_400Regular.ttf',
          'node_modules/@expo-google-fonts/outfit/500Medium/Outfit_500Medium.ttf',
          'node_modules/@expo-google-fonts/outfit/600SemiBold/Outfit_600SemiBold.ttf',
          'node_modules/@expo-google-fonts/outfit/700Bold/Outfit_700Bold.ttf',
          'node_modules/@expo-google-fonts/outfit/800ExtraBold/Outfit_800ExtraBold.ttf',
        ] }],
    'expo-status-bar',
    [
      'expo-image-picker',
      {
        photosPermission: "Autorisez l'accès à vos photos pour les ajouter à vos annonces.",
        cameraPermission: "Autorisez l'appareil photo pour photographier vos articles et vérifier votre identité.",
      },
    ],
    // Publicité AdMob (src/lib/ads.ts). iOS : ID de test de Google tant que l'appli iPhone n'est pas créée dans AdMob
    [
      'react-native-google-mobile-ads',
      {
        androidAppId: 'ca-app-pub-7249006535506723~9793735046',
        iosAppId: 'ca-app-pub-3940256099942544~1458002511',
        delayAppMeasurementInit: true,
      },
    ],
    // Notifications push (src/lib/push.ts) : petite icône blanche du logo, teinte bleue Okazo
    // google-services.json (Firebase) pris s'il est présent : plugins/with-google-services.js
    './plugins/with-google-services',
    ['expo-notifications', { icon: './src/assets/okazo-notification.png', color: '#1E5EDB', defaultChannel: 'default' }],
    // R8 (WorkManager d'AdMob gardé), Wi-Fi et écran portrait facultatifs
    './plugins/with-android-release-fixes',
    // Construction Play Store sur l'ordinateur (comme Louam) : signature et retouches Windows
    './plugins/with-upload-signing',
    './plugins/with-windows-build',
  ],
  experiments: { typedRoutes: false },
  extra: { ...config.extra, brandName: BRAND.name },
});
