'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { DOC_KINDS, fmtDate, IDENTITY_REJECT_REASONS } from '@/lib/admin';
import { call, ClientError } from '@/lib/client';

interface Pending {
  userId: string; displayName: string; phone: string; countryCode: string; memberSince: string; submittedAt: string;
  document: { kind: string; url: string } | null;
  selfie: { url: string } | null;
}

export default function IdentitiesPage() {
  const [items, setItems] = useState<Pending[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Les liens vers les photos expirent après 5 minutes : rechargement automatique toutes les 4 minutes
  const load = useCallback(() => {
    call<{ items: Pending[] }>('/admin/verifications?limit=20')
      .then((r) => { setItems(r.items); setError(null); })
      .catch((e) => setError(e instanceof ClientError ? e.message : 'Chargement impossible.'));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 4 * 60_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="stack">
      <h1>Vérifications d’identité {items ? <span className="count">{items.length}</span> : null}</h1>
      <div className="panel">
        <strong>À contrôler</strong>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          Le visage du selfie correspond à la photo de la pièce. La pièce est lisible, entière et non expirée. Ce n’est pas une capture ni une photo d’écran. En cas de doute, refusez avec un motif clair : la personne peut recommencer.
        </p>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {items?.length === 0 ? <p className="success">Aucune demande en attente.</p> : null}
      {items?.map((p) => <IdentityCard key={p.userId} p={p} onDone={load} />)}
    </div>
  );
}

function IdentityCard({ p, onDone }: { p: Pending; onDone: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(IDENTITY_REJECT_REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const review = async (decision: 'approve' | 'reject') => {
    setBusy(true);
    setError(null);
    try {
      await call(`/admin/verifications/${p.userId}/review`, { method: 'POST', body: decision === 'approve' ? { decision } : { decision, rejectionReason: reason.trim() } });
      onDone();
    } catch (e) {
      setError(e instanceof ClientError ? e.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="panel stack">
      <div className="report-head">
        <strong><Link href={`/admin/utilisateurs/${p.userId}`}>{p.displayName}</Link></strong>
        <span className="muted">{p.phone}, inscrit le {fmtDate(p.memberSince)}, demande du {fmtDate(p.submittedAt)}</span>
      </div>
      <div className="id-photos">
        <figure>
          {p.document ? <a href={p.document.url} target="_blank" rel="noreferrer"><img src={p.document.url} alt="Pièce d'identité" /></a> : <span className="admin-thumb-empty">Manquante</span>}
          <figcaption className="muted">{p.document ? DOC_KINDS[p.document.kind] ?? p.document.kind : 'Pièce'}</figcaption>
        </figure>
        <figure>
          {p.selfie ? <a href={p.selfie.url} target="_blank" rel="noreferrer"><img src={p.selfie.url} alt="Selfie avec la pièce" /></a> : <span className="admin-thumb-empty">Manquant</span>}
          <figcaption className="muted">Selfie avec la pièce</figcaption>
        </figure>
      </div>
      {!rejecting ? (
        <div className="decision">
          <button type="button" className="btn btn-approve" disabled={busy || !p.document || !p.selfie} onClick={() => void review('approve')}>Valider l’identité</button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setRejecting(true)}>Refuser…</button>
        </div>
      ) : (
        <div className="stack">
          <div className="field">
            <label htmlFor={`r-${p.userId}`}>Motif (montré à la personne)</label>
            <select id={`r-${p.userId}`} value={IDENTITY_REJECT_REASONS.includes(reason) ? reason : ''} onChange={(e) => setReason(e.target.value)}>
              {IDENTITY_REJECT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              <option value="">Autre motif…</option>
            </select>
            {!IDENTITY_REJECT_REASONS.includes(reason) ? <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Motif" /> : null}
          </div>
          <div className="decision">
            <button type="button" className="btn btn-secondary" onClick={() => setRejecting(false)}>Annuler</button>
            <button type="button" className="btn btn-danger" disabled={busy || reason.trim().length < 5} onClick={() => void review('reject')}>Confirmer le refus</button>
          </div>
        </div>
      )}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </article>
  );
}
