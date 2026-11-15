import 'server-only';
import { cookies, headers } from 'next/headers';
import { getRegionCatalog } from './api';
import { pickRegion, REGION_COOKIE, type Region, TZ_COOKIE } from './region';

/** Région du visiteur, pour les pages qui ne sont pas en cache (connexion…). Même ordre que proxy.ts. */
export async function requestRegion(): Promise<Region> {
  const [jar, h, catalog] = await Promise.all([cookies(), headers(), getRegionCatalog().catch(() => [])]);
  const fix = (v: string | null) => (v ? Buffer.from(v, 'latin1').toString('utf8') : null);
  return pickRegion(
    { chosen: jar.get(REGION_COOKIE)?.value, ipCountry: h.get('cf-ipcountry'), ipCity: fix(h.get('cf-ipcity')), tz: jar.get(TZ_COOKIE)?.value },
    catalog,
  ).region;
}
