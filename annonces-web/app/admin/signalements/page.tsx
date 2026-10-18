'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EMPTY_SANCTION, SanctionDraft, SanctionFields, sanctionIncomplete, sanctionPayload } from '@/components/admin/SanctionFields';
import { fmtDate, REPORT_REASONS, STATUS_LABELS } from '@/lib/admin';
import { call, ClientError } from '@/lib/client';

interface Report {
  id: string; reason: string; details: string | null; status: string; createdAt: string;
  listingId: string | null; listingTitle: string | null; listingStatus: string | null; listingOwnerId: string | null;
  reportedUserId: string | null; reportedUserName: string | null; reportedUserStatus: string | null; conversationId: string | null;
  reviewId: string | null; reviewRating: number | null; reviewComment: string | null; reviewStatus: string | null;
  openReportsOnTarget: number;
}

export default function ReportsPage() {
  const [status, setStatus] = useState<'open' | 'resolved' | 'dismissed'>('open');
  const [items, setItems] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    call<{ items: Report[] }>(`/admin/reports?status=${status}&limit=50`)
      .then((r) => { setItems(r.items); setError(null); })
      .catch((e) => setError(e instanceof ClientError ? e.message : 'Chargement impossible.'));
  }, [status]);
  useEffect(load, [load]);

  return (
    <div className="stack">
      <h1>Signalements</h1>
      <div className="chip-wrap">
        {(['open', 'resolved', 'dismissed'] as const).map((s) => (
          <button key={s} type="button" className="chip" aria-pressed={status === s} onClick={() => { setStatus(s); setItems(null); }}>
            {s === 'open' ? 'À traiter' : s === 'resolved' ? 'Fondés' : 'Classés sans suite'}
          </button>
        ))}
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {items?.length === 0 ? <p className="muted">Aucun signalement.</p> : null}
      <ul className="admin-list">
        {items?.map((r) => (
          <li key={r.id} className="panel stack">
            <div className="report-head">
              <span className={`badge ${r.reason === 'scam' ? 'badge-red' : 'badge-amber'}`}>{REPORT_REASONS[r.reason] ?? r.reason}</span>
              <span className="muted">{fmtDate(r.createdAt)}</span>
              {r.openReportsOnTarget > 1 ? <span className="badge badge-red">{r.openReportsOnTarget} signalements sur cette cible</span> : null}
            </div>
            {r.listingId ? (
              <p style={{ margin: 0 }}>
                Annonce : <Link href={`/admin/annonces/${r.listingId}`}>{r.listingTitle}</Link>{' '}
                <span className="muted">({STATUS_LABELS[r.listingStatus ?? ''] ?? r.listingStatus})</span>
                {r.listingOwnerId ? <>, <Link href={`/admin/utilisateurs/${r.listingOwnerId}`}>fiche du vendeur</Link></> : null}
              </p>
            ) : (
              <p style={{ margin: 0 }}>
                Utilisateur : <Link href={`/admin/utilisateurs/${r.reportedUserId}`}>{r.reportedUserName}</Link>{' '}
                <span className="muted">({STATUS_LABELS[r.reportedUserStatus ?? ''] ?? r.reportedUserStatus})</span>
              </p>
            )}
            {r.conversationId ? <p style={{ margin: 0 }}><Link href={`/admin/conversations/${r.conversationId}`} className="btn btn-secondary btn-sm">Lire la conversation signalée</Link></p> : null}
            {r.reviewId ? (
              <div className="stack" style={{ gap: 4 }}>
                <strong>Avis signalé : {r.reviewRating} / 5{r.reviewStatus === 'hidden' ? ' (masqué)' : ''}</strong>
                {r.reviewComment ? <blockquote className="quote">{r.reviewComment}</blockquote> : <span className="muted">Sans commentaire</span>}
                <span className="muted">Signalement fondé : l’avis est masqué et ne compte plus dans la note.</span>
              </div>
            ) : null}
            {r.details ? <blockquote className="quote">{r.details}</blockquote> : null}
            {status === 'open' ? (
              openId === r.id ? (
                <ResolveForm report={r} onDone={() => { setOpenId(null); load(); }} onCancel={() => setOpenId(null)} />
              ) : (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpenId(r.id)}>Traiter</button>
              )
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResolveForm({ report, onDone, onCancel }: { report: Report; onDone: () => void; onCancel: () => void }) {
  const [decision, setDecision] = useState<'uphold' | 'dismiss'>('uphold');
  const [removeListing, setRemoveListing] = useState(true);
  const [blockImages, setBlockImages] = useState(report.reason === 'scam' || report.reason === 'fake_photos');
  const [sanction, setSanction] = useState<SanctionDraft>(EMPTY_SANCTION);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await call(`/admin/reports/${report.id}/resolve`, {
        method: 'POST',
        body: decision === 'dismiss'
          ? { decision, note: note.trim() || undefined }
          : { decision, removeListing: !!report.listingId && removeListing, blockImages: !!report.listingId && blockImages, sanction: sanctionPayload(sanction), note: note.trim() || undefined },
      });
      onDone();
    } catch (e) {
      setError(e instanceof ClientError ? e.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack resolve">
      <div className="chip-wrap">
        <button type="button" className="chip" aria-pressed={decision === 'uphold'} onClick={() => setDecision('uphold')}>Signalement fondé</button>
        <button type="button" className="chip" aria-pressed={decision === 'dismiss'} onClick={() => setDecision('dismiss')}>Classer sans suite</button>
      </div>
      {decision === 'uphold' ? (
        <>
          {report.listingId ? (
            <>
              <label className="check"><input type="checkbox" checked={removeListing} onChange={(e) => setRemoveListing(e.target.checked)} /> Retirer l’annonce</label>
              <label className="check"><input type="checkbox" checked={blockImages} onChange={(e) => setBlockImages(e.target.checked)} /> Bloquer ses photos (refus automatique si elles réapparaissent)</label>
            </>
          ) : null}
          <SanctionFields value={sanction} onChange={setSanction} idPrefix={`s-${report.id}`} />
        </>
      ) : (
        <p className="muted" style={{ margin: 0 }}>Si l’annonce avait été suspendue par les signalements, elle sera remise en ligne.</p>
      )}
      <div className="field">
        <label htmlFor={`n-${report.id}`}>Note interne (facultatif)</label>
        <input id={`n-${report.id}`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="decision">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="button" className={`btn ${decision === 'uphold' ? 'btn-danger' : ''}`} disabled={busy || sanctionIncomplete(sanction)} onClick={() => void submit()}>
          Valider
        </button>
      </div>
      <p className="muted" style={{ margin: 0 }}>Tous les signalements ouverts sur la même cible seront traités en même temps.</p>
    </div>
  );
}
