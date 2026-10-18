'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { call, ClientError, useSignedIn } from '@/lib/client';

/** Premier message. Si une conversation existe déjà pour cette annonce, on l'ouvre directement. */
export function NewConversation({ listingId, title, message }: { listingId: string; title: string; message?: string }) {
  const signedIn = useSignedIn();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [body, setBody] = useState(message ?? `Bonjour, votre annonce « ${title} » est-elle toujours disponible ?`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = `/messages/nouveau?annonce=${listingId}&titre=${encodeURIComponent(title)}`;

  useEffect(() => {
    if (signedIn === false) router.replace(`/connexion?retour=${encodeURIComponent(back)}`);
    if (!signedIn || !/^[0-9a-f-]{36}$/i.test(listingId)) return;
    call<{ id: string }>(`/conversations/with-listing/${listingId}`)
      .then((c) => router.replace(`/messages/${c.id}`))
      .catch(() => setChecking(false));
  }, [signedIn, listingId, router, back]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ conversationId: string }>('/conversations', { method: 'POST', body: { listingId, body: body.trim() } });
      router.replace(`/messages/${r.conversationId}`);
    } catch (err) {
      setError(err instanceof ClientError ? err.message : 'Envoi impossible.');
    } finally {
      setBusy(false);
    }
  };

  if (!/^[0-9a-f-]{36}$/i.test(listingId)) return <div className="narrow"><p>Annonce introuvable. <Link href="/">Retour</Link></p></div>;
  if (checking) return <div className="narrow"><p className="muted">Chargement…</p></div>;

  return (
    <form className="narrow stack" onSubmit={submit}>
      <h1>Écrire au vendeur</h1>
      <p className="muted" style={{ margin: 0 }}>{title}</p>
      <div className="field">
        <label htmlFor="first">Votre message</label>
        <textarea id="first" value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} autoFocus />
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="btn" type="submit" disabled={busy || !body.trim()}>Envoyer</button>
      <p className="muted">Restez sur la messagerie jusqu’à la rencontre : vos échanges y sont protégés et vous pouvez signaler un comportement suspect.</p>
    </form>
  );
}
