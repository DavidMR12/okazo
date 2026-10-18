'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fmtDate, STATUS_LABELS } from '@/lib/admin';
import { call, ClientError } from '@/lib/client';
import { MESSAGE_WARNINGS } from '@/lib/messageWarnings';
import type { MessageFlag } from '@/lib/types';

interface Party { id: string; displayName: string; phone: string | null; status: string; trustScore: number }
interface Data {
  id: string;
  listing: { id: string; title: string; status: string } | null;
  buyer: Party | null;
  seller: Party | null;
  messages: { id: number; senderId: string; body: string; flags: MessageFlag[]; createdAt: string }[];
}

/** Lecture seule, et seulement pour une conversation signalée (l'API refuse les autres). */
export default function ReportedConversationPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    call<Data>(`/admin/conversations/${id}`).then(setD).catch((e) => setError(e instanceof ClientError ? e.message : 'Chargement impossible.'));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!d) return <p className="muted">Chargement…</p>;

  const party = (p: Party | null, label: string) =>
    p ? (
      <span>
        {label} : <Link href={`/admin/utilisateurs/${p.id}`}>{p.displayName}</Link>{' '}
        <span className="muted">({p.phone ?? 'supprimé'}, confiance {p.trustScore}, {STATUS_LABELS[p.status] ?? p.status})</span>
      </span>
    ) : <span>{label} : compte supprimé</span>;

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <p><Link href="/admin/signalements">← Signalements</Link></p>
      <h1>Conversation signalée</h1>
      <div className="panel stack">
        {d.listing ? <span>Annonce : <Link href={`/admin/annonces/${d.listing.id}`}>{d.listing.title}</Link> <span className="muted">({STATUS_LABELS[d.listing.status] ?? d.listing.status})</span></span> : null}
        {party(d.buyer, 'Acheteur')}
        {party(d.seller, 'Vendeur')}
      </div>
      <div className="stack">
        {d.messages.map((m) => {
          const fromSeller = m.senderId === d.seller?.id;
          return (
            <div key={m.id} className={`admin-msg ${fromSeller ? 'from-seller' : 'from-buyer'}`}>
              <span className="muted">{fromSeller ? 'Vendeur' : 'Acheteur'}, {fmtDate(m.createdAt)}</span>
              <p className="description" style={{ margin: '2px 0' }}>{m.body}</p>
              {m.flags.length ? <span className="badges">{m.flags.map((f) => <span key={f} className="badge badge-amber" title={MESSAGE_WARNINGS[f]}>{f === 'advance_payment' ? 'Paiement à l’avance' : f === 'money_transfer' ? 'Transfert d’argent' : f === 'link' ? 'Lien' : 'Demande de code'}</span>)}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
