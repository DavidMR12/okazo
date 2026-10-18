'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { EMPTY_SANCTION, SanctionDraft, SanctionFields, sanctionIncomplete, sanctionPayload } from '@/components/admin/SanctionFields';
import { fmtDate, STATUS_LABELS, useAdminMe } from '@/lib/admin';
import { call, ClientError } from '@/lib/client';

interface Summary {
  user: { id: string; phone: string | null; displayName: string; countryCode: string; role: string; status: string; verificationLevel: string; trustScore: number; createdAt: string; lastLoginAt: string | null };
  listings: Record<string, number>;
  reportsReceived: Record<string, number>;
  sanctions: { id: string; type: string; reason: string; startsAt: string; endsAt: string | null; revokedAt: string | null; createdAt: string }[];
  accountsSharingDevices: { id: string; displayName: string; status: string; createdAt: string }[];
}

const SANCTION_LABELS: Record<string, string> = { warning: 'Avertissement', suspension: 'Suspension', ban: 'Bannissement' };
const counts = (r: Record<string, number>) =>
  Object.entries(r).map(([k, n]) => `${STATUS_LABELS[k] ?? k} : ${n}`).join(', ') || 'aucun';

export default function UserPage() {
  const { id } = useParams<{ id: string }>();
  const me = useAdminMe();
  const [s, setS] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sanction, setSanction] = useState<SanctionDraft>(EMPTY_SANCTION);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    call<Summary>(`/admin/users/${id}`).then(setS).catch((e) => setError(e instanceof ClientError ? e.message : 'Chargement impossible.'));
  }, [id]);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage(done);
      setSanction(EMPTY_SANCTION);
      load();
    } catch (e) {
      setMessage(e instanceof ClientError ? e.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="error">{error}</p>;
  if (!s) return <p className="muted">Chargement…</p>;
  const u = s.user;
  const active = (x: Summary['sanctions'][number]) => !x.revokedAt && (!x.endsAt || new Date(x.endsAt) > new Date()) && x.type !== 'warning';

  return (
    <div className="stack">
      <p><Link href="/admin/utilisateurs">← Recherche</Link></p>
      <h1>{u.displayName}</h1>
      <dl className="facts">
        <dt>Téléphone</dt><dd>{u.phone ?? 'Compte supprimé'}</dd>
        <dt>Statut</dt><dd>{STATUS_LABELS[u.status] ?? u.status}{u.role !== 'user' ? `, ${u.role === 'admin' ? 'admin' : 'modérateur'}` : ''}</dd>
        <dt>Identité</dt><dd>{u.verificationLevel === 'identity' ? 'Vérifiée' : 'Non vérifiée'}</dd>
        <dt>Confiance</dt><dd>{u.trustScore}</dd>
        <dt>Inscription</dt><dd>{fmtDate(u.createdAt)}</dd>
        <dt>Dernière connexion</dt><dd>{fmtDate(u.lastLoginAt) || 'jamais'}</dd>
        <dt>Annonces</dt><dd>{counts(s.listings)}</dd>
        <dt>Signalements reçus</dt><dd>{counts(s.reportsReceived)}</dd>
      </dl>

      {s.accountsSharingDevices.length ? (
        <section className="panel stack panel-alert">
          <h2>Comptes sur le même appareil</h2>
          <p className="muted" style={{ margin: 0 }}>Peut signaler un fraudeur qui recrée des comptes. Peut aussi être une famille qui partage un téléphone.</p>
          <ul className="plain-list">
            {s.accountsSharingDevices.map((a) => (
              <li key={a.id}><Link href={`/admin/utilisateurs/${a.id}`}>{a.displayName}</Link> <span className="muted">({STATUS_LABELS[a.status] ?? a.status}, inscrit le {fmtDate(a.createdAt)})</span></li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="stack">
        <h2>Sanctions</h2>
        {s.sanctions.length ? (
          <ul className="history">
            {s.sanctions.map((x) => (
              <li key={x.id}>
                <strong>{SANCTION_LABELS[x.type] ?? x.type}</strong> <span className="muted">le {fmtDate(x.createdAt)}{x.endsAt ? `, jusqu'au ${fmtDate(x.endsAt)}` : ''}{x.revokedAt ? `, levée le ${fmtDate(x.revokedAt)}` : ''}</span>
                <p className="muted" style={{ margin: '2px 0' }}>{x.reason}</p>
                {active(x) && (x.type !== 'ban' || me?.role === 'admin') ? (
                  <button type="button" className="link-button" disabled={busy}
                    onClick={() => window.confirm('Lever cette sanction ?') && void run(() => call(`/admin/sanctions/${x.id}/revoke`, { method: 'POST' }), 'Sanction levée.')}>
                    Lever la sanction
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : <p className="muted">Aucune sanction.</p>}
      </section>

      {u.status !== 'banned' && u.status !== 'deleted' && u.id !== me?.id ? (
        <section className="panel stack" style={{ maxWidth: 520 }}>
          <h2>Sanctionner</h2>
          <SanctionFields value={sanction} onChange={setSanction} idPrefix="user" />
          <button type="button" className="btn btn-danger" disabled={busy || !sanction.type || sanctionIncomplete(sanction)}
            onClick={() => {
              const p = sanctionPayload(sanction);
              if (p && window.confirm(`Confirmer : ${SANCTION_LABELS[p.type]} pour ${u.displayName} ?`)) {
                void run(() => call('/admin/sanctions', { method: 'POST', body: { userId: u.id, ...p } }), 'Sanction appliquée.');
              }
            }}>
            Appliquer
          </button>
        </section>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
