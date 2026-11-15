import { cameraOutline, search } from 'ionicons/icons';
import Link from 'next/link';
import { DEFAULT_COUNTRY } from '@/lib/site';
import { Ion } from './Ion';

/**
 * Formulaire HTML classique (GET) : fonctionne sans JavaScript, même sur un vieux téléphone.
 * La recherche reste dans le pays de la page (aucun autre pays n'est proposé) et, s'il y en a une, dans sa ville.
 */
export function SearchForm({ action, defaultQuery, country, category, city }: {
  action: string;
  defaultQuery?: string;
  country?: string;
  category?: string; // pages de liste : la recherche reste dans la catégorie
  city?: string; // et dans la ville
}) {
  const pays = (country ?? DEFAULT_COUNTRY).toLowerCase();
  return (
    <form className="search" action={action} method="get" role="search">
      <label className="visually-hidden" htmlFor="q">Rechercher</label>
      <input type="hidden" name="pays" value={pays} />
      {category ? <input type="hidden" name="cat" value={category} /> : null}
      {city ? <input type="hidden" name="ville" value={city} /> : null}
      {city ? <input type="hidden" name="depuis" value={pays} /> : null}
      {/* Une seule ligne : appareil photo dans le champ, à droite ; sur téléphone, bouton loupe */}
      <div className="search-field">
        <input id="q" name="q" type="search" defaultValue={defaultQuery} placeholder="Que recherchez-vous ?" minLength={2} maxLength={80} />
        <Link href={`/recherche-image?pays=${pays}`} className="search-lens" prefetch={false} aria-label="Rechercher par image" title="Rechercher par image"><Ion icon={cameraOutline} size={22} /></Link>
      </div>
      <button className="btn search-submit" type="submit" aria-label="Rechercher">
        <Ion icon={search} size={20} />
        <span className="search-submit-label">Rechercher</span>
      </button>
    </form>
  );
}
