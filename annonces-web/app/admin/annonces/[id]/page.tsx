'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { RuleBadges } from '@/components/admin/RuleBadges';
import { ACTION_LABELS, asHits, fmtDate, LISTING_REJECT_REASONS, STATUS_LABELS } from '@/lib/admin';
import { call, ClientError } from '@/lib/client';
import { CONDITION_LABELS, priceLabel } from '@/lib/format';
import type { Category, PriceType } from '@/lib/types';

interface Detail {
  listing: {
    id: string; title: string; description: string; status: string; priceType: PriceType; priceXaf: number | null;
    condition: string | null; categoryId: number; countryCode: string; createdAt: string; rejectionReason: string | null;
  };
  seller: { id: string; phone: string | null; displayName: string; status: string; verificationLevel: string; trustScore: number; memberSince: string };
  images: { position: number; processed: boolean; url: string | null }[];
  history: { id: number; action: string; reasonCode: string | null; note: string | null; ruleHits: unknown; moderatorId: string | null; createdAt: string }[];
}

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reasonCode, setReasonCode] = useState(LISTING_REJECT_REASONS[0].code);
  const [message, setMessage] = useState(LISTING_REJECT_REASONS[0].message);
  const [note, setNote] = useState('');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement ou réinitialisation voulus à l’affichage
    setD(null);
    setRejecting(false);
    setNote('');
    call<Detail>(`/admin/listings/${id}`).then(setD).catch((e) => setError(e instanceof ClientError ? e.message : 'Chargement impossible.'));
    call<{ categories: Category[] }>('/categories').then((r) => setCategories(r.categories)).catch(() => undefined);
  }, [id]);

  const categoryName = useMemo(() => {
    for (const c of categories) {
      if (c.id === d?.listing.categoryId) return c.name;
      const child = c.children?.find((x) => x.id === d?.listing.categoryId);
      if (child) return `${c.name} › ${child.name}`;
    }
    return '';
  }, [categories, d]);

  /** Après une décision, ouvre directement l'annonce suivante de la file. */
  const next = async () => {
    const q = await call<{ items: { listingId: string }[] }>('/admin/moderation/queue?limit=2').catch(() => ({ items: [] }));
    const following = q.items.find((x) => x.listingId !== id);
    router.replace(following ? `/admin/annonces/${following.listingId}` : '/admin');
  };

  const decide = async (kind: 'approve' | 'reject') => {
    setBusy(true);
    setError(null);
    try {
      if (kind === 'approve') await call(`/admin/listings/${id}/approve`, { method: 'POST', body: { note: note.trim() || undefined } });
      else await call(`/admin/listings/${id}/reject`, { method: 'POST', body: { reasonCode, message: message.trim(), note: note.trim() || undefined } });
      await next();
    } catch (e) {
      setError(e instanceof ClientError ? e.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  };

  if (error && !d) return <p className="error">{error} <Link href="/admin">Retour à la file</Link></p>;
  if (!d) return <p className="muted">Chargement…</p>;

  const l = d.listing;
  const latestHits = asHits(d.history.find((h) => asHits(h.ruleHits).length)?.ruleHits);
  const pending = l.status === 'pending_review';
  const imagesReady = d.images.every((i) => i.processed);

  return (
    <div className="review">
      <div className="stack">
        <p><Link href="/admin">← File d’attente</Link></p>
        <div className="gallery">
          {d.images.map((img) =>
            img.url ? <img key={img.position} src={img.url} alt={`Photo ${img.position + 1}`} /> : <div key={img.position} className="admin-thumb-empty gallery-empty">Photo en traitement</div>,
          )}
        </div>
        <h1>{l.title}</h1>
        <p><strong>{priceLabel(l.priceType, l.priceXaf)}</strong>{l.priceType === 'negotiable' ? ' (à débattre)' : ''}</p>
        <dl className="facts">
          <dt>Catégorie</dt><dd>{categoryName || l.categoryId}</dd>
          {l.condition ? (<><dt>État</dt><dd>{CONDITION_LABELS[l.condition] ?? l.condition}</dd></>) : null}
          <dt>Statut</dt><dd>{STATUS_LABELS[l.status] ?? l.status}</dd>
          <dt>Déposée</dt><dd>{fmtDate(l.createdAt)}</dd>
        </dl>
        <h2>Description</h2>
        <p className="description">{l.description}</p>

        <h2>Historique</h2>
        <ul className="history">
          {d.history.map((h) => (
            <li key={h.id}>
              <strong>{ACTION_LABELS[h.action] ?? h.action}</strong> <span className="muted">{fmtDate(h.createdAt)}{h.moderatorId ? '' : ', automatique'}</span>
              {h.reasonCode ? <span className="muted"> ({h.reasonCode})</span> : null}
              {h.note ? <p className="muted" style={{ margin: '2px 0 0' }}>Note : {h.note}</p> : null}
              {asHits(h.ruleHits).length ? <div><RuleBadges hits={asHits(h.ruleHits)} /></div> : null}
            </li>
          ))}
        </ul>
      </div>

      <aside className="stack review-aside">
        <div className="panel stack">
          <h2>Pourquoi en revue</h2>
          <RuleBadges hits={latestHits} />
        </div>

        <div className="panel stack">
          <h2>Vendeur</h2>
          <p style={{ margin: 0 }}>
            <strong>{d.seller.displayName}</strong><br />
            <span className="muted">{d.seller.phone ?? 'Compte supprimé'}</span><br />
            <span className="muted">
              Confiance {d.seller.trustScore}, {d.seller.verificationLevel === 'identity' ? 'identité vérifiée' : 'identité non vérifiée'}, {STATUS_LABELS[d.seller.status] ?? d.seller.status}
            </span><br />
            <span className="muted">Inscrit le {fmtDate(d.seller.memberSince)}</span>
          </p>
          <Link href={`/admin/utilisateurs/${d.seller.id}`} className="btn btn-secondary btn-sm">Fiche du vendeur</Link>
        </div>

        {pending ? (
          <div className="panel stack">
            <h2>Décision</h2>
            <div className="field">
              <label htmlFor="note">Note interne (facultatif)</label>
              <input id="note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
            </div>
            {!imagesReady ? <p className="muted">Photos en cours de traitement : l’approbation sera possible dans quelques secondes.</p> : null}
            {!rejecting ? (
              <div className="decision">
                <button type="button" className="btn btn-approve" disabled={busy || !imagesReady} onClick={() => void decide('approve')}>Approuver</button>
                <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setRejecting(true)}>Refuser…</button>
              </div>
            ) : (
              <div className="stack">
                <div className="field">
                  <label htmlFor="reason">Motif</label>
                  <select id="reason" value={reasonCode} onChange={(e) => {
                    const r = LISTING_REJECT_REASONS.find((x) => x.code === e.target.value)!;
                    setReasonCode(r.code);
                    setMessage(r.message);
                  }}>
                    {LISTING_REJECT_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="msg">Message au vendeur</label>
                  <textarea id="msg" value={message} maxLength={300} onChange={(e) => setMessage(e.target.value)} />
                </div>
                <div className="decision">
                  <button type="button" className="btn btn-secondary" onClick={() => setRejecting(false)}>Annuler</button>
                  <button type="button" className="btn btn-danger" disabled={busy || message.trim().length < 5} onClick={() => void decide('reject')}>Confirmer le refus</button>
                </div>
              </div>
            )}
            {error ? <p className="error" role="alert">{error}</p> : null}
            <p className="muted" style={{ margin: 0 }}>L’annonce suivante s’ouvre automatiquement après votre décision.</p>
          </div>
        ) : (
          <div className="panel"><p style={{ margin: 0 }}>Cette annonce n’est plus en attente ({STATUS_LABELS[l.status] ?? l.status}).</p></div>
        )}
      </aside>
    </div>
  );
}
