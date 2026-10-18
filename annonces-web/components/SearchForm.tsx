import type { Country } from '@/lib/types';
import { SearchCountry } from './SearchCountry';

/** Formulaire HTML classique (GET) : fonctionne sans JavaScript, même sur un vieux téléphone. Le pays se choisit dans une liste à drapeaux. */
export function SearchForm({ action, defaultQuery, countries, country, category, city }: {
  action: string;
  defaultQuery?: string;
  countries?: Country[];
  country?: string;
  category?: string; // pages de liste : la recherche reste dans la catégorie
  city?: string; // et dans la ville (si le pays ne change pas)
}) {
  return (
    <form className="search" action={action} method="get" role="search">
      <label className="visually-hidden" htmlFor="q">Rechercher</label>
      {category ? <input type="hidden" name="cat" value={category} /> : null}
      {city ? <input type="hidden" name="ville" value={city} /> : null}
      {city && country ? <input type="hidden" name="depuis" value={country} /> : null}
      <input id="q" name="q" type="search" defaultValue={defaultQuery} placeholder="Que recherchez-vous ?" minLength={2} maxLength={80} />
      {countries && countries.length > 1 ? (
        <SearchCountry countries={countries} country={country ?? countries[0].code} category={category} />
      ) : null}
      <button className="btn" type="submit">Rechercher</button>
    </form>
  );
}
