'use client';

import { addCircle, cart, chatbubbles, heart, person } from 'ionicons/icons';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCartIds } from '@/lib/cart';
import { call, useSignedIn } from '@/lib/client';
import { Ion } from './Ion';

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Partie « compte » de l'en-tête, côté navigateur : les pages restent en cache (rien de personnel côté serveur). */
export function HeaderAccount() {
  const signedIn = useSignedIn();
  const [unread, setUnread] = useState(0);
  const cartCount = useCartIds().size;
  // Hors connexion, Favoris et Messages mènent à la connexion, puis reviennent à la page demandée
  const gated = (path: string) => (signedIn ? path : `/connexion?retour=${encodeURIComponent(path)}`);

  // Pastille des messages non lus : une requête légère par minute, onglet visible uniquement
  useEffect(() => {
    if (!signedIn) return;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      call<{ count: number }>('/conversations/unread-count').then((r) => setUnread(r.count)).catch(() => undefined);
    };
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [signedIn]);

  return (
    <>
      {/* Icônes pleines bleues sur pastille bleu pâle, comme dans l'application : favoris, messages, panier, compte */}
      <Link href={gated('/favoris')} prefetch={false} className="nav-icon" aria-label="Mes favoris" title="Mes favoris">
        <Ion icon={heart} size={22} />
      </Link>
      <Link href={gated('/messages')} prefetch={false} className="nav-icon" aria-label={unread ? `Messages, ${plural(unread, 'non lu')}` : 'Messages'} title="Messages">
        <Ion icon={chatbubbles} size={22} />
        {unread ? <span className="nav-badge" aria-hidden>{unread}</span> : null}
      </Link>
      <Link href="/panier" prefetch={false} className="nav-icon" aria-label={cartCount ? `Panier, ${plural(cartCount, 'article')}` : 'Panier'} title="Panier">
        <Ion icon={cart} size={22} />
        {cartCount ? <span className="nav-badge nav-badge-cart" aria-hidden>{cartCount}</span> : null}
      </Link>
      <Link href={signedIn ? '/compte' : '/connexion'} prefetch={false} className="nav-icon" aria-label={signedIn ? 'Mon compte' : 'Se connecter'} title={signedIn ? 'Mon compte' : 'Se connecter'}>
        <Ion icon={person} size={22} />
      </Link>
      {/* Sur téléphone, seul le « + » reste visible : l'en-tête tient sur une ligne */}
      <Link href="/publier" prefetch={false} className="btn btn-sm btn-publish" aria-label="Publier une annonce"><Ion icon={addCircle} size={22} /><span className="publish-label">Publier une annonce</span></Link>
    </>
  );
}
