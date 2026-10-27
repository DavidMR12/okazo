import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AdsLoader } from '@/components/Ads';
import { ConsentBanner, ManageCookiesLink } from '@/components/ConsentBanner';
import { HeaderAccount } from '@/components/HeaderAccount';
import { ServiceWorker } from '@/components/ServiceWorker';
import { getCountries } from '@/lib/api';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import './globals.css';
import { DialogHost } from '@/components/Dialog';

// Tout le site en Inter, police sans empattement de la maquette du porteur (18 octobre 2026 ; remplace Roboto Slab,
// Google Sans et Ubuntu). Fichier servi par le site, sans appel à Google.
const interFont = Inter({ weight: ['400', '500', '600', '700', '800'], subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} : petites annonces au Cameroun, au Gabon et au Congo`, template: `%s | ${SITE_NAME}` },
  description: 'Achetez et vendez près de chez vous : téléphones, véhicules, immobilier, maison, mode. Annonces vérifiées avant publication.',
  openGraph: { siteName: SITE_NAME, locale: 'fr_FR', type: 'website' },
};

export const viewport: Viewport = { themeColor: '#233A8F', width: 'device-width', initialScale: 1 };

// Aucune lecture de cookie ici : les pages restent en cache et s'affichent vite
export default async function RootLayout({ children }: { children: ReactNode }) {
  // Pays du pied de page (donnée en cache une heure, aucune lecture de cookie)
  const countries = await getCountries().catch(() => []);
  return (
    <html lang="fr" className={interFont.variable}>
      <body>
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
        <footer className="footer">
          <div className="container footer-grid">
            <div className="footer-brand">
              <Link href="/" className="logo" aria-label={`${SITE_NAME}, accueil`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- petit logo fixe, servi tel quel */}
                <img src="/okazo-logo.png" alt={SITE_NAME} width={426} height={123} />
              </Link>
              <p>Petites annonces entre particuliers au Cameroun, au Gabon et au Congo. Chaque annonce est vérifiée avant sa mise en ligne.</p>
            </div>
            <nav aria-label="Pays">
              <h2>Annonces</h2>
              {countries.map((c) => (
                <Link key={c.code} href={`/${c.code.toLowerCase()}`}>{c.name}</Link>
              ))}
            </nav>
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
