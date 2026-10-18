import Constants from 'expo-constants';

/** Nom de la marque, défini dans app.config.ts (seul endroit à modifier). */
export const BRAND_NAME: string = (Constants.expoConfig?.extra?.brandName as string | undefined) ?? 'Okazo';

/** Adresse du site (conditions d'utilisation, confidentialité) : nom de domaine à fixer avant la bêta. */
export const SITE_URL: string = process.env.EXPO_PUBLIC_SITE_URL ?? 'http://localhost:3001';
