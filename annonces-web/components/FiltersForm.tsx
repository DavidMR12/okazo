import { checkmark, handLeft, location, options, phonePortrait, pricetag, search, sparkles, swapHorizontal, swapVertical } from 'ionicons/icons';
import Link from 'next/link';
import { CONDITION_LABELS } from '@/lib/format';
import type { PageParams } from '@/lib/searchParams';
import type { CategoryForm, District } from '@/lib/types';
import { Ion } from './Ion';
import { WalletLogo, walletName } from './Wallets';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(',') : v) ?? '';
const many = (v: string | string[] | undefined) => one(v).split(',').filter(Boolean);

/**
 * Filtres des pages de liste : formulaire GET classique (fonctionne sans JavaScript, adresse partageable).
 * Même style que l'écran Filtres de l'application (15 novembre 2026) : rubriques en cartes avec icône,
 * sélecteurs segmentés, pastilles bleues avec coche, interrupteur, le tout en Outfit.
 */
export function FiltersForm({ action, sp, form, open, districts = [], handDelivery = true, wallets = [] }: { action: string; sp: PageParams; form?: CategoryForm; open: boolean; districts?: District[]; handDelivery?: boolean; wallets?: string[] }) {
  const fields = (form?.fields ?? []).filter((f) => f.filter);
  const conditions = many(sp.etat);
  // Nombre de filtres réglés (hors recherche), affiché dans le titre et sur « Effacer »
  const active = Object.entries(sp).filter(([k, v]) => !['q', 'page', 'pays', 'depuis'].includes(k) && one(v) !== '').length;
  return (
    <details className="filters" open={open}>
      <summary>
        <span className="f-sum-icon"><Ion icon={options} size={18} /></span>
        <span className="f-sum-title">Filtres et tri</span>
        {active ? <span className="f-sum-count">{active}</span> : null}
      </summary>
      <form action={action} method="get" className="filters-form">
        {sp.q ? <input type="hidden" name="q" value={one(sp.q)} /> : null}

        <div className="f-cols">
          <Card title="Trier par" icon={swapVertical}>
            <Segmented name="tri" value={one(sp.tri)} options={[['', 'Récentes'], ['prix_croissant', 'Prix ↑'], ['prix_decroissant', 'Prix ↓']]} />
          </Card>
          <Card title="Type d’annonce" icon={swapHorizontal}>
            <Segmented name="type" value={one(sp.type)} options={[['', 'Toutes'], ['offres', 'Offres'], ['demandes', 'Demandes']]} />
          </Card>
        </div>

        {districts.length ? (
          <Card title="Quartier" icon={location}>
            <div className="chip-wrap">
              <Pill type="radio" name="quartier" value="" checked={!one(sp.quartier)} label="Tous les quartiers" />
              {districts.map((d) => (
                <Pill key={d.id} type="radio" name="quartier" value={String(d.id)} checked={one(sp.quartier) === String(d.id)} label={d.name} />
              ))}
            </div>
          </Card>
        ) : null}

        <Card title={form?.price.label ?? 'Prix'} icon={pricetag}>
          <Range unit="FCFA" min={['prix_min', one(sp.prix_min)]} max={['prix_max', one(sp.prix_max)]} label={form?.price.label ?? 'Prix'} />
        </Card>

        {form?.condition !== false ? (
          <Card title="État" icon={sparkles}>
            <div className="chip-wrap">
              {Object.entries(CONDITION_LABELS).map(([v, label]) => (
                <Pill key={v} type="checkbox" name="etat" value={v} checked={conditions.includes(v)} label={label} />
              ))}
            </div>
          </Card>
        ) : null}

        {wallets.length ? (
          <Card title="Paiement électronique" icon={phonePortrait}>
            <div className="chip-wrap">
              <Pill type="radio" name="paiement" value="" checked={!one(sp.paiement)} label="Tous" />
              {wallets.map((w) => (
                <Pill key={w} type="radio" name="paiement" value={w} checked={one(sp.paiement) === w} label={<><WalletLogo code={w} height={18} /> {walletName(w)}</>} />
              ))}
            </div>
          </Card>
        ) : null}

        {handDelivery ? (
          <Card title="Mode de remise" icon={handLeft}>
            <label className="f-toggle">
              <span className="f-toggle-text">
                <strong>Remise en main propre</strong>
                <small>Rencontrer le vendeur pour récupérer l’article</small>
              </span>
              <input type="checkbox" name="main_propre" value="1" defaultChecked={!!one(sp.main_propre)} />
              <span className="f-switch" aria-hidden />
            </label>
          </Card>
        ) : null}

        {fields.map((f) =>
          f.type === 'select' ? (
            <Card key={f.key} title={f.label} icon={options}>
              <div className="chip-wrap">
                {f.options.map((o) => (
                  <Pill key={o.value} type="checkbox" name={`a_${f.key}`} value={o.value} checked={many(sp[`a_${f.key}`]).includes(o.value)} label={o.label} />
                ))}
              </div>
            </Card>
          ) : f.type === 'number' ? (
            <Card key={f.key} title={f.label} icon={options}>
              <Range unit={f.unit} min={[`a_${f.key}_min`, one(sp[`a_${f.key}_min`])]} max={[`a_${f.key}_max`, one(sp[`a_${f.key}_max`])]} label={f.label} />
            </Card>
          ) : null,
        )}

        <div className="f-actions">
          <button type="submit" className="btn"><Ion icon={search} size={20} /> Voir les annonces</button>
          <Link href={sp.q ? `${action}?q=${encodeURIComponent(one(sp.q))}` : action} className={active ? 'f-reset' : 'f-reset is-empty'} aria-disabled={!active}>
            Effacer{active ? ` (${active})` : ''}
          </Link>
        </div>
      </form>
    </details>
  );
}

/** Carte d'une rubrique : pastille d'icône bleue et titre en Outfit. */
function Card({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <fieldset className="f-card">
      <legend className="visually-hidden">{title}</legend>
      <div className="f-card-head" aria-hidden>
        <span className="f-card-icon"><Ion icon={icon} size={16} /></span>
        <span className="f-card-title">{title}</span>
      </div>
      {children}
    </fieldset>
  );
}

/** Sélecteur segmenté en boutons radio (fonctionne sans JavaScript). */
function Segmented({ name, value, options: opts }: { name: string; value: string; options: [string, string][] }) {
  return (
    <div className="f-seg">
      {opts.map(([v, label]) => (
        <label key={v || 'tous'}>
          <input type="radio" name={name} value={v} defaultChecked={value === v} />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

/** Pastille de choix : bleue avec une coche quand elle est cochée. */
function Pill({ type, name, value, checked, label }: { type: 'radio' | 'checkbox'; name: string; value: string; checked: boolean; label: React.ReactNode }) {
  return (
    <label className="check-chip">
      <input type={type} name={name} value={value} defaultChecked={checked} />
      <span><Ion icon={checkmark} size={15} className="chip-check" />{label}</span>
    </label>
  );
}

function Range({ unit, min, max, label }: { unit?: string; min: [string, string]; max: [string, string]; label: string }) {
  return (
    <div className="range">
      <label className="f-input">
        <small>Minimum</small>
        <input name={min[0]} inputMode="numeric" placeholder="0" defaultValue={min[1]} aria-label={`${label} minimum`} />
      </label>
      <span className="f-dash" aria-hidden />
      <label className="f-input">
        <small>Maximum</small>
        <input name={max[0]} inputMode="numeric" placeholder="Sans limite" defaultValue={max[1]} aria-label={`${label} maximum`} />
      </label>
      {unit ? <span className="f-unit">{unit}</span> : null}
    </div>
  );
}
