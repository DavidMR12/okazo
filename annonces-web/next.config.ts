import type { NextConfig } from 'next';

const media = process.env.NEXT_PUBLIC_MEDIA_ORIGIN ?? '';

/**
 * Politique de sécurité du contenu, statique : un nonce exigerait de rendre chaque page au moment de la requête, donc de casser l'ISR.
 * AdSense et les boutons Google chargent des scripts depuis de nombreux domaines qui changent : d'où https: pour les scripts.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https:",
  "style-src 'self' 'unsafe-inline' https:",
  `img-src 'self' data: blob: https: ${media}`,
  "font-src 'self' data: https:",
  `connect-src 'self' https: ${media}`,
  'frame-src https:',
  "worker-src 'self'",
].join('; ');

// Production seulement : le mode développement a besoin d'eval et de ws:, et le site local tourne en http
const productionHeaders =
  process.env.NODE_ENV === 'production'
    ? [
        { key: 'Content-Security-Policy', value: CSP },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), payment=()' },
      ]
    : [];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Développement : autorise l'ouverture du site depuis un téléphone du réseau local (sans effet en production)
  allowedDevOrigins: ['192.168.1.96', '192.168.*.*'],
  output: 'standalone', // image Docker légère pour le déploiement
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          ...productionHeaders,
        ],
      },
      // Le service worker doit être relu à chaque visite pour se mettre à jour
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ];
  },
};

export default nextConfig;
