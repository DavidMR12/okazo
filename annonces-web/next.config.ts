import type { NextConfig } from 'next';

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
        ],
      },
      // Le service worker doit être relu à chaque visite pour se mettre à jour
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ];
  },
};

export default nextConfig;
