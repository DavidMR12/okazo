export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Okazo' // nom de la marque : seul réglage côté site;
export const DEFAULT_COUNTRY = (process.env.NEXT_PUBLIC_DEFAULT_COUNTRY ?? 'cm').toLowerCase();
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? '';
export const AD_SLOTS = {
  feed: process.env.NEXT_PUBLIC_ADSENSE_SLOT_FEED ?? '',
  listing: process.env.NEXT_PUBLIC_ADSENSE_SLOT_LISTING ?? '',
};

/** Version des conditions générales d'utilisation (à changer à chaque modification de /conditions). */
export const CGU_VERSION = '2026-10-15';
