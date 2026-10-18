'use client';

import { useEffect, useRef, useState } from 'react';
import type { Country } from '@/lib/types';
import { Flag } from './Flag';

/**
 * Liste déroulante des pays avec leur drapeau. Sur mesure : une liste native ne peut pas montrer d'images.
 * showDial : version « indicatif » du champ téléphone (drapeau + +237, et l'indicatif de chaque pays dans la liste).
 * Clavier : Entrée ou flèche bas pour ouvrir, flèches pour choisir, Échap pour fermer.
 */
export function CountrySelect({ countries, value, onChange, showDial = false }: { countries: Country[]; value: string; onChange: (code: string) => void; showDial?: boolean }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const current = countries.find((c) => c.code === value) ?? countries[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const choose = (code: string) => {
    onChange(code);
    setOpen(false);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setActive(Math.max(0, countries.findIndex((c) => c.code === current?.code)));
      setOpen(true);
    } else if (open && e.key === 'Escape') setOpen(false);
    else if (open && e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(countries.length - 1, i + 1)); }
    else if (open && e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (open && e.key === 'Enter') { e.preventDefault(); choose(countries[active].code); }
  };

  return (
    <div className={showDial ? 'country-select dial' : 'country-select'} ref={box}>
      <button type="button" className="country-current" aria-haspopup="listbox" aria-expanded={open} aria-label={showDial ? `Indicatif : ${current?.name} ${current?.dialCode}` : `Pays : ${current?.name}`} onClick={() => setOpen((o) => !o)} onKeyDown={onKey}>
        {current ? <Flag code={current.code} /> : null}
        <span>{showDial ? current?.dialCode : current?.name}</span>
        <span className="country-chevron" aria-hidden>▾</span>
      </button>
      {open ? (
        <ul className="country-list" role="listbox" aria-label="Pays">
          {countries.map((c, i) => (
            <li
              key={c.code}
              role="option"
              aria-selected={c.code === current?.code}
              className={i === active ? 'active' : undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(c.code)}
            >
              <Flag code={c.code} />
              <span>{c.name}</span>
              {showDial ? <span className="country-dial">{c.dialCode}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
