import type { MetadataRoute } from 'next';
import { SITE_NAME } from '@/lib/site';

// Permet d'« installer » le site sur l'écran d'accueil du téléphone, comme une application
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: 'Petites annonces entre particuliers au Cameroun, au Gabon et au Congo.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#233A8F',
    lang: 'fr',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
