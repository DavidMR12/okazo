'use client';

/* eslint-disable @next/next/no-img-element -- aperçus locaux (blob:) et miniatures déjà optimisées */
import { DragEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { HeartIcon, ImageIcon, LockIcon, RetryIcon, UploadIcon } from '@/components/icons';
import { PriceTag } from '@/components/PriceTag';
import { call, ClientError } from '@/lib/client';
import { AttributeFields } from '@/components/AttributeFields';
import { AdType, adTypeLabels, descriptionPlaceholder, PHOTO_OPTIONAL_PARENTS, titlePlaceholder } from '@/lib/adType';
import { CONDITION_LABELS } from '@/lib/format';
import type { Category, City, District, PriceType } from '@/lib/types';
import { usePhotoUploads } from '@/lib/usePhotoUploads';
import { WalletList, WalletLogo, walletName } from './Wallets';
import { SITE_NAME } from '@/lib/site';

export interface ListingDraft {
  adType: AdType;
  attributes?: Record<string, string>; // champs de la catégorie, en texte pendant la saisie
  title: string;
  description: string;
  parentId?: number;
  categoryId?: number;
  cityId?: number;
  districtId?: number | null;
  handDelivery?: boolean; // remise en main propre ; absent = oui (choix par défaut)
  paymentMethods?: string[]; // portefeuilles électroniques acceptés
  priceType: PriceType;
  price: string;
  condition?: string;
}
/** « Remise en main propre » ne se demande pas pour l'emploi, les services et l'immobilier (même règle que l'API). */
const HAND_DELIVERY_EXCLUDED = ['emploi', 'services', 'immobilier'];

const EMPTY: ListingDraft = { adType: 'offer', title: '', description: '', priceType: 'fixed', price: '' };

/** Valeurs envoyées à l'API, communes à la publication et à la modification. */
export interface ListingValues {
  adType: AdType;
  attributes: Record<string, string | number>;
  categoryId: number;
  cityId: number;
  districtId: number | null;
  handDelivery?: boolean; // seulement pour un objet proposé (voir HAND_DELIVERY_EXCLUDED)
  paymentMethods: string[]; // portefeuilles acceptés, parmi ceux du pays (vide : non précisé)
  title: string;
  description: string;
  priceType: PriceType;
  priceXaf: number | null;
  condition: string | null;
  photoKeys: string[];
}

const PRICE_TYPES: { value: PriceType; label: string }[] = [
  { value: 'fixed', label: 'Prix fixe' },
  { value: 'negotiable', label: 'À débattre' },
  { value: 'free', label: 'Gratuit' },
  { value: 'contact', label: 'Sur demande' },
];
const groupDigits = (d: string) => d.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Dépôt en étapes, comme sur LeBonCoin (et comme dans l'application) : une question à la fois, puis un récapitulatif. */
type StepKey = 'category' | 'photos' | 'details' | 'price' | 'place' | 'recap';
const STEPS: { key: StepKey; title: string }[] = [
  { key: 'category', title: 'Catégorie' },
  { key: 'photos', title: 'Photos' },
  { key: 'details', title: 'Détails' },
  { key: 'price', title: 'Prix' },
  { key: 'place', title: 'Lieu' },
  { key: 'recap', title: 'Récapitulatif' },
];
// Étape où se corrige chaque erreur
const stepOfError = (k: string): StepKey =>
  k === 'photos' ? 'photos' : k === 'category' ? 'category' : k === 'price' ? 'price' : k === 'city' ? 'place' : 'details';

/**
 * Formulaire d'annonce partagé par « Publier » et « Modifier ».
 * - stepped : dépôt en étapes avec récapitulatif (publication) ; sinon tout sur une page (modification).
 * - draftKey : brouillon dans le navigateur, étape en cours comprise (publication uniquement).
 * - initial / initialPhotos : annonce existante (modification).
 */
export function ListingForm({
  heading,
  header,
  categories,
  cities,
  walletsByCountry = {},
  defaultCityId,
  identityVerified,
  stepped = false,
  draftKey,
  initial,
  initialPhotos,
  submitLabel,
  onSubmit,
}: {
  heading: string;
  header?: ReactNode;
  categories: Category[];
  cities: City[];
  walletsByCountry?: Record<string, string[]>; // portefeuilles électroniques proposés par pays
  defaultCityId?: number | null;
  identityVerified: boolean;
  stepped?: boolean;
  draftKey?: string;
  initial?: Omit<ListingDraft, 'parentId'>;
  initialPhotos?: { key: string; url: string | null }[];
  submitLabel: string;
  onSubmit: (v: ListingValues) => Promise<void>;
}) {
  const photos = usePhotoUploads(8);
  const fileInput = useRef<HTMLInputElement>(null);
  const top = useRef<HTMLDivElement>(null);

  const [d, setD] = useState<ListingDraft>(() => {
    if (!initial) return EMPTY;
    const parent = categories.find((c) => c.id === initial.categoryId || c.children?.some((x) => x.id === initial.categoryId));
    return { ...EMPTY, ...initial, parentId: parent?.id };
  });
  const [step, setStep] = useState(0);
  // « Modifier » depuis le récapitulatif : « Continuer » y ramène directement (si tout est correct)
  const [fromRecap, setFromRecap] = useState(false);
  // Quartiers de la ville choisie
  const [districts, setDistricts] = useState<District[]>([]);
  const [restored, setRestored] = useState(!draftKey);
  const [showErrors, setShowErrors] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (initialPhotos?.length) photos.addExisting(initialPhotos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Brouillon : le texte survit à une coupure réseau ou à la fermeture de l'onglet.
  // Les photos ne sont pas gardées : on reprend au plus tard à l'étape Photos.
  useEffect(() => {
    if (!draftKey) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const { step: savedStep, ...draft } = JSON.parse(raw) as ListingDraft & { step?: number };
        // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement ou réinitialisation voulus à l’affichage
        setD({ ...EMPTY, ...draft });
        if (stepped && savedStep) setStep(Math.min(savedStep, STEPS.findIndex((s) => s.key === 'photos')));
      }
    } catch {
      /* stockage indisponible : on continue sans brouillon */
    }
    setRestored(true);
  }, [draftKey, stepped]);
  useEffect(() => {
    if (!draftKey || !restored) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ ...d, step }));
      } catch {
        /* ignoré */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [d, step, draftKey, restored]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement ou réinitialisation voulus à l’affichage
    if (defaultCityId && !d.cityId) setD((x) => ({ ...x, cityId: defaultCityId }));
  }, [defaultCityId, d.cityId]);

  useEffect(() => {
    if (!d.cityId) return;
    call<{ districts: District[] }>(`/geo/districts?cityId=${d.cityId}`).then((r) => setDistricts(r.districts)).catch(() => setDistricts([]));
  }, [d.cityId]);

  const set = <K extends keyof ListingDraft>(k: K, v: ListingDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const parent = categories.find((c) => c.id === d.parentId);
  const sub = parent?.children?.find((c) => c.id === d.categoryId);
  // Identité exigée seulement pour PROPOSER dans une catégorie sensible (même règle que l'API)
  const needsIdentity = d.adType === 'offer' && !!(parent?.requiresVerification || sub?.requiresVerification) && !identityVerified;
  const labels = adTypeLabels(parent?.slug);
  const askHandDelivery = d.adType === 'offer' && !!parent && !HAND_DELIVERY_EXCLUDED.includes(parent.slug);
  const handDelivery = d.handDelivery ?? true;
  // Portefeuilles du pays de la ville choisie (ou du premier pays de la liste) ; pas pour une demande ni l'emploi
  const walletCountry = cities.find((c) => c.id === d.cityId)?.countryCode ?? cities[0]?.countryCode ?? '';
  const countryWallets = walletsByCountry[walletCountry] ?? [];
  const askWallets = d.adType === 'offer' && !!parent && parent.slug !== 'emploi' && countryWallets.length > 0;
  const wallets = (d.paymentMethods ?? []).filter((w) => countryWallets.includes(w));
  const photosOptional = PHOTO_OPTIONAL_PARENTS.includes(parent?.slug ?? '');
  // Formulaire décrit par l'API : champs, libellé du prix, types de prix, « état » proposé ou non
  const form = sub?.form ?? parent?.form;
  const attrs = d.attributes ?? {};
  const priceTypes = PRICE_TYPES.filter((p) => !form || form.price.types.includes(p.value));
  const showCondition = !!sub && !!form?.condition;
  const unitField = form?.price.unitFrom ? form.fields.find((x) => x.key === form.price.unitFrom) : undefined;
  const priceUnit = form?.price.unit ?? (unitField?.type === 'select' ? unitField.options.find((o) => o.value === attrs[unitField.key])?.unit : undefined);
  const priceRequired = d.priceType === 'fixed' || d.priceType === 'negotiable';
  const priceTitle = form ? (d.adType === 'request' ? form.price.requestLabel : form.price.label) : 'Prix';
  const uploading = photos.photos.length > 0 && !photos.ready && !photos.hasErrors;
  const cityName = cities.find((c) => c.id === d.cityId)?.name ?? 'Votre ville';
  const hasDraft = !!(d.title.trim() || d.description.trim() || d.price || d.categoryId || photos.photos.length);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    const slug = categories.find((c) => c.id === d.parentId)?.slug ?? '';
    if (!photos.photos.length && !PHOTO_OPTIONAL_PARENTS.includes(slug)) e.photos = 'Ajoutez au moins une photo.';
    if (d.title.trim().length < 5) e.title = 'Le titre doit faire au moins 5 caractères.';
    if (d.description.trim().length < 10) e.description = 'Décrivez votre article en quelques phrases.';
    if (!d.categoryId) e.category = 'Choisissez une catégorie.';
    if (!d.cityId) e.city = 'Choisissez une ville.';
    if (priceRequired && !(Number(d.price) > 0)) e.price = 'Indiquez un prix.';
    // Champs de la catégorie (recherchés ici plutôt que reçus : le compilateur React peut ainsi mémoriser le calcul)
    const p = categories.find((c) => c.id === d.parentId);
    const f = (p?.children?.find((c) => c.id === d.categoryId) ?? p)?.form;
    const values = d.attributes ?? {};
    for (const fl of f?.fields ?? []) {
      const v = values[fl.key];
      if (!v) {
        if (fl.required && d.adType === 'offer') e[`attr_${fl.key}`] = 'Ce champ est obligatoire.';
      } else if (fl.type === 'number' && ((fl.min !== undefined && Number(v) < fl.min) || (fl.max !== undefined && Number(v) > fl.max))) {
        e[`attr_${fl.key}`] = `Indiquez une valeur entre ${fl.min ?? 0} et ${fl.max}.`;
      }
    }
    if (f && !f.price.types.includes(d.priceType)) e.price = 'Choisissez un type de prix.';
    return e;
  }, [d, photos.photos.length, priceRequired, categories]);
  const err = (k: string) => (showErrors && errors[k] ? <p className="error" id={`err-${k}`}>{errors[k]}</p> : null);

  // Champs de la catégorie remplis, lisibles : « Marque : Toyota », « Kilométrage : 98 000 km »
  const facts = (form?.fields ?? [])
    .filter((fl) => attrs[fl.key])
    .map((fl) => {
      const v = attrs[fl.key];
      const shown = fl.type === 'select' ? (fl.options.find((o) => o.value === v)?.label ?? v) : fl.type === 'number' ? `${groupDigits(v)}${fl.unit ? ` ${fl.unit}` : ''}` : v;
      return { label: fl.label, value: shown };
    });

  const goTo = (i: number) => {
    setStep(i);
    setShowErrors(false);
    top.current?.scrollIntoView({ block: 'start' });
  };
  const stepHasErrors = (i: number) => Object.keys(errors).some((k) => stepOfError(k) === STEPS[i].key) || (STEPS[i].key === 'category' && needsIdentity);

  const addFiles = (files: FileList | null) => {
    if (files?.length) setNotice(photos.add(files));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const clearDraft = () => {
    setD({ ...EMPTY, cityId: d.cityId });
    photos.reset();
    setShowErrors(false);
    setFromRecap(false);
    setStep(0);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // En étapes, « Entrée » ou « Continuer » passent à l'étape suivante
    if (stepped && STEPS[step].key !== 'recap') {
      if (stepHasErrors(step)) setShowErrors(true);
      else if (fromRecap && !STEPS.some((_, n) => n < STEPS.length - 1 && stepHasErrors(n))) goTo(STEPS.length - 1);
      else goTo(step + 1);
      return;
    }
    setShowErrors(true);
    setSubmitError(null);
    if (Object.keys(errors).length || needsIdentity) {
      if (stepped) {
        const i = STEPS.findIndex((_, n) => stepHasErrors(n));
        if (i >= 0) {
          setStep(i);
          top.current?.scrollIntoView({ block: 'start' });
        }
      }
      return;
    }
    if (photos.hasErrors) {
      setSubmitError("Certaines photos n'ont pas pu être envoyées : réessayez-les ou retirez-les.");
      return;
    }
    if (!photos.ready) return;

    setSubmitting(true);
    try {
      await onSubmit({
        adType: d.adType,
        categoryId: d.categoryId!,
        cityId: d.cityId!,
        districtId: d.districtId ?? null,
        handDelivery: askHandDelivery ? handDelivery : undefined,
        paymentMethods: askWallets ? wallets : [],
        title: d.title.trim(),
        description: d.description.trim(),
        priceType: d.priceType,
        priceXaf: priceRequired ? Number(d.price) : null,
        condition: showCondition && d.condition ? d.condition : null,
        attributes: Object.fromEntries(
          (form?.fields ?? []).filter((fl) => attrs[fl.key]).map((fl) => [fl.key, fl.type === 'number' ? Number(attrs[fl.key]) : attrs[fl.key]]),
        ),
        photoKeys: photos.keys,
      });
      if (draftKey) {
        try {
          localStorage.removeItem(draftKey);
        } catch {
          /* ignoré */
        }
        photos.reset();
      }
    } catch (err) {
      setSubmitError(err instanceof ClientError ? err.message : `Envoi impossible.${draftKey ? ' Votre brouillon est conservé.' : ''}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Section visible : toutes sur une page, ou seulement celles de l'étape en cours
  const at = (k: StepKey) => !stepped || STEPS[step].key === k;
  const isRecap = stepped && STEPS[step].key === 'recap';
  const publishLabel = uploading ? `Envoi des photos (${photos.done}/${photos.photos.length})…` : submitting ? 'Envoi…' : submitLabel;

  return (
    <div className="container publish-layout section" ref={top}>
      <form className="stack-lg" onSubmit={submit} noValidate>
        <div className="publish-title">
          <h1>{heading}</h1>
          {draftKey && restored && hasDraft ? <span className="saved">✓ Brouillon enregistré</span> : null}
        </div>
        {stepped ? (
          <div className="steps-head">
            <p className="muted" style={{ margin: 0 }}>Étape {step + 1} sur {STEPS.length}</p>
            <h2 className="steps-title">{STEPS[step].title}</h2>
            <ol className="step-bars" aria-label="Étapes">
              {STEPS.map((s, i) => (
                <li key={s.key} className={i <= step ? 'done' : undefined} aria-current={i === step ? 'step' : undefined}>
                  <span className="visually-hidden">{s.title}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        {header}

        {at('category') ? (
          <section className="stack" aria-labelledby="h-cat">
            <h2 id="h-cat">{stepped ? 'Que proposez-vous ?' : 'Catégorie'}</h2>
            <div className="chip-wrap">
              {categories.map((c) => (
                <button key={c.id} type="button" className="chip" aria-pressed={d.parentId === c.id}
                  onClick={() => setD((x) => ({ ...x, parentId: c.id, categoryId: c.children?.length ? undefined : c.id, condition: undefined, attributes: {} }))}>
                  {c.name}
                </button>
              ))}
            </div>
            {parent?.children?.length ? (
              <div className="chip-wrap sub-chips">
                {parent.children.map((c) => (
                  <button key={c.id} type="button" className="chip" aria-pressed={d.categoryId === c.id} onClick={() => setD((x) => ({ ...x, categoryId: c.id, attributes: {}, priceType: !c.form || c.form.price.types.includes(x.priceType) ? x.priceType : c.form.price.types[0] }))}>{c.name}</button>
                ))}
              </div>
            ) : null}
            {parent ? (
              <div className="chip-wrap" role="group" aria-label="Type d’annonce">
                {(['offer', 'request'] as const).map((t) => (
                  <button key={t} type="button" className="chip" aria-pressed={d.adType === t} onClick={() => set('adType', t)}>{labels[t]}</button>
                ))}
              </div>
            ) : null}
            {err('category')}
            {needsIdentity ? (
              <div className="safety">
                <strong>Vérification d’identité requise</strong>
                <p>Pour proposer une annonce dans « {sub?.name ?? parent?.name} », vérifiez d’abord votre identité depuis l’application mobile (Compte, puis Vérifier mon identité). Cela protège les acheteurs contre les fausses annonces.</p>
              </div>
            ) : null}
          </section>
        ) : null}

        {at('photos') ? (
          <section className="stack" aria-labelledby="h-photos">
            <div>
              <h2 id="h-photos">Photos</h2>
              <p className="muted">{photosOptional ? 'Facultatives pour cette catégorie. ' : 'Des photos nettes, à la lumière du jour. La première est celle affichée dans les listes. '}8 maximum. Elles sont compressées avant l’envoi.</p>
            </div>
            {photos.remaining > 0 ? (
              <div
                className={`dropzone${dragging ? ' dragging' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <span><UploadIcon />Glissez vos photos ici</span>
                <button type="button" className="btn btn-secondary" onClick={() => fileInput.current?.click()}>Choisir des photos</button>
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              </div>
            ) : null}
            {photos.photos.length ? (
              <ul className="thumbs">
                {photos.photos.map((p, i) => (
                  <li key={p.id} className="thumb">
                    {p.preview ? <img src={p.preview} alt={`Photo ${i + 1}`} /> : <span className="admin-thumb-empty" style={{ width: 120, height: 120 }}>Photo</span>}
                    {p.status === 'processing' || p.status === 'uploading' ? <span className="thumb-overlay"><span className="spinner" aria-label="Envoi en cours" /></span> : null}
                    {p.status === 'done' ? <span className="thumb-done" aria-label="Envoyée">✓</span> : null}
                    {p.status === 'error' ? (
                      <button type="button" className="thumb-overlay thumb-error" onClick={() => photos.retry(p.id)} title={p.error}><RetryIcon />Réessayer</button>
                    ) : null}
                    {i === 0 ? <span className="thumb-cover">Photo principale</span> : null}
                    <span className="thumb-actions">
                      {i > 0 ? <button type="button" className="link-button" onClick={() => photos.makeCover(p.id)}>Mettre en premier</button> : null}
                      <button type="button" className="link-button" onClick={() => photos.remove(p.id)} aria-label={`Retirer la photo ${i + 1}`}>Retirer</button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {uploading || photos.hasErrors ? (
              <p className="muted" aria-live="polite">
                Envoi des photos : {photos.done}/{photos.photos.length}.{' '}
                {photos.hasErrors ? 'Une photo n’a pas pu partir : cliquez dessus pour réessayer.' : 'Continuez, l’envoi se poursuit.'}
              </p>
            ) : null}
            {notice ? <p className="muted">{notice}</p> : null}
            {err('photos')}
          </section>
        ) : null}

        {at('details') && sub && form?.fields.length ? (
          <AttributeFields
            fields={form.fields}
            values={attrs}
            onChange={(k, v) => setD((x) => ({ ...x, attributes: { ...(x.attributes ?? {}), [k]: v ?? '' } }))}
            errors={showErrors ? Object.fromEntries(Object.entries(errors).filter(([k]) => k.startsWith('attr_')).map(([k, v]) => [k.slice(5), v])) : {}}
            showRequired={d.adType === 'offer'}
          />
        ) : null}

        {at('details') ? (
          <>
            <div className="field">
              <div className="label-row">
                <label htmlFor="title"><h2>Titre</h2></label>
                <span className="muted">{d.title.length}/120</span>
              </div>
              <input id="title" value={d.title} maxLength={120} onChange={(e) => set('title', e.target.value)} placeholder={titlePlaceholder(parent?.slug, d.adType)} />
              {err('title')}
            </div>

            <div className="field">
              <label htmlFor="description"><h2>Description</h2></label>
              <p className="muted" style={{ margin: 0 }}>Les acheteurs vous contactent par la messagerie ou WhatsApp : inutile d’écrire votre numéro.</p>
              <textarea id="description" value={d.description} maxLength={5000} onChange={(e) => set('description', e.target.value)} placeholder={descriptionPlaceholder(parent?.slug, d.adType)} />
              {err('description')}
            </div>

            {showCondition ? (
              <section className="stack" aria-labelledby="h-cond">
                <div>
                  <h2 id="h-cond">État</h2>
                  <p className="muted" style={{ margin: 0 }}>Facultatif</p>
                </div>
                <div className="chip-wrap">
                  {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                    <button key={value} type="button" className="chip" aria-pressed={d.condition === value} onClick={() => set('condition', d.condition === value ? undefined : value)}>{label}</button>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {at('price') ? (
          <section className="stack" aria-labelledby="h-price">
            <div>
              <h2 id="h-price">{priceTitle}</h2>
              {stepped ? <p className="muted" style={{ margin: 0 }}>Un prix proche de celui des annonces similaires part plus vite.</p> : null}
            </div>
            <div className="chip-wrap">
              {priceTypes.map((p) => (
                <button key={p.value} type="button" className="chip" aria-pressed={d.priceType === p.value} onClick={() => set('priceType', p.value)}>{p.label}</button>
              ))}
            </div>
            {priceRequired ? (
              <div className="price-input">
                <label htmlFor="price" className="visually-hidden">Prix en francs CFA</label>
                <input id="price" inputMode="numeric" value={groupDigits(d.price)} placeholder="0"
                  onChange={(e) => set('price', e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 11))} />
                <span>{priceUnit ? `FCFA / ${priceUnit}` : 'FCFA'}</span>
              </div>
            ) : null}
            {err('price')}
          </section>
        ) : null}

        {at('place') ? (
          <section className="stack" aria-labelledby="h-city">
            <div>
              <h2 id="h-city">Ville</h2>
              {stepped ? <p className="muted" style={{ margin: 0 }}>Les acheteurs voient la ville, jamais votre adresse.</p> : null}
            </div>
            <div className="chip-wrap">
              {cities.map((c) => (
                <button key={c.id} type="button" className="chip" aria-pressed={d.cityId === c.id} onClick={() => setD((x) => ({ ...x, cityId: c.id, districtId: x.cityId === c.id ? x.districtId : null }))}>{c.name}</button>
              ))}
            </div>
            {err('city')}
          </section>
        ) : null}

        {at('place') && d.cityId && districts.length ? (
          <section className="stack" aria-labelledby="h-district">
            <div>
              <h2 id="h-district">Quartier</h2>
              <p className="muted" style={{ margin: 0 }}>Facultatif. Il aide les acheteurs proches ; votre adresse n’est jamais affichée.</p>
            </div>
            <div className="chip-wrap">
              <button type="button" className="chip" aria-pressed={!d.districtId} onClick={() => set('districtId', null)}>Ne pas préciser</button>
              {districts.map((x) => (
                <button key={x.id} type="button" className="chip" aria-pressed={d.districtId === x.id} onClick={() => set('districtId', x.id)}>{x.name}</button>
              ))}
            </div>
          </section>
        ) : null}

        {at('price') && askWallets ? (
          <section className="stack" aria-labelledby="h-wallets">
            <div>
              <h2 id="h-wallets">Paiement électronique accepté</h2>
              <p className="muted" style={{ margin: 0 }}>Facultatif. L’acheteur vous paie directement, à la remise de l’article : rien ne passe par {SITE_NAME}.</p>
            </div>
            <div className="chip-wrap">
              {countryWallets.map((w) => (
                <button key={w} type="button" className="chip wallet-chip" aria-pressed={wallets.includes(w)}
                  onClick={() => set('paymentMethods', wallets.includes(w) ? wallets.filter((x) => x !== w) : [...wallets, w])}>
                  <WalletLogo code={w} height={22} />
                  {walletName(w)}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {at('place') && askHandDelivery ? (
          <section className="stack" aria-labelledby="h-handover">
            <h2 id="h-handover">Mode de remise</h2>
            <label className="check panel">
              <input type="checkbox" checked={handDelivery} onChange={(e) => set('handDelivery', e.target.checked)} />
              <span><strong>Remise en main propre</strong><br /><span className="muted">Vous rencontrez l’acheteur : il vérifie l’article et paie à la remise.</span></span>
            </label>
          </section>
        ) : null}

        {isRecap ? (
          <div className="stack">
            <p style={{ margin: 0 }}>Vérifiez votre annonce avant de l’envoyer.</p>
            <RecapBlock title="Catégorie" onEdit={() => { setFromRecap(true); goTo(0); }}>
              <p>{[parent?.name, sub?.name].filter(Boolean).join(' › ') || '—'}</p>
              <p className="muted">{labels[d.adType]}</p>
            </RecapBlock>
            <RecapBlock title={`Photos (${photos.photos.length})`} onEdit={() => { setFromRecap(true); goTo(1); }}>
              {photos.photos.length ? (
                <div className="recap-thumbs">
                  {photos.photos.map((p, i) => (p.preview ? <img key={p.id} src={p.preview} alt={`Photo ${i + 1}`} /> : null))}
                </div>
              ) : <p className="muted">Aucune photo</p>}
            </RecapBlock>
            <RecapBlock title="Détails" onEdit={() => { setFromRecap(true); goTo(2); }}>
              <p><strong>{d.title.trim()}</strong></p>
              {facts.length || (showCondition && d.condition) ? (
                <dl className="recap-facts">
                  {facts.map((f) => (
                    <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>
                  ))}
                  {showCondition && d.condition ? <div><dt>État</dt><dd>{CONDITION_LABELS[d.condition]}</dd></div> : null}
                </dl>
              ) : null}
              <p className="recap-desc">{d.description.trim()}</p>
            </RecapBlock>
            <RecapBlock title={priceTitle} onEdit={() => { setFromRecap(true); goTo(3); }}>
              <PriceTag priceType={d.priceType} priceXaf={priceRequired ? Number(d.price) : null} unit={priceUnit} />
              {askWallets && wallets.length ? <WalletList codes={wallets} /> : null}
            </RecapBlock>
            <RecapBlock title="Lieu" onEdit={() => { setFromRecap(true); goTo(4); }}>
              <p>{[districts.find((x) => x.id === d.districtId)?.name, cities.find((c) => c.id === d.cityId)?.name].filter(Boolean).join(', ') || '—'}</p>
              {askHandDelivery ? <p className="muted">{handDelivery ? 'Remise en main propre' : 'Pas de remise en main propre'}</p> : null}
            </RecapBlock>
          </div>
        ) : null}

        {submitError ? <p className="error" role="alert">{submitError}</p> : null}
        {stepped ? (
          <div className="step-nav">
            {step > 0 ? <button type="button" className="btn btn-secondary" onClick={() => goTo(step - 1)}>Retour</button> : <span />}
            <button type="submit" className="btn" disabled={isRecap && (submitting || uploading || needsIdentity)}>
              {isRecap ? publishLabel : 'Continuer'}
            </button>
          </div>
        ) : (
          <div className="submit-row">
            <button type="submit" className="btn" disabled={submitting || uploading || needsIdentity}>{publishLabel}</button>
            <span className="muted">Chaque annonce est vérifiée avant sa mise en ligne, en général en quelques minutes.</span>
          </div>
        )}
        {isRecap ? <p className="muted" style={{ margin: 0 }}>Chaque annonce est vérifiée avant sa mise en ligne, en général en quelques minutes.</p> : null}
        {draftKey && (!stepped || step === 0 || isRecap) ? (
          <button type="button" className="pill-btn" style={{ alignSelf: 'flex-start' }}
            onClick={() => { if (window.confirm('Effacer le brouillon ?')) clearDraft(); }}>
            Effacer le brouillon
          </button>
        ) : null}
      </form>

      <aside className="stack publish-aside">
        <div className="panel-flush">
          <div className="panel-head">Aperçu dans les listes</div>
          <div className="card" style={{ padding: '12px 16px', borderBottom: 0 }}>
            {photos.photos[0]?.preview ? <img src={photos.photos[0].preview} alt="" className="card-thumb" /> : <span className="card-thumb card-thumb-empty" aria-hidden><ImageIcon /></span>}
            <span className="card-body">
              <span className="card-title">{d.title.trim() || 'Titre de votre annonce'}</span>
              {priceRequired && !(Number(d.price) > 0) ? (
                <span className="price"><span className="price-tag">… FCFA</span></span>
              ) : (
                <PriceTag priceType={d.priceType} priceXaf={priceRequired ? Number(d.price) : null} unit={priceUnit} />
              )}
              <span className="card-meta muted"><span>{cityName}</span><span>à l’instant</span></span>
            </span>
            <span className="preview-heart" aria-hidden><HeartIcon /></span>
          </div>
        </div>
        <div className="panel stack">
          <h2>Pour vendre plus vite</h2>
          <p style={{ margin: 0 }}>Des photos nettes, à la lumière du jour, sous plusieurs angles.</p>
          <p style={{ margin: 0 }}>Un prix proche de celui des annonces similaires.</p>
          <p style={{ margin: 0 }}>L’état réel de l’article, défauts compris : les acheteurs vous font confiance.</p>
        </div>
        <p className="muted lock-note"><LockIcon />Votre numéro n’apparaît jamais dans l’annonce : il n’est donné qu’aux acheteurs connectés qui vous contactent, et jamais si vous choisissez la messagerie uniquement.</p>
      </aside>
    </div>
  );
}

function RecapBlock({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <section className="recap-block">
      <div className="recap-head">
        <h3>{title}</h3>
        <button type="button" className="link-button" onClick={onEdit} aria-label={`Modifier : ${title}`}>Modifier</button>
      </div>
      {children}
    </section>
  );
}
