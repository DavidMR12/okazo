import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/compte', '/connexion', '/favoris', '/signaler', '/recherche', '/publier', '/mes-annonces', '/admin', '/messages', '/postuler', '/candidatures', '/panier', '/recherches'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
