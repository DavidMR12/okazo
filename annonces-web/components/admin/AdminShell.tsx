'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { AdminContext, AdminMe } from '@/lib/admin';
import { call, ClientError, useSignedIn } from '@/lib/client';

const NAV = [
  { href: '/admin', label: 'Annonces à vérifier' },
  { href: '/admin/signalements', label: 'Signalements' },
  { href: '/admin/identites', label: 'Identités' },
  { href: '/admin/utilisateurs', label: 'Utilisateurs' },
];

/**
 * Espace réservé aux modérateurs. Ce contrôle sert seulement à l'affichage :
 * c'est l'API qui refuse toute action à un compte sans le rôle modérateur ou admin.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const signedIn = useSignedIn();
  const pathname = usePathname();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');

  useEffect(() => {
    if (!signedIn) return;
    call<AdminMe>('/auth/me')
      .then((m) => {
        setMe(m);
        setState(m.role === 'moderator' || m.role === 'admin' ? 'ok' : 'forbidden');
      })
      .catch((e) => setState(e instanceof ClientError && e.status === 401 ? 'forbidden' : 'error'));
  }, [signedIn]);

  if (signedIn === false) {
    return (
      <div className="narrow stack">
        <h1>Modération</h1>
        <Link className="btn" href="/connexion?retour=/admin">Se connecter</Link>
      </div>
    );
  }
  if (state === 'loading' || signedIn === null) return <div className="narrow"><p className="muted">Chargement…</p></div>;
  if (state === 'forbidden') return <div className="narrow"><h1>Accès réservé</h1><p>Cet espace est réservé à l’équipe de modération.</p></div>;
  if (state === 'error') return <div className="narrow"><p className="error">Impossible de vérifier vos droits. Rechargez la page.</p></div>;

  const active = (href: string) => (href === '/admin' ? pathname === '/admin' || pathname.startsWith('/admin/annonces') : pathname.startsWith(href));

  return (
    <AdminContext.Provider value={me}>
      <div className="admin">
        <nav className="admin-nav container" aria-label="Modération">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="admin-tab" aria-current={active(n.href) ? 'page' : undefined} prefetch={false}>
              {n.label}
            </Link>
          ))}
          <span className="admin-who muted">{me?.displayName}, {me?.role === 'admin' ? 'admin' : 'modérateur'}</span>
        </nav>
        <div className="container section">{children}</div>
      </div>
    </AdminContext.Provider>
  );
}
