/* eslint-disable @next/next/no-img-element -- photos déjà redimensionnées en WebP par l'API et servies par le CDN */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { flame, heartOutline, locationOutline } from 'ionicons/icons';
import { Ion } from './Ion';
import { listingPath, placeLabel, priceLabel, relativeTime } from '@/lib/format';
import type { ListingCard as Card } from '@/lib/types';
import { CardHeart } from './CardHeart';
import { ImageIcon } from './icons';

/**
 * Carte « Vitrine » (choix du porteur, 1er novembre 2026) : carte blanche en relief, photo carrée, prix dans un
 * ovale bleu à cheval sur la photo. Dans l'ovale, le montant seul ; l'unité et « À débattre » dessous, pour ne
 * jamais le couper. Sans photo (emploi, services) : un fond bleu pâle avec une icône, jamais une case vide.
 */
export function ListingCard({ item, eager, preview }: { item: Card; eager?: boolean; preview?: boolean }) {
  const badge = [item.boosted ? 'À la une' : null, item.adType === 'request' ? 'Je recherche' : null].filter(Boolean).join(' · ');
  const amount = (item.priceType === 'fixed' || item.priceType === 'negotiable') && item.priceXaf !== null;
  const note = [amount && item.priceUnit ? `/ ${item.priceUnit}` : null, item.priceType === 'negotiable' ? 'À débattre' : null].filter(Boolean).join(' · ');
  return (
    // Le cœur est un bouton à part : un bouton ne peut pas être placé dans un lien
    <div className="tile">
      <Wrapper href={listingPath(item)} preview={preview}>
        <span className="tile-media">
          {item.thumbnailUrl ? (
            <img src={item.thumbnailUrl} alt="" width={400} height={400} loading={eager ? 'eager' : 'lazy'} decoding="async" />
          ) : (
            <span className="tile-no-photo" aria-hidden><ImageIcon size={32} /></span>
          )}
          {badge ? <span className="tile-badge">{item.boosted ? <Ion icon={flame} size={13} /> : null}{badge}</span> : null}
          <span className="tile-price">{priceLabel(item.priceType, item.priceXaf)}</span>
        </span>
        <span className="tile-body">
          <span className="tile-title">{item.title}</span>
          {note ? <span className="tile-note">{note}</span> : null}
          <span className="tile-meta muted">
            <Ion icon={locationOutline} size={14} className="meta-ion" />
            <span className="tile-place">{placeLabel(item.city, item.district)} · {relativeTime(item.publishedAt)}</span>
          </span>
        </span>
      </Wrapper>
      {preview ? <span className="card-heart preview-only" aria-hidden><Ion icon={heartOutline} size={20} /></span> : <CardHeart listingId={item.id} title={item.title} />}
    </div>
  );
}

/** Aperçu à la publication : même carte, mais ni lien ni bouton (l'annonce n'existe pas encore). */
function Wrapper({ href, preview, children }: { href: string; preview?: boolean; children: ReactNode }) {
  if (preview) return <span className="tile-link">{children}</span>;
  return <Link href={href} className="tile-link" prefetch={false}>{children}</Link>;
}
