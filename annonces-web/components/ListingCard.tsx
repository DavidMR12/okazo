/* eslint-disable @next/next/no-img-element -- photos déjà redimensionnées en WebP par l'API et servies par le CDN */
import Link from 'next/link';
import { calendarOutline, flame, locationOutline } from 'ionicons/icons';
import { Ion } from './Ion';
import { listingPath, placeLabel, relativeTime } from '@/lib/format';
import type { ListingCard as Card } from '@/lib/types';
import { CardHeart } from './CardHeart';
import { ImageIcon } from './icons';
import { PriceTag } from './PriceTag';

/**
 * Carte d'annonce façon LeBonCoin : grande photo carrée en haut (cœur en surimpression), puis titre, prix,
 * lieu et date. Sans photo (emploi, services) : un fond bleu pâle avec une icône, jamais une case vide.
 */
export function ListingCard({ item, eager }: { item: Card; eager?: boolean }) {
  const badge = [item.boosted ? 'À la une' : null, item.adType === 'request' ? 'Je recherche' : null].filter(Boolean).join(' · ');
  return (
    // Le cœur est un bouton à part : un bouton ne peut pas être placé dans un lien
    <div className="tile">
      <Link href={listingPath(item)} className="tile-link" prefetch={false}>
        <span className="tile-media">
          {item.thumbnailUrl ? (
            <img src={item.thumbnailUrl} alt="" width={400} height={400} loading={eager ? 'eager' : 'lazy'} decoding="async" />
          ) : (
            <span className="tile-no-photo" aria-hidden><ImageIcon size={32} /></span>
          )}
          {badge ? <span className="tile-badge">{item.boosted ? <Ion icon={flame} size={13} /> : null}{badge}</span> : null}
        </span>
        <span className="tile-body">
          <span className="tile-title">{item.title}</span>
          <PriceTag priceType={item.priceType} priceXaf={item.priceXaf} unit={item.priceUnit} />
          <span className="tile-meta muted">
            <Ion icon={locationOutline} size={14} className="meta-ion" />
            <span className="tile-place">{placeLabel(item.city, item.district)}</span>
            <span className="tile-date"><Ion icon={calendarOutline} size={13} className="meta-ion" />{relativeTime(item.publishedAt)}</span>
          </span>
        </span>
      </Link>
      <CardHeart listingId={item.id} title={item.title} />
    </div>
  );
}
