import Link from 'next/link';
import { CONDITION_LABELS } from '@/lib/format';
import type { PageParams } from '@/lib/searchParams';
import type { CategoryForm, District } from '@/lib/types';
import { WalletLogo, walletName } from './Wallets';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(',') : v) ?? '';
const many = (v: string | string[] | undefined) => one(v).split(',').filter(Boolean);

/**
 * Filtres des pages de liste : formulaire GET classique (fonctionne sans JavaScript, adresse partageable).
 * Tri, type d'annonce, prix, état et champs filtrables de la catégorie choisie.
 */
export function FiltersForm({ action, sp, form, open, districts = [], handDelivery = true, wallets = [] }: { action: string; sp: PageParams; form?: CategoryForm; open: boolean; districts?: District[]; handDelivery?: boolean; wallets?: string[] }) {
  const fields = (form?.fields ?? []).filter((f) => f.filter);
  const conditions = many(sp.etat);
  return (
    <details className="filters" open={open}>
      <summary>Filtres et tri</summary>
      <form action={action} method="get" className="filters-form">
        {sp.q ? <input type="hidden" name="q" value={one(sp.q)} /> : null}

        <div className="filters-grid">
          <label className="field">
            <span className="filter-label">Trier par</span>
            <select name="tri" defaultValue={one(sp.tri)}>
              <option value="">Plus récentes</option>
              <option value="prix_croissant">Prix croissant</option>
              <option value="prix_decroissant">Prix décroissant</option>
            </select>
          </label>
          <label className="field">
            <span className="filter-label">Type d’annonce</span>
            <select name="type" defaultValue={one(sp.type)}>
              <option value="">Toutes</option>
              <option value="offres">Offres</option>
              <option value="demandes">Demandes (« Je recherche »)</option>
            </select>
          </label>
          {districts.length ? (
            <label className="field">
              <span className="filter-label">Quartier</span>
              <select name="quartier" defaultValue={one(sp.quartier)}>
                <option value="">Tous les quartiers</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          <fieldset className="field">
            <legend className="filter-label">{form?.price.label ?? 'Prix'} (FCFA)</legend>
            <div className="range">
              <input name="prix_min" inputMode="numeric" placeholder="Min." defaultValue={one(sp.prix_min)} aria-label="Prix minimum" />
              <span>à</span>
              <input name="prix_max" inputMode="numeric" placeholder="Max." defaultValue={one(sp.prix_max)} aria-label="Prix maximum" />
            </div>
          </fieldset>
        </div>

        {wallets.length ? (
          <fieldset className="field">
            <legend className="filter-label">Paiement électronique</legend>
            <div className="chip-wrap">
              <label className="check-chip">
                <input type="radio" name="paiement" value="" defaultChecked={!one(sp.paiement)} />
                <span>Tous</span>
              </label>
              {wallets.map((w) => (
                <label key={w} className="check-chip wallet-chip">
                  <input type="radio" name="paiement" value={w} defaultChecked={one(sp.paiement) === w} />
                  <span><WalletLogo code={w} height={20} /> {walletName(w)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {handDelivery ? (
          <fieldset className="field">
            <legend className="filter-label">Mode de remise</legend>
            <div className="chip-wrap">
              <label className="check-chip">
                <input type="checkbox" name="main_propre" value="1" defaultChecked={!!one(sp.main_propre)} />
                <span>Remise en main propre</span>
              </label>
            </div>
          </fieldset>
        ) : null}

        {form?.condition !== false ? (
          <fieldset className="field">
            <legend className="filter-label">État</legend>
            <div className="chip-wrap">
              {Object.entries(CONDITION_LABELS).map(([v, label]) => (
                <label key={v} className="check-chip">
                  <input type="checkbox" name="etat" value={v} defaultChecked={conditions.includes(v)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {fields.map((f) =>
          f.type === 'select' ? (
            <fieldset key={f.key} className="field">
              <legend className="filter-label">{f.label}</legend>
              <div className="chip-wrap">
                {f.options.map((o) => (
                  <label key={o.value} className="check-chip">
                    <input type="checkbox" name={`a_${f.key}`} value={o.value} defaultChecked={many(sp[`a_${f.key}`]).includes(o.value)} />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : f.type === 'number' ? (
            <fieldset key={f.key} className="field">
              <legend className="filter-label">{f.label}{f.unit ? ` (${f.unit})` : ''}</legend>
              <div className="range">
                <input name={`a_${f.key}_min`} inputMode="numeric" placeholder="Min." defaultValue={one(sp[`a_${f.key}_min`])} aria-label={`${f.label} minimum`} />
                <span>à</span>
                <input name={`a_${f.key}_max`} inputMode="numeric" placeholder="Max." defaultValue={one(sp[`a_${f.key}_max`])} aria-label={`${f.label} maximum`} />
              </div>
            </fieldset>
          ) : null,
        )}

        <div className="submit-row">
          <button type="submit" className="btn">Appliquer</button>
          <Link href={sp.q ? `${action}?q=${encodeURIComponent(one(sp.q))}` : action} className="pill-btn">Effacer les filtres</Link>
        </div>
      </form>
    </details>
  );
}
