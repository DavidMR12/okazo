import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AdsLoader } from '@/components/Ads';
import { ConsentBanner, ManageCookiesLink } from '@/components/ConsentBanner';
import { HeaderAccount } from '@/components/HeaderAccount';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ServiceWorker } from '@/components/ServiceWorker';
import { RegionBar } from '@/components/RegionBar';
import { getRegionCatalog } from '@/lib/api';
import { ADSENSE_CLIENT, SITE_NAME, SITE_URL } from '@/lib/site';
import './globals.css';
import { DialogHost } from '@/components/Dialog';

// Tout le site en Outfit, plus aucune police neutre (porteur, 15 novembre 2026 ; remplace Inter)
const outfitFont = Outfit({ weight: ['400', '500', '600', '700', '800'], subsets: ['latin'], display: 'swap', variable: '--font-outfit' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} : petites annonces près de chez vous`, template: `%s | ${SITE_NAME}` },
  description: 'Achetez et vendez près de chez vous : téléphones, véhicules, immobilier, maison, mode. Annonces vérifiées avant publication.',
  openGraph: { siteName: SITE_NAME, locale: 'fr_FR', type: 'website' },
  // Vérification du site par Google AdSense (balise seule : aucune publicité n'est chargée avant le choix des cookies)
  ...(ADSENSE_CLIENT ? { other: { 'google-adsense-account': ADSENSE_CLIENT } } : {}),
};

export const viewport: Viewport = { themeColor: '#233A8F', width: 'device-width', initialScale: 1 };

// Aucune lecture de cookie ici : les pages restent en cache et s'affichent vite
export default async function RootLayout({ children }: { children: ReactNode }) {
  // Pays ouverts et leurs villes, pour le choix de la ville (donnée en cache une heure, aucune lecture de cookie :
  // la région du visiteur est lue dans son navigateur)
  const catalog = await getRegionCatalog().catch(() => []);
  return (
    <html lang="fr" className={outfitFont.variable}>
      <body>
        <RegionBar catalog={catalog} />
        <header className="header">
          <div className="container header-inner">
            <Link href="/" className="logo logo-with-tagline" aria-label={`${SITE_NAME}, accueil`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- petit logo fixe, servi tel quel */}
              <img src="/okazo-logo.png" alt={SITE_NAME} width={426} height={123} />
              <span className="logo-tagline">Achetez · Vendez · Près de chez vous</span>
            </Link>
            <nav className="header-nav" aria-label="Navigation principale">
              <HeaderAccount />
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <OfflineBanner />
        <footer className="footer">
          <div className="container footer-grid">
            <div className="footer-brand">
              <Link href="/" className="logo" aria-label={`${SITE_NAME}, accueil`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- petit logo fixe, servi tel quel */}
                <img src="/okazo-logo.png" alt={SITE_NAME} width={426} height={123} />
              </Link>
              <p>Petites annonces entre particuliers, près de chez vous. Chaque annonce est vérifiée avant sa mise en ligne.</p>
            </div>
            <nav aria-label="Votre espace">
              <h2>Votre espace</h2>
              <Link href="/publier">Publier une annonce</Link>
              <Link href="/mes-annonces">Mes annonces</Link>
              <Link href="/messages">Messages</Link>
              <Link href="/recherches">Mes recherches</Link>
            </nav>
            <nav aria-label="Informations">
              <h2>Informations</h2>
              <Link href="/conditions">Conditions d’utilisation</Link>
              <Link href="/confidentialite">Confidentialité et cookies</Link>
              <ManageCookiesLink />
            </nav>
          </div>
        </footer>
        <ConsentBanner />
        <DialogHost />
        <AdsLoader />
        <ServiceWorker />
      </body>
    </html>
  );
}
