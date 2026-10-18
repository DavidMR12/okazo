import { chatbubbleEllipsesOutline, handRight, list, pencil, pricetag, trendingDown } from 'ionicons/icons';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { AdSlot } from '@/components/AdSlot';
import { CartButton } from '@/components/CartButton';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ContactButtons } from '@/components/ContactButtons';
import { Gallery } from '@/components/Gallery';
import { DetailCard, FactGrid } from '@/components/DetailCard';
import { WalletList } from '@/components/Wallets';
import { Ion } from '@/components/Ion';
import { ListingList } from '@/components/ListingList';
import { RememberListing } from '@/components/RecentlyViewed';
import { RatingSummary } from '@/components/Stars';
import { FavoriteButton } from '@/components/FavoriteButton';
import { PriceTag } from '@/components/PriceTag';
import { SafetyNotice } from '@/components/SafetyNotice';
import { findCategory, getCategories, getListing, getListings } from '@/lib/api';
import { CONDITION_LABELS, idFromSlug, listingPath, memberSince, priceLabel, relativeTime, placeLabel } from '@/lib/format';
import { AD_SLOTS, SITE_URL } from '@/lib/site';
import type { ListingDetail } from '@/lib/types';

// Pages générées à la première visite puis gardées en cache 60 s (ISR)
export const revalidate = 60;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Params = Promise<{ slug: string }>;

async function load(slug: string): Promise<ListingDetail | null> {
  const id = idFromSlug(slug);
  return id ? getListing(id) : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const l = await load((await params).slug);
  if (!l) return { title: 'Annonce introuvable', robots: { index: false } };
  const price = priceLabel(l.priceType, l.priceXaf);
  const description = `${price}, ${placeLabel(l.city, l.district)}. ${l.description.replace(/\s+/g, ' ').slice(0, 140)}`;
  return {
    title: `${l.title} : ${price}, ${l.city}`,
    description,
    alternates: { canonical: listingPath(l) },
    openGraph: { title: l.title, description, url: listingPath(l), images: l.images[0] ? [{ url: l.images[0].url }] : undefined },
    robots: l.status === 'sold' ? { index: false, follow: true } : undefined,
  };
}

const CONDITION_SCHEMA: Record<string, string> = {
  new: 'https://schema.org/NewCondition',
  like_new: 'https://schema.org/UsedCondition',
  good: 'https://schema.org/UsedCondition',
  fair: 'https://schema.org/UsedCondition',
  for_parts: 'https://schema.org/DamagedCondition',
};

/** Données structurées : permettent à Google d'afficher le prix et la disponibilité dans ses résultats. */
function jsonLd(l: ListingDetail, crumbs: { name: string; url: string }[]) {
  const product: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: l.title,
    description: l.description.slice(0, 500),
    image: l.images.map((i) => i.url),
    category: l.category.name,
  };
  if (l.priceXaf !== null && l.priceType !== 'contact') {
    product.offers = {
      '@type': 'Offer',
      price: l.priceType === 'free' ? 0 : l.priceXaf,
      priceCurrency: 'XAF',
      availability: l.status === 'sold' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
      url: `${SITE_URL}${listingPath(l)}`,
      ...(l.condition ? { itemCondition: CONDITION_SCHEMA[l.condition] } : {}),
      seller: { '@type': 'Person', name: l.seller.displayName },
    };
  }
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${SITE_URL}${c.url}` })),
  };
  // Échappement de « < » : empêche un titre d'annonce malveillant de fermer la balise <script>
  return JSON.stringify([product, breadcrumb]).replace(/</g, '\\u003c');
}

export default async function ListingPage({ params }: { params: Params }) {
  const { slug } = await params;
  const l = await load(slug);
  if (!l) return notFound();

  // Titre modifié ou lien tronqué : redirection permanente vers l'URL officielle
  const canonical = listingPath(l);
  if (`/annonce/${slug}` !== canonical) permanentRedirect(canonical);

  const pays = l.countryCode.toLowerCase();
  const found = findCategory(await getCategories(), (c) => c.id === l.category.id);
  const crumbs = [
    { name: 'Accueil', url: '/' },
    ...(found?.parent ? [{ name: found.parent.name, url: `/${pays}/${found.parent.slug}` }] : []),
    ...(found ? [{ name: found.category.name, url: `/${pays}/${found.category.slug}` }] : []),
    { name: l.title, url: canonical },
  ];
  const sold = l.status === 'sold';
  // Annonces de la même catégorie, dans le même pays (sans celle-ci)
  const related = await getListings({ country: l.countryCode, categoryId: l.category.id, limit: 13 }).catch(() => null);
  const similar = (related?.items ?? []).filter((x) => x.id !== l.id).slice(0, 12);

  return (
    <div className="container listing-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(l, crumbs) }} />
      <nav className="breadcrumb" aria-label="Fil d'Ariane">
        <ol>
          {crumbs.slice(0, -1).map((c) => (
            <li key={c.url}><Link href={c.url}>{c.name}</Link></li>
          ))}
        </ol>
      </nav>

      <div className="listing-layout section">
        <article className="stack">
          {l.images.length ? (
            <Gallery images={l.images} title={l.title} />
          ) : (
            // Pas de photo (emploi, services) : un visuel de la catégorie plutôt qu'un vide
            <div className="gal-empty" aria-hidden>
              <CategoryIcon slug={l.category.parentSlug ?? ''} size={56} />
              <span>{l.category.name}</span>
            </div>
          )}
          <RememberListing card={{ id: l.id, adType: l.adType, title: l.title, priceType: l.priceType, priceXaf: l.priceXaf, priceUnit: l.priceUnit, condition: l.condition, categoryId: l.category.id, city: l.city, district: l.district, publishedAt: l.publishedAt, boosted: false, thumbnailUrl: l.images[0]?.thumbUrl ?? null }} />

          {/* Titre, prix et lieu : dans un cadre aux coins arrondis, comme les caractéristiques et la description */}
          <section className="info-box listing-head" aria-label="Annonce">
            {sold ? <span className="sold-badge">Vendu</span> : null}
            {l.adType === 'request' ? <span className="request-badge">Je recherche</span> : null}
            <h1 className="listing-title">{l.title}</h1>
            {l.priceLabel !== 'Prix' ? <p className="muted" style={{ margin: 0 }}>{l.priceLabel}</p> : null}
            <PriceTag priceType={l.priceType} priceXaf={l.priceXaf} unit={l.priceUnit} large />
            <p className="muted" style={{ margin: 0 }}>{placeLabel(l.city, l.district)}, {relativeTime(l.publishedAt)}</p>
            {l.handDelivery ? <p className="handover"><Ion icon={handRight} size={18} /> Remise en main propre</p> : null}
            {l.paymentMethods?.length ? (
              <div className="wallets-accepted">
                <span className="muted">Paiement électronique accepté</span>
                <WalletList codes={l.paymentMethods} />
              </div>
            ) : null}
          </section>

          {/* Caractéristiques et description : cadres de la maquette du porteur (bandeau, pastille, icônes) */}
          <DetailCard id="h-facts" icon={list} title="Caractéristiques" chip={<><CategoryIcon slug={l.category.parentSlug ?? ''} size={16} /> {l.category.name}</>}>
            <FactGrid
              facts={[
                { key: 'category', label: 'Catégorie', value: l.category.name },
                ...(l.condition ? [{ key: 'condition', label: 'État', value: CONDITION_LABELS[l.condition] ?? l.condition }] : []),
                ...l.facts,
              ]}
            />
          </DetailCard>

          <DetailCard id="h-desc" icon={pencil} title="Description">
            <p className="description">{l.description}</p>
          </DetailCard>

          <AdSlot slot={AD_SLOTS.listing} />
        </article>

        <aside className="listing-aside stack">
          <div className="panel stack" id="contact">
            <Link href={`/vendeur/${l.seller.id}`} className="seller">
              <span className="avatar" aria-hidden>{l.seller.displayName.slice(0, 1).toUpperCase()}</span>
              <span>
                <strong>{l.seller.displayName}</strong>
                <br />
                {l.seller.verificationLevel === 'identity' ? <span className="verified">✓ Identité vérifiée</span> : null}
                {l.seller.verificationLevel === 'identity' ? <br /> : null}
                <RatingSummary avg={l.seller.ratingAvg} count={l.seller.ratingCount} />
                <br />
                <span className="muted">{memberSince(l.seller.memberSince)}</span>
              </span>
            </Link>
            {!sold ? <ContactButtons listingId={l.id} title={l.title} returnTo={canonical} messagesOnly={l.seller.contactPreference === 'messages_only'} jobOffer={l.category.parentSlug === 'emploi' && l.adType === 'offer'} sellerId={l.seller.id} offerPrice={l.adType === 'offer' && l.category.parentSlug !== 'emploi' && l.priceType !== 'free' ? (l.priceType === 'fixed' || l.priceType === 'negotiable' ? l.priceXaf : null) : undefined} /> : <p className="muted">Cet article a été vendu.</p>}
            {/* Panier : offre d'un vendeur, jamais une offre d'emploi (même règle que l'API, qui refuse aussi sa propre annonce) */}
            {!sold && l.adType === 'offer' && l.category.parentSlug !== 'emploi' ? <CartButton listingId={l.id} /> : null}
            <FavoriteButton listingId={l.id} returnTo={canonical} />
          </div>
          <SafetyNotice parentSlug={l.category.parentSlug} />
          <p>
            <Link href={`/signaler?annonce=${l.id}`} className="pill-btn report-btn" rel="nofollow">Signaler cette annonce</Link>
          </p>
        </aside>
      </div>

      {similar.length ? (
        <section className="section stack" aria-labelledby="h-similar">
          <div className="section-head">
            <h2 id="h-similar">Annonces similaires</h2>
            {found ? <Link href={`/${pays}/${found.category.slug}`} className="see-all">Voir tout ›</Link> : null}
          </div>
          <ListingList items={similar} row />
        </section>
      ) : null}

      {/* Téléphone : l'action principale reste à portée de pouce */}
      {!sold ? (
        <div className="mobile-bar">
          <span className="bar-tag" aria-hidden><Ion icon={pricetag} size={22} /></span>
          <span className="bar-price">
            <strong>{priceLabel(l.priceType, l.priceXaf)}{(l.priceType === 'fixed' || l.priceType === 'negotiable') && l.priceUnit ? ` / ${l.priceUnit}` : ''}</strong>
            {l.priceType === 'negotiable' ? <span className="bar-note"><Ion icon={trendingDown} size={15} /> À débattre</span> : null}
          </span>
          <span className="bar-sep" aria-hidden />
          <a href="#contact" className="btn bar-btn"><Ion icon={chatbubbleEllipsesOutline} size={20} /> {l.category.parentSlug === 'emploi' && l.adType === 'offer' ? 'Postuler' : 'Contacter'}</a>
        </div>
      ) : null}
    </div>
  );
}
