'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { call, ClientError, useSignedIn } from '@/lib/client';
import { CANDIDATE_STATUS, CV_MAX_BYTES, CV_TYPES, MyApplication } from '@/lib/applications';

const MIN = 20;
const PUT_TIMEOUT_MS = 90_000;

/** Postuler à une offre d'emploi : un message de présentation et, si possible, un CV (PDF ou photo). */
export default function ApplyPage() {
  const { id } = useParams<{ id: string }>();
  const title = useSearchParams().get('titre');
  const signedIn = useSignedIn();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [existing, setExisting] = useState<MyApplication | null | undefined>(undefined);
  const [message, setMessage] = useState('');
  const [cv, setCv] = useState<File | null>(null);
  const [showError, setShowError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const here = `/postuler/${id}${title ? `?titre=${encodeURIComponent(title)}` : ''}`;
    if (signedIn === false) router.replace(`/connexion?retour=${encodeURIComponent(here)}`);
    if (signedIn) call<{ items: MyApplication[] }>(`/me/applications?listingId=${id}`).then((r) => setExisting(r.items[0] ?? null)).catch(() => setExisting(null));
  }, [signedIn, id, title, router]);

  const pick = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (!(CV_TYPES as readonly string[]).includes(f.type)) return setError('Format non accepté : PDF, JPEG ou PNG.');
    if (f.size > CV_MAX_BYTES) return setError('CV trop lourd (5 Mo maximum).');
    setCv(f);
  };

  // CV envoyé directement au stockage privé (il ne passe pas par l'API), 3 essais en cas de coupure
  const uploadCv = async (f: File): Promise<string> => {
    let last: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const u = await call<{ key: string; uploadUrl: string }>(`/listings/${id}/applications/cv-upload-url`, { method: 'POST', body: { contentType: f.type, sizeBytes: f.size } });
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PUT_TIMEOUT_MS);
      try {
        const res = await fetch(u.uploadUrl, { method: 'PUT', headers: { 'Content-Type': f.type }, body: f, signal: ctrl.signal });
        if (!res.ok) throw new Error(`Envoi refusé (${res.status})`);
        return u.key;
      } catch (e) {
        last = e;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      } finally {
        clearTimeout(timer);
      }
    }
    throw last instanceof Error ? last : new Error('Envoi impossible.');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setShowError(true);
    setError(null);
    if (message.trim().length < MIN) return;
    setBusy(true);
    try {
      const cvKey = cv ? await uploadCv(cv) : undefined;
      const res = await call<{ conversationId: string }>(`/listings/${id}/applications`, { method: 'POST', body: { message: message.trim(), cvKey } });
      router.push(`/messages/${res.conversationId}?candidature=1`);
    } catch (err) {
      setError(err instanceof ClientError ? err.message : 'Envoi impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  };

  if (!signedIn || existing === undefined) return <div className="narrow"><p className="muted">Chargement…</p></div>;
  if (existing) {
    return (
      <div className="narrow stack">
        <h1>Vous avez déjà postulé</h1>
        <p>Statut : <span className={`badge ${CANDIDATE_STATUS[existing.status].className}`}>{CANDIDATE_STATUS[existing.status].label}</span></p>
        <div className="chip-wrap">
          {existing.conversationId ? <Link className="btn" href={`/messages/${existing.conversationId}`}>Voir la conversation</Link> : null}
          <Link className="btn btn-secondary" href="/candidatures">Mes candidatures</Link>
        </div>
      </div>
    );
  }

  const tooShort = showError && message.trim().length < MIN;
  return (
    <div className="narrow">
      <form className="stack-lg" onSubmit={submit} noValidate>
        <div>
          <p className="muted" style={{ margin: 0 }}>Vous postulez à</p>
          <h1 className="listing-title">{title ?? 'cette offre'}</h1>
        </div>

        <div className="field">
          <label htmlFor="message"><h2>Votre message</h2></label>
          <textarea id="message" value={message} maxLength={2000} onChange={(e) => setMessage(e.target.value)} aria-invalid={tooShort}
            placeholder="Présentez-vous : votre expérience, vos disponibilités, pourquoi ce poste vous intéresse." style={{ minHeight: 180 }} />
          {tooShort ? <p className="error">Présentez-vous en quelques phrases (20 caractères au moins).</p> : null}
        </div>

        <section className="stack">
          <div>
            <h2>Votre CV</h2>
            <p className="muted" style={{ margin: 0 }}>Facultatif. PDF ou photo de votre CV, 5 Mo au plus. Seul le recruteur peut l’ouvrir.</p>
          </div>
          {cv ? (
            <div className="file-chip">
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cv.name}</span>
              <button type="button" className="link-button" onClick={() => setCv(null)}>Retirer</button>
            </div>
          ) : (
            <div>
              <button type="button" className="btn btn-secondary" onClick={() => fileInput.current?.click()}>Joindre mon CV</button>
              <input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
          )}
        </section>

        <div className="safety">
          <p style={{ margin: 0 }}>Un vrai recruteur ne demande jamais d’argent pour un emploi (frais de dossier, formation, tenue…). Dans ce cas, signalez l’annonce.</p>
        </div>

        {error ? <p className="error" role="alert">{error}</p> : null}
        <div className="submit-row">
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Envoi…' : 'Envoyer ma candidature'}</button>
          <span className="muted">Le recruteur reçoit votre message dans sa messagerie.</span>
        </div>
      </form>
    </div>
  );
}
