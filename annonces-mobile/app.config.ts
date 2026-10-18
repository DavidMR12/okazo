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
  appId: 'com.okazo.app', // à confirmer avant la première publication sur les stores (ne pourra plus changer)
};

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
  ios: { bundleIdentifier: BRAND.appId, supportsTablet: false },
  android: { package: BRAND.appId },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-image',
    // Police embarquée dans l'application : disponible dès l'ouverture, sans téléchargement
    ['expo-font', { fonts: [
          'node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf',
          'node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf',
          'node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf',
          'node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf',
          'node_modules/@expo-google-fonts/inter/800ExtraBold/Inter_800ExtraBold.ttf',
        ] }],
    'expo-status-bar',
    [
      'expo-image-picker',
      {
        photosPermission: "Autorisez l'accès à vos photos pour les ajouter à vos annonces.",
        cameraPermission: "Autorisez l'appareil photo pour photographier vos articles et vérifier votre identité.",
      },
    ],
  ],
  experiments: { typedRoutes: false },
  extra: { ...config.extra, brandName: BRAND.name },
});
