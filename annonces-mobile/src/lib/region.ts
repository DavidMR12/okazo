import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../api/client';
import { useCities, useCountries, useMe } from '../api/hooks';
import { Place, usePlace } from './place';

/**
 * Région de l'utilisateur (comme Uber) : il ne voit que SON pays, et par défaut SA ville.
 * Pays : choix gardé → pays du compte → fuseau horaire du téléphone → adresse internet (/geo/region) → premier pays ouvert.
 * Ville : choix gardé → celle de l'adresse internet (même pays) → ville principale du pays.
 * Les autres pays ne sont jamais proposés.
 */
const MAIN_CITY: Record<string, string> = { CM: 'douala', GA: 'libreville', CG: 'brazzaville', TD: 'ndjamena', CF: 'bangui', GQ: 'malabo' };
const TZ_COUNTRY: Record<string, string> = {
  'Africa/Douala': 'CM',
  'Africa/Libreville': 'GA',
  'Africa/Brazzaville': 'CG',
  'Africa/Ndjamena': 'TD',
  'Africa/Bangui': 'CF',
  'Africa/Malabo': 'GQ',
};

function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

interface IpRegion { country: string | null; city: { id: number; slug: string; name: string } | null }

/** Région à utiliser partout (accueil, recherche, filtres, connexion) ; null le temps de la trouver. */
export function useRegion(): Place | null {
  const stored = usePlace();
  const countries = useCountries();
  const me = useMe();
  const ip = useQuery({
    queryKey: ['region-ip'],
    queryFn: () => api<IpRegion>('/geo/region'),
    staleTime: 60 * 60 * 1000,
    retry: 1,
    enabled: !stored,
  });

  const open = useMemo(() => new Set(countries.data?.map((c) => c.code) ?? []), [countries.data]);
  const tz = TZ_COUNTRY[deviceTimeZone() ?? ''];
  const ipCountry = ip.data?.country ?? null;
  let country: string | undefined;
  if (stored && (!open.size || open.has(stored.country))) country = stored.country;
  else if (open.size) {
    if (me.data?.countryCode && open.has(me.data.countryCode)) country = me.data.countryCode;
    else if (tz && open.has(tz)) country = tz;
    else if (ipCountry && open.has(ipCountry)) country = ipCountry;
    else if (!ip.isPending || ip.isError) country = countries.data?.[0]?.code;
  }

  const cities = useCities(stored && stored.country === country ? undefined : country);
  return useMemo(() => {
    if (!country) return null;
    if (stored && stored.country === country) return stored;
    const ipCity = ipCountry === country ? ip.data?.city : null;
    if (ipCity) return { country, cityId: ipCity.id, cityName: ipCity.name };
    const main = cities.data?.find((c) => c.slug === MAIN_CITY[country]);
    return main ? { country, cityId: main.id, cityName: main.name } : { country };
  }, [country, stored, ipCountry, ip.data?.city, cities.data]);
}

/** « à Douala », « au Cameroun », « en Centrafrique ». */
export function placeIn(place: Place | null, countryName?: string): string {
  if (place?.cityName) return `à ${place.cityName}`;
  if (!countryName) return 'près de chez vous';
  const name = countryName.replace(/\s*\(.*\)$/, '');
  return /^(centrafrique|guinée|côte)/i.test(name) ? `en ${name}` : `au ${name}`;
}
