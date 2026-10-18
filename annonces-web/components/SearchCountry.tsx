'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { Country } from '@/lib/types';
import { CountrySelect } from './CountrySelect';

/**
 * Choix du pays de la barre de recherche : liste à drapeaux (comme à la connexion). Choisir un pays ouvre
 * tout de suite la même catégorie dans ce pays (la ville et les filtres, propres au pays d'avant, sont quittés),
 * en gardant le texte déjà tapé. Sans JavaScript : liste native, envoyée avec « Rechercher ».
 */
export function SearchCountry({ countries, country, category }: { countries: Country[]; country: string; category?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(country.toUpperCase());
  const field = useRef<HTMLInputElement>(null);

  const onChange = (code: string) => {
    setValue(code);
    if (code === country.toUpperCase()) return;
    const q = (field.current?.form?.elements.namedItem('q') as HTMLInputElement | null)?.value.trim() ?? '';
    const path = `/${code.toLowerCase()}${category ? `/${category}` : ''}`;
    router.push(q.length >= 2 ? `${path}?q=${encodeURIComponent(q)}` : path);
  };

  return (
    <>
      <input ref={field} type="hidden" name="pays" value={value.toLowerCase()} />
      <div className="search-country">
        <CountrySelect countries={countries} value={value} onChange={onChange} />
      </div>
      <noscript>
        <style>{'.search-country { display: none; }'}</style>
        <label className="visually-hidden" htmlFor="pays">Pays</label>
        <select id="pays" name="pays" defaultValue={country.toLowerCase()}>
          {countries.map((c) => (
            <option key={c.code} value={c.code.toLowerCase()}>{c.name}</option>
          ))}
        </select>
      </noscript>
    </>
  );
}
