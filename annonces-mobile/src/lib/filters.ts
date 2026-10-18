import type { Category, City, FeedFilters } from '../api/types';
import { formatXaf } from './format';
import { walletName } from '../components/Wallets';

/**
 * Filtres de recherche : conversion vers les paramètres de GET /listings (et retour, pour rouvrir
 * une recherche sauvegardée), nombre de filtres actifs, résumé lisible pour nommer une recherche.
 */
export function toQuery(f: FeedFilters): Record<string, string | number | undefined> {
  const { attrs, ...rest } = f;
  const out: Record<string, string | number | undefined> = { ...rest, handDelivery: f.handDelivery ? 'true' : undefined, sort: f.sort && f.sort !== 'recent' ? f.sort : undefined };
  for (const [k, v] of Object.entries(attrs ?? {})) if (v) out[`a_${k}`] = v;
  return out;
}

export function fromQuery(q: Record<string, string | number>): FeedFilters {
  const f: FeedFilters = { attrs: {} };
  const num = (v: unknown) => (v === undefined || v === '' ? undefined : Number(v));
  for (const [k, v] of Object.entries(q)) {
    if (k.startsWith('a_')) f.attrs![k.slice(2)] = String(v);
    else if (k === 'cityId' || k === 'districtId' || k === 'categoryId' || k === 'minPrice' || k === 'maxPrice') f[k] = num(v);
    else if (k === 'country' || k === 'q' || k === 'condition' || k === 'wallet') f[k] = String(v);
    else if (k === 'handDelivery') f.handDelivery = v === 'true' || v === '1';
    else if (k === 'adType') f.adType = v === 'request' ? 'request' : 'offer';
    else if (k === 'sort') f.sort = v === 'price_asc' || v === 'price_desc' ? v : 'recent';
  }
  return f;
}

/** Nombre de filtres actifs (pastille du bouton « Filtres »), hors recherche par mot et tri. */
export function activeCount(f: FeedFilters): number {
  return (
    [f.categoryId, f.cityId, f.districtId, f.handDelivery || undefined, f.wallet, f.adType, f.condition, f.minPrice, f.maxPrice].filter((v) => v !== undefined && v !== '').length +
    Object.values(f.attrs ?? {}).filter(Boolean).length
  );
}

/** Résumé lisible : « Toyota · Voitures · Douala · moins de 5 000 000 FCFA ». */
export function describe(f: FeedFilters, categories: Category[], cities: City[], districtName?: string): string {
  const parts: string[] = [];
  if (f.q) parts.push(`« ${f.q} »`);
  const all = categories.flatMap((c) => [c, ...(c.children ?? [])]);
  const cat = all.find((c) => c.id === f.categoryId);
  // Valeurs des champs (ex. « Toyota »), lues dans le formulaire de la catégorie
  for (const [k, v] of Object.entries(f.attrs ?? {})) {
    const field = cat?.form?.fields.find((x) => x.key.replace(/_(min|max)$/, '') === k.replace(/_(min|max)$/, ''));
    if (!v || !field) continue;
    if (field.type === 'select') parts.push(v.split(',').map((x) => field.options.find((o) => o.value === x)?.label ?? x).join(' ou '));
    else parts.push(`${field.label.toLowerCase()} ${k.endsWith('_min') ? 'dès' : "jusqu’à"} ${v}${field.type === 'number' && field.unit ? ` ${field.unit}` : ''}`);
  }
  if (cat) parts.push(cat.name);
  const city = cities.find((c) => c.id === f.cityId);
  if (city) parts.push(districtName ? `${districtName}, ${city.name}` : city.name);
  if (f.adType === 'request') parts.push('demandes');
  if (f.handDelivery) parts.push('remise en main propre');
  if (f.wallet) parts.push(`paiement ${walletName(f.wallet)}`);
  if (f.minPrice !== undefined && f.maxPrice !== undefined) parts.push(`${formatXaf(f.minPrice)} à ${formatXaf(f.maxPrice)}`);
  else if (f.maxPrice !== undefined) parts.push(`moins de ${formatXaf(f.maxPrice)}`);
  else if (f.minPrice !== undefined) parts.push(`plus de ${formatXaf(f.minPrice)}`);
  return parts.join(' · ') || 'Toutes les annonces';
}
