/**
 * Filtres de recherche du site : paramètres d'adresse en français (partageables, sans JavaScript)
 * ↔ paramètres de l'API (GET /listings). Les champs de catégorie gardent le format de l'API : a_<champ>.
 *   tri=prix_croissant · prix_min / prix_max · etat=new,like_new · type=offres|demandes · quartier=12 · main_propre=1 · a_brand=toyota
 */
export type PageParams = Record<string, string | string[] | undefined>;

const SORTS: Record<string, string> = { prix_croissant: 'price_asc', prix_decroissant: 'price_desc' };
const SORTS_BACK: Record<string, string> = { price_asc: 'prix_croissant', price_desc: 'prix_decroissant' };
const KEY_RE = /^a_[a-z0-9_]{1,40}$/;

// Cases à cocher de même nom : la page reçoit une liste, l'API attend « v1,v2 »
const join = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(',') : v)?.trim() || undefined;
const int = (v: string | string[] | undefined) => {
  const s = join(v)?.replace(/\D/g, '');
  return s ? Number(s) : undefined;
};

/** Paramètres de l'API à partir de l'adresse de la page. */
export function apiFilters(sp: PageParams): Record<string, string | number | undefined> {
  const out: Record<string, string | number | undefined> = {
    sort: SORTS[join(sp.tri) ?? ''],
    minPrice: int(sp.prix_min),
    maxPrice: int(sp.prix_max),
    condition: join(sp.etat),
    districtId: int(sp.quartier),
    handDelivery: join(sp.main_propre) ? 'true' : undefined,
    wallet: /^[a-z_]{2,20}$/.test(join(sp.paiement) ?? '') ? join(sp.paiement) : undefined,
    adType: join(sp.type) === 'demandes' ? 'request' : join(sp.type) === 'offres' ? 'offer' : undefined,
  };
  for (const [k, v] of Object.entries(sp)) if (KEY_RE.test(k)) out[k] = join(v);
  return out;
}

/** Adresse de la page à partir des paramètres de l'API (recherche sauvegardée). */
export function pageParams(api: Record<string, string | number | undefined>): URLSearchParams {
  const p = new URLSearchParams();
  const put = (k: string, v: string | number | undefined) => {
    if (v !== undefined && v !== '') p.set(k, String(v));
  };
  put('q', api.q);
  put('tri', SORTS_BACK[String(api.sort ?? '')]);
  put('prix_min', api.minPrice);
  put('prix_max', api.maxPrice);
  put('etat', api.condition);
  put('quartier', api.districtId);
  put('main_propre', api.handDelivery ? '1' : undefined);
  put('paiement', api.wallet);
  put('type', api.adType === 'request' ? 'demandes' : api.adType === 'offer' ? 'offres' : undefined);
  for (const [k, v] of Object.entries(api)) if (KEY_RE.test(k)) put(k, v);
  return p;
}

/** Des filtres sont-ils actifs (hors recherche par mot) ? Sert aussi à ne pas indexer ces pages. */
export const hasFilters = (api: Record<string, string | number | undefined>) => Object.values(api).some((v) => v !== undefined && v !== '');
