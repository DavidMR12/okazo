import { BadRequestException } from '@nestjs/common';

/**
 * Formulaires des catégories (colonne categories.attributes_schema, voir db/forms/category-forms.js).
 * Fonctions pures : fusion catégorie principale + sous-catégorie, validation des champs, affichage.
 */
type PriceType = 'fixed' | 'negotiable' | 'free' | 'contact';
const ALL_PRICE_TYPES: PriceType[] = ['fixed', 'negotiable', 'free', 'contact'];

export interface SelectOption {
  value: string;
  label: string;
  unit?: string; // ex. « h » pour un tarif à l'heure
}

interface BaseField {
  key: string;
  label: string;
  required?: boolean; // obligatoire pour proposer (jamais pour une demande)
  filter?: boolean; // utilisable comme filtre de recherche
}
export type FieldDef =
  | (BaseField & { type: 'select'; options: SelectOption[] })
  | (BaseField & { type: 'number'; min?: number; max?: number; unit?: string })
  | (BaseField & { type: 'text'; maxLength?: number; placeholder?: string });

export interface PriceConfig {
  label: string; // « Prix », « Salaire mensuel », « Loyer mensuel »…
  requestLabel: string; // pour « Je recherche » : « Budget », « Salaire souhaité »…
  types: PriceType[]; // types de prix proposés
  unit?: string; // unité fixe : « mois »
  unitFrom?: string; // unité lue dans un champ (ex. rate_unit = heure → « h »)
}

export interface CategoryForm {
  fields: FieldDef[];
  price: PriceConfig;
  condition: boolean; // l'« état » (neuf, comme neuf…) a-t-il un sens ?
}

interface StoredSchema {
  fields?: FieldDef[];
  price?: Partial<PriceConfig>;
  condition?: boolean;
  replaceParentFields?: boolean;
}

const DEFAULT_PRICE: PriceConfig = { label: 'Prix', requestLabel: 'Budget', types: ALL_PRICE_TYPES };

/** Formulaire effectif d'une catégorie : celui de sa catégorie principale, complété ou remplacé par le sien. */
export function mergeForms(parent: StoredSchema | null | undefined, own: StoredSchema | null | undefined): CategoryForm {
  const p = parent ?? {};
  const o = own ?? {};
  const fields = o.replaceParentFields ? [...(o.fields ?? [])] : [...(p.fields ?? []), ...(o.fields ?? [])];
  // Une sous-catégorie peut redéfinir un champ de la catégorie principale (même clé) : la sienne l'emporte
  const byKey = new Map<string, FieldDef>();
  for (const f of fields) byKey.set(f.key, f);
  return {
    fields: [...byKey.values()],
    price: { ...DEFAULT_PRICE, ...p.price, ...o.price },
    condition: o.condition ?? p.condition ?? true,
  };
}

const invalid = (field: FieldDef, message: string) =>
  new BadRequestException({ code: 'ATTRIBUTE_INVALID', message: `« ${field.label} » : ${message}`, field: field.key });

/**
 * Garde uniquement les champs connus, au bon format. Les champs obligatoires ne le sont que pour proposer :
 * quelqu'un qui cherche un emploi n'a pas à préciser un type de contrat.
 */
export function validateAttributes(form: CategoryForm, input: Record<string, unknown>, adType: 'offer' | 'request'): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const f of form.fields) {
    const raw = input[f.key];
    const empty = raw === undefined || raw === null || raw === '';
    if (empty) {
      if (f.required && adType === 'offer') throw invalid(f, 'ce champ est obligatoire.');
      continue;
    }
    if (f.type === 'select') {
      if (typeof raw !== 'string' || !f.options.some((o) => o.value === raw)) throw invalid(f, 'choisissez une valeur de la liste.');
      out[f.key] = raw;
    } else if (f.type === 'number') {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
      if (!Number.isInteger(n)) throw invalid(f, 'indiquez un nombre entier.');
      if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) {
        throw invalid(f, `indiquez une valeur entre ${f.min ?? 0} et ${f.max}.`);
      }
      out[f.key] = n;
    } else {
      if (typeof raw !== 'string') throw invalid(f, 'texte attendu.');
      const t = raw.trim().replace(/\s+/g, ' ');
      if (t.length > (f.maxLength ?? 120)) throw invalid(f, `${f.maxLength ?? 120} caractères maximum.`);
      if (t) out[f.key] = t;
    }
  }
  return out;
}

export function assertPriceType(form: CategoryForm, priceType: PriceType) {
  if (!form.price.types.includes(priceType)) {
    throw new BadRequestException({ code: 'PRICE_TYPE_INVALID', message: 'Ce type de prix n’est pas proposé pour cette catégorie.' });
  }
}

const NNBSP = ' ';
const groupDigits = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);

/** Caractéristiques lisibles pour la fiche annonce : « Type de contrat : CDI », « Kilométrage : 98 000 km ». */
export function describeAttributes(form: CategoryForm, attributes: Record<string, unknown>): { key: string; label: string; value: string }[] {
  const facts: { key: string; label: string; value: string }[] = [];
  for (const f of form.fields) {
    const v = attributes[f.key];
    if (v === undefined || v === null || v === '') continue;
    let value: string;
    if (f.type === 'select') {
      const o = f.options.find((x) => x.value === v);
      if (!o) continue; // valeur retirée du formulaire depuis la publication
      value = o.label;
    } else if (f.type === 'number') {
      // Une année ne prend pas d'espace : « 2012 », pas « 2 012 »
      value = `${f.key === 'year' ? String(v) : groupDigits(Number(v))}${f.unit ? `${NNBSP}${f.unit}` : ''}`;
    } else {
      value = String(v);
    }
    facts.push({ key: f.key, label: f.label, value });
  }
  return facts;
}

/** Unité du prix : « mois » pour un salaire ou un loyer, « h » pour un tarif horaire. */
export function priceUnit(form: CategoryForm, attributes: Record<string, unknown>): string | null {
  if (form.price.unit) return form.price.unit;
  if (form.price.unitFrom) {
    const f = form.fields.find((x) => x.key === form.price.unitFrom);
    if (f?.type === 'select') return f.options.find((o) => o.value === attributes[f.key])?.unit ?? null;
  }
  return null;
}
