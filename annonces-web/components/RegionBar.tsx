'use client';

import { chevronDown, location } from 'ionicons/icons';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ABROAD_COOKIE,
  AUTO_COOKIE,
  browserRegion,
  formatRegion,
  inCountry,
  isGuess,
  readCookie,
  type Region,
  REGION_COOKIE,
  type RegionCountry,
  TZ_COOKIE,
  TZ_COUNTRY,
  writeCookie,
} from '@/lib/region';
import { CountryChooser } from './CountryChooser';
import { Ion } from './Ion';

/**
 * Ligne discrète tout en haut du site, comme Uber : « 📍 Douala ▾ ». Le menu ne propose que les villes du pays
 * du visiteur et « Tout le pays » : les autres pays ne sont jamais montrés.
 * Corrige aussi la région supposée par le serveur avec le fuseau horaire du navigateur.
 * Visiteur hors des pays ouverts (18 novembre 2026, comme Louam) : ni l'adresse internet ni le fuseau horaire ne
 * donnent un pays ouvert, on lui demande où il cherche (CountryChooser) ; il garde ensuite « Changer de pays ».
 */
export function RegionBar({ catalog }: { catalog: RegionCountry[] }) {
  const router = useRouter();
  const pathname = usePathname();
  // Cookies lus dans le navigateur seulement (rien au premier rendu côté serveur : la page reste en cache)
  const raw = useSyncExternalStore(subscribe, () => readCookie(REGION_COOKIE) ?? readCookie(AUTO_COOKIE) ?? '', () => null);
  const region: Region | null = raw === null ? null : browserRegion() ?? fromPath(pathname, catalog);
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const abroad = raw !== null && readCookie(ABROAD_COOKIE) === '1';
  // Hors des pays ouverts (ni adresse internet ni fuseau horaire utiles) et pas encore de choix : on lui demande où il cherche
  const mustChoose = raw !== null && !readCookie(REGION_COOKIE) && isGuess(readCookie(AUTO_COOKIE)) && !tzCountry(catalog);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const current = browserRegion() ?? fromPath(pathname, catalog);
    // Aucun indice sur le pays côté serveur (adresse étrangère, VPN) : le fuseau horaire du navigateur tranche
    if (!readCookie(REGION_COOKIE) && isGuess(readCookie(AUTO_COOKIE)) && !readCookie(TZ_COOKIE)) {
      const tz = tzCountry(catalog);
      if (tz) {
        writeCookie(TZ_COOKIE, tz);
        if (tz !== current?.country && pathname === '/') router.refresh();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois par chargement de page
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const country = region && catalog.find((c) => c.code === region.country);
  const city = country?.cities.find((c) => c.slug === region?.city);

  const choose = (next: Region, fromChooser = false) => {
    setOpen(false);
    setChanging(false);
    if (fromChooser) writeCookie(ABROAD_COOKIE, '1');
    writeCookie(REGION_COOKIE, formatRegion(next));
    changed();
    // Page de liste du même pays : même catégorie, dans la ville choisie ; accueil : rechargé pour la nouvelle ville
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] === next.country && parts[1] !== 'categories' && parts.length <= 3) {
      const cat = parts[1] && parts[1] !== 'toutes' ? parts[1] : undefined;
      router.push(`/${next.country}${cat || next.city ? `/${cat ?? 'toutes'}` : ''}${next.city ? `/${next.city}` : ''}`);
    } else if (pathname === '/') router.refresh();
    else router.push('/');
  };

  return (
    <div className="region-bar">
      <div className="container region-inner" ref={box}>
        {country ? (
          <>
            <button type="button" className="region-current" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              <Ion icon={location} size={14} />
              <span>{city ? city.name : country.name.replace(/\s*\(.*\)$/, '')}</span>
              <Ion icon={chevronDown} size={12} />
            </button>
            {open ? (
              <ul className="region-list" aria-label={`Villes ${inCountry(country.name)}`}>
                {country.cities.map((c) => (
                  <li key={c.slug}>
                    <button type="button" aria-current={region?.city === c.slug ? 'true' : undefined} onClick={() => choose({ country: country.code, city: c.slug })}>{c.name}</button>
                  </li>
                ))}
                <li>
                  <button type="button" aria-current={!region?.city ? 'true' : undefined} onClick={() => choose({ country: country.code })}>Tout le pays</button>
                </li>
                {abroad && catalog.length > 1 ? (
                  <li className="region-change">
                    <button type="button" onClick={() => { setOpen(false); setChanging(true); }}>Changer de pays</button>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </>
        ) : (
          <span className="region-current placeholder" aria-hidden>&nbsp;</span>
        )}
      </div>
      {mustChoose || changing ? (
        <CountryChooser
          catalog={catalog}
          current={changing ? country?.code : undefined}
          onChoose={(c, city) => choose({ country: c, city }, true)}
          onClose={changing ? () => setChanging(false) : undefined}
        />
      ) : null}
    </div>
  );
}

// Le choix de la ville prévient l'affichage (useSyncExternalStore)
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const changed = () => listeners.forEach((l) => l());

/** Pays ouvert du fuseau horaire du navigateur, s'il y en a un. */
function tzCountry(catalog: RegionCountry[]): string | undefined {
  const tz = TZ_COUNTRY[Intl.DateTimeFormat().resolvedOptions().timeZone];
  return tz && catalog.some((c) => c.code === tz) ? tz : undefined;
}

/** Sans cookie (premier affichage d'une page de pays) : le pays de l'adresse, ville comprise. */
function fromPath(pathname: string, catalog: RegionCountry[]): Region | null {
  const [p, , ville] = pathname.split('/').filter(Boolean);
  const c = catalog.find((x) => x.code === p);
  if (!c) return null;
  return { country: c.code, city: c.cities.some((x) => x.slug === ville) ? ville : undefined };
}
