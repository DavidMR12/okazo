'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { call, ClientError } from '@/lib/client';

export default function UserSearchPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('+237');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const clean = phone.replace(/[\s.-]/g, '');
      const u = await call<{ id: string }>(`/admin/users?phone=${encodeURIComponent(clean)}`);
      router.push(`/admin/utilisateurs/${u.id}`);
    } catch (err) {
      setError(err instanceof ClientError ? err.message : 'Recherche impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" style={{ maxWidth: 480 }} onSubmit={search}>
      <h1>Utilisateurs</h1>
      <div className="field">
        <label htmlFor="phone">Numéro de téléphone</label>
        <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+237677123456" />
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="btn" type="submit" disabled={busy || phone.replace(/\D/g, '').length < 8}>Rechercher</button>
      <p className="muted">Depuis une annonce ou un signalement, le lien « vendeur » ouvre directement la fiche.</p>
    </form>
  );
}
