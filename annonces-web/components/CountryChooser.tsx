'use client';

import { chevronForward } from 'ionicons/icons';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RegionCountry } from '@/lib/region';
import { Flag } from './Flag';
import { Ion } from './Ion';

/**
 * Visiteur hors des pays ouverts (18 novembre 2026, comme Louam) : au lieu de lui imposer le Cameroun, on lui
 * demande où il cherche (la diaspora cherche souvent au pays depuis l'étranger). Pays, puis ville ou tout le pays.
 * Le choix est gardé ; il peut changer de pays ensuite depuis la ligne de la ville (« Changer de pays »).
 */
export function CountryChooser({
  catalog,
  current,
  onChoose,
  onClose,
}: {
  catalog: RegionCountry[];
  current?: string;
  onChoose: (country: string, city?: string) => void;
  onClose?: () => void;
}) {
  const [country, setCountry] = useState<RegionCountry | null>(catalog.length === 1 ? catalog[0] : null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [country]);
  useEffect(() => {
    if (!onClose) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  if (!catalog.length) return null;
  const name = (c: RegionCountry) => c.name.replace(/\s*\(.*\)$/, '');
  // Rendue sur la page elle-même : la ligne de la ville (z-index 20) l'aurait laissée sous le bandeau des cookies
  return createPortal(
    <div className="chooser-backdrop" onClick={onClose ? (e) => e.target === e.currentTarget && onClose() : undefined}>
      <div ref={box} className="chooser" role="dialog" aria-modal="true" aria-labelledby="chooser-title">
        {country ? (
          <>
            <p id="chooser-title" className="chooser-title">
              <Flag code={country.code.toUpperCase()} width={30} />
              <span>{name(country)}</span>
            </p>
            <p className="chooser-text">Dans quelle ville cherchez-vous&nbsp;?</p>
            <div className="chooser-cities">
              {country.cities.map((c) => (
                <button key={c.slug} type="button" className="chip" onClick={() => onChoose(country.code, c.slug)}>{c.name}</button>
              ))}
              <button type="button" className="chip" onClick={() => onChoose(country.code)}>Tout le pays</button>
            </div>
            {catalog.length > 1 ? (
              <button type="button" className="chooser-back" onClick={() => setCountry(null)}>Changer de pays</button>
            ) : null}
          </>
        ) : (
          <>
            <p id="chooser-title" className="chooser-title">Où cherchez-vous&nbsp;?</p>
            <p className="chooser-text">Okazo est ouvert dans ces pays. Choisissez celui qui vous intéresse, vous pourrez en changer ensuite.</p>
            <div className="chooser-countries">
              {catalog.map((c) => (
                <button key={c.code} type="button" className="chooser-country" aria-current={c.code === current ? 'true' : undefined} onClick={() => setCountry(c)}>
                  <Flag code={c.code.toUpperCase()} width={34} />
                  <span>{name(c)}</span>
                  <Ion icon={chevronForward} size={18} className="chooser-chevron" />
                </button>
              ))}
            </div>
            {onClose ? <button type="button" className="chooser-back" onClick={onClose}>Fermer</button> : null}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
