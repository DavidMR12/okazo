import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ListingList } from '@/components/ListingList';
import { ReportReviewButton } from '@/components/ReportReviewButton';
import { RatingSummary, Stars } from '@/components/Stars';
import { getListings, getSeller, getSellerReviews } from '@/lib/api';
import { memberSince, relativeTime, reviewRoleLabel } from '@/lib/format';

export const revalidate = 120;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Params = Promise<{ id: string }>;
const UUID = /^[0-9a-f-]{36}$/i;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const s = UUID.test(id) ? await getSeller(id) : null;
  if (!s) return { title: 'Vendeur introuvable', robots: { index: false } };
  return { title: `Annonces de ${s.displayName}`, robots: { index: false, follow: true } };
}

export default async function SellerPage({ params }: { params: Params }) {
  const { id } = await params;
  if (!UUID.test(id)) return notFound();
  const [seller, page, reviews] = await Promise.all([getSeller(id), getListings({ sellerId: id, limit: 30 }).catch(() => null), getSellerReviews(id).catch(() => null)]);
  if (!seller) return notFound();

  return (
    <div className="container">
      <section className="section stack">
        <h1>{seller.displayName}</h1>
        {seller.verificationLevel === 'identity' ? <span className="verified">✓ Identité vérifiée</span> : <span className="muted">Identité non vérifiée</span>}
        <p className="muted">
          {memberSince(seller.memberSince)}
          {seller.city ? `, ${seller.city}` : ''}. {seller.activeListings} annonce{seller.activeListings > 1 ? 's' : ''} en ligne,{' '}
          {seller.soldListings} vendue{seller.soldListings > 1 ? 's' : ''}.
        </p>
        <RatingSummary avg={seller.ratingAvg} count={seller.ratingCount} href={seller.ratingCount ? '#avis' : undefined} />
        <p><Link href={`/signaler?vendeur=${seller.id}`} className="muted" rel="nofollow">Signaler ce vendeur</Link></p>
      </section>
      {reviews?.items.length ? (
        <section id="avis" className="info-box reviews-box" aria-labelledby="h-avis">
          <h2 id="h-avis">Avis reçus ({reviews.summary.count})</h2>
          <div className="rating-bars">
            {[5, 4, 3, 2, 1].map((n) => {
              const c = reviews.summary.distribution?.[String(n)] ?? 0;
              return (
                <div key={n} className="rating-bar" aria-label={`${n} étoiles : ${c} avis`}>
                  <span>{n} ★</span>
                  <span className="track"><span style={{ width: `${(c / Math.max(1, reviews.summary.count)) * 100}%` }} /></span>
                  <span>{c}</span>
                </div>
              );
            })}
          </div>
          <ul className="review-list">
            {reviews.items.map((r) => (
              <li key={r.id}>
                <div className="review-head"><Stars value={r.rating} /><span className="muted">{relativeTime(r.createdAt)}</span></div>
                <p className="muted small" style={{ margin: 0 }}>{r.authorName} · {reviewRoleLabel(r.authorRole, r.listingParentSlug)} · {r.listingTitle}</p>
                {r.comment ? <p style={{ margin: 0 }}>{r.comment}</p> : null}
                <ReportReviewButton reviewId={r.id} returnTo={`/vendeur/${seller.id}#avis`} />
              </li>
            ))}
          </ul>
          {reviews.summary.count > reviews.items.length ? <p className="muted" style={{ margin: 0 }}>Les {reviews.items.length} avis les plus récents sont affichés.</p> : null}
        </section>
      ) : null}
      <h2 className="section-title">Annonces</h2>
      {page?.items.length ? <ListingList items={page.items} /> : <p className="muted">Aucune annonce en ligne.</p>}
    </div>
  );
}
