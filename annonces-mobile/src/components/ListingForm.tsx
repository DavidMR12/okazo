import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { Text, TextInput } from './Typography';
import { ApiError } from '../api/client';
import { useCategories, useCities, useCountries, useDistricts, useMe } from '../api/hooks';
import type { PriceType } from '../api/types';
import { usePhotoUploads } from '../hooks/usePhotoUploads';
import { AdType, adTypeLabels, descriptionPlaceholder, PHOTO_OPTIONAL_PARENTS, titlePlaceholder } from '../lib/adType';
import { AttributeFields } from './AttributeFields';
import { CONDITION_LABELS, shortCategory } from '../lib/format';
import { colors, space, type } from '../theme';
import { Button } from './Button';
import { Chip } from './Chip';
import { PhotoStrip } from './PhotoStrip';
import { PriceTag } from './PriceTag';
import { WalletList, WalletLogo, walletName } from './Wallets';
import { dialog } from './Dialog';
import { ensureCamera, ensurePhotos } from '../lib/permissions';

/** Ville « Autres villes » de chaque pays (slug de l’API) : le vendeur saisit le nom de sa ville. */
const OTHER_CITY_SLUG = 'autre';
// Ville ou quartier saisis : mêmes règles que l’API (lettres, 2 à 60 caractères, pas de chiffres)
const PLACE_NAME = /^[\p{L}\p{M}][\p{L}\p{M} '’.()-]*$/u;
const placeError = (v: string, what: string) =>
  v.trim().length < 2 ? `Indiquez le nom de votre ${what}.` : !PLACE_NAME.test(v.trim()) ? 'Lettres uniquement, sans chiffres.' : null;
const PRICE_TYPES: { value: PriceType; label: string }[] = [
  { value: 'fixed', label: 'Prix fixe' },
  { value: 'negotiable', label: 'À débattre' },
  { value: 'free', label: 'Gratuit' },
  { value: 'contact', label: 'Sur demande' },
];

/** Dépôt en étapes, comme sur LeBonCoin : une question à la fois, puis un récapitulatif avant l'envoi. */
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

export interface ListingDraft {
  adType: AdType;
  attributes?: Record<string, string>; // champs de la catégorie, en texte pendant la saisie
  title: string;
  description: string;
  parentId?: number;
  categoryId?: number;
  cityId?: number;
  districtId?: number | null;
  cityOther?: string; // ville saisie, avec la ville « Autres villes »
  districtOther?: string; // quartier saisi ; défini (même vide) = « Autre quartier » choisi
  handDelivery?: boolean; // remise en main propre ; absent = oui (choix par défaut)
  paymentMethods?: string[]; // portefeuilles électroniques acceptés
  priceType: PriceType;
  price: string;
  condition?: string;
}
/** « Remise en main propre » ne se demande pas pour l’emploi, les services et l’immobilier (même règle que l’API). */
const HAND_DELIVERY_EXCLUDED = ['emploi', 'services', 'immobilier'];

const EMPTY: ListingDraft = { adType: 'offer', title: '', description: '', priceType: 'fixed', price: '' };

/** Valeurs envoyées à l’API, communes à la publication et à la modification. */
export interface ListingValues {
  adType: AdType;
  attributes: Record<string, string | number>;
  categoryId: number;
  cityId: number;
  districtId: number | null;
  cityOther: string | null; // seulement avec la ville « Autres villes »
  districtOther: string | null;
  handDelivery?: boolean; // seulement pour un objet proposé (voir HAND_DELIVERY_EXCLUDED)
  paymentMethods: string[]; // portefeuilles acceptés, parmi ceux du pays (vide : non précisé)
  title: string;
  description: string;
  priceType: PriceType;
  priceXaf: number | null;
  condition: string | null;
  photoKeys: string[];
}

const groupDigits = (d: string) => d.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/**
 * Formulaire d’annonce, partagé par « Publier » et « Modifier ».
 * - stepped : dépôt en étapes avec récapitulatif (publication) ; sinon tout sur une page (modification).
 * - draftKey : brouillon automatique, étape en cours comprise (publication uniquement).
 * - initial / initialPhotos : annonce existante (modification).
 */
export function ListingForm({
  stepped = false,
  draftKey,
  initial,
  initialPhotos,
  header,
  submitLabel,
  onSubmit,
}: {
  stepped?: boolean;
  draftKey?: string;
  initial?: Omit<ListingDraft, 'parentId'>;
  initialPhotos?: { key: string; url: string | null }[];
  header?: ReactNode;
  submitLabel: string;
  onSubmit: (v: ListingValues) => Promise<void>;
}) {
  const me = useMe();
  const categories = useCategories();
  const cities = useCities(me.data?.countryCode);
  const countries = useCountries();
  const photos = usePhotoUploads(8);
  const scroll = useRef<ScrollViewInstance>(null);

  const [d, setD] = useState<ListingDraft>(initial ? { ...EMPTY, ...initial } : EMPTY);
  const districts = useDistricts(d.cityId);
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const restored = useRef(!draftKey);

  // Annonce existante : photos déjà en ligne
  useEffect(() => {
    if (initialPhotos?.length) photos.addExisting(initialPhotos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Annonce existante : retrouve la catégorie parente pour afficher les bonnes puces
  useEffect(() => {
    if (d.parentId || !d.categoryId || !categories.data) return;
    const parent = categories.data.find((c) => c.id === d.categoryId || c.children?.some((x) => x.id === d.categoryId));
    if (parent) setD((x) => ({ ...x, parentId: parent.id }));
  }, [categories.data, d.categoryId, d.parentId]);

  // Brouillon (publication) : un appel, une coupure ou une fermeture de l’app ne font rien perdre.
  // Les photos ne sont pas gardées (elles sont sur le téléphone) : on reprend au plus tard à l’étape Photos.
  useEffect(() => {
    if (!draftKey) return;
    AsyncStorage.getItem(draftKey)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as ListingDraft & { step?: number };
        const { step: savedStep, ...draft } = saved;
        setD({ ...EMPTY, ...draft });
        if (stepped && savedStep) setStep(Math.min(savedStep, STEPS.findIndex((s) => s.key === 'photos')));
      })
      .catch(() => undefined)
      .finally(() => {
        restored.current = true;
      });
  }, [draftKey, stepped]);
  useEffect(() => {
    if (!draftKey || !restored.current) return;
    const t = setTimeout(() => void AsyncStorage.setItem(draftKey, JSON.stringify({ ...d, step })).catch(() => undefined), 800);
    return () => clearTimeout(t);
  }, [d, step, draftKey]);

  // Ville du profil par défaut
  useEffect(() => {
    if (!d.cityId && me.data?.cityId) setD((x) => ({ ...x, cityId: me.data!.cityId! }));
  }, [me.data?.cityId, d.cityId]);

  const set = <K extends keyof ListingDraft>(k: K, v: ListingDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  const parent = categories.data?.find((c) => c.id === d.parentId);
  const sub = parent?.children?.find((c) => c.id === d.categoryId);
  // Identité exigée seulement pour PROPOSER dans une catégorie sensible (même règle que l'API)
  const needsIdentity =
    d.adType === 'offer' && !!(parent?.requiresVerification || sub?.requiresVerification) && me.data?.verificationLevel !== 'identity';
  const labels = adTypeLabels(parent?.slug);
  const askHandDelivery = d.adType === 'offer' && !!parent && !HAND_DELIVERY_EXCLUDED.includes(parent.slug);
  const handDelivery = d.handDelivery ?? true;
  // Portefeuilles du pays du compte ; pas pour une demande ni l'emploi
  const countryWallets = countries.data?.find((c) => c.code === me.data?.countryCode)?.wallets ?? [];
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
  const uploading = photos.photos.length > 0 && !photos.ready && !photos.hasErrors;
  const priceTitle = form ? (d.adType === 'request' ? form.price.requestLabel : form.price.label) : 'Prix';

  const isOtherCity = cities.data?.find((c) => c.id === d.cityId)?.slug === OTHER_CITY_SLUG;
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!photos.photos.length && !photosOptional) e.photos = 'Ajoutez au moins une photo.';
    if (d.title.trim().length < 5) e.title = 'Le titre doit faire au moins 5 caractères.';
    if (d.description.trim().length < 10) e.description = 'Décrivez votre article en quelques phrases.';
    if (!d.categoryId) e.category = 'Choisissez une catégorie.';
    if (!d.cityId) e.city = 'Choisissez une ville.';
    else if (isOtherCity) {
      const m = placeError(d.cityOther ?? '', 'ville');
      if (m) e.city = m;
    }
    if (d.districtOther !== undefined && !d.districtId && d.districtOther.trim()) {
      const m = placeError(d.districtOther, 'quartier');
      if (m) e.city = m;
    }
    if (priceRequired && !(Number(d.price) > 0)) e.price = 'Indiquez un prix.';
    for (const fl of form?.fields ?? []) {
      const v = attrs[fl.key];
      if (!v) {
        if (fl.required && d.adType === 'offer') e[`attr_${fl.key}`] = 'Ce champ est obligatoire.';
      } else if (fl.type === 'number' && ((fl.min !== undefined && Number(v) < fl.min) || (fl.max !== undefined && Number(v) > fl.max))) {
        e[`attr_${fl.key}`] = `Indiquez une valeur entre ${fl.min ?? 0} et ${fl.max}.`;
      }
    }
    if (form && !form.price.types.includes(d.priceType)) e.price = 'Choisissez un type de prix.';
    return e;
  }, [d, attrs, form, photos.photos.length, priceRequired, photosOptional, isOtherCity]);

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
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const stepHasErrors = (i: number) =>
    Object.keys(errors).some((k) => stepOfError(k) === STEPS[i].key) || (STEPS[i].key === 'category' && needsIdentity);
  const next = () => {
    if (stepHasErrors(step)) {
      setShowErrors(true);
      return;
    }
    goTo(step + 1);
  };

  const pickPhotos = () => {
    const open = async (source: 'camera' | 'library') => {
      // Accès expliqué en français avant la demande du système (photos : seulement sur téléphone, le web n'en demande pas)
      if (source === 'camera' && !(await ensureCamera())) return;
      if (source === 'library' && Platform.OS !== 'web' && !(await ensurePhotos())) return;
      const res =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsMultipleSelection: true,
              selectionLimit: Math.max(photos.remaining, 1),
              orderedSelection: true,
              quality: 1,
            });
      if (!res.canceled) photos.add(res.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height })));
    };
    dialog('Ajouter des photos', undefined, [
      { text: 'Prendre une photo', onPress: () => void open('camera') },
      { text: 'Choisir dans la galerie', onPress: () => void open('library') },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  const clearDraft = () => {
    setD({ ...EMPTY, cityId: d.cityId });
    photos.reset();
    setShowErrors(false);
    setStep(0);
  };

  const submit = async () => {
    setShowErrors(true);
    if (Object.keys(errors).length || needsIdentity) {
      // En étapes : on renvoie à la première étape à corriger
      if (stepped) {
        const i = STEPS.findIndex((_, n) => stepHasErrors(n));
        if (i >= 0) {
          setStep(i);
          scroll.current?.scrollTo({ y: 0, animated: false });
        }
      }
      return;
    }
    if (photos.hasErrors) {
      dialog('Photos', "Certaines photos n’ont pas pu être envoyées. Touchez-les pour réessayer ou retirez-les.");
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
        cityOther: isOtherCity ? (d.cityOther ?? '').trim() : null,
        districtOther: !d.districtId && d.districtOther?.trim() ? d.districtOther.trim() : null,
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
        await AsyncStorage.removeItem(draftKey).catch(() => undefined);
        clearDraft();
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'IDENTITY_VERIFICATION_REQUIRED') {
        dialog('Vérification requise', e.message, [
          { text: 'Vérifier mon identité', onPress: () => router.push('/verify-identity') },
          { text: 'Annuler', style: 'cancel' },
        ]);
      } else {
        dialog('Annonce', e instanceof ApiError ? e.message : `Envoi impossible.${draftKey ? ' Votre brouillon est conservé.' : ''}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (me.isPending || categories.isPending) return <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />;
  const err = (k: string) => (showErrors && errors[k] ? <Text style={styles.error}>{errors[k]}</Text> : null);
  // Section visible : toutes sur une page, ou seulement celles de l'étape en cours
  const at = (k: StepKey) => !stepped || STEPS[step].key === k;
  const isRecap = stepped && STEPS[step].key === 'recap';
  const publishLabel = uploading ? `Envoi des photos (${photos.done}/${photos.photos.length})…` : submitLabel;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {stepped ? (
        <View style={styles.progress}>
          <Text style={type.small}>
            Étape {step + 1} sur {STEPS.length}
          </Text>
          <Text style={type.title}>{STEPS[step].title}</Text>
          <View style={styles.bars} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEPS.length, now: step + 1 }}>
            {STEPS.map((s, i) => (
              <View key={s.key} style={[styles.bar, i <= step && styles.barDone]} />
            ))}
          </View>
        </View>
      ) : null}

      <ScrollView ref={scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {header}

        {at('category') ? (
          <Section title={stepped ? 'Que proposez-vous ?' : 'Catégorie'}>
            <View style={styles.wrap}>
              {categories.data?.map((c) => (
                <Chip
                  key={c.id}
                  label={shortCategory(c.name)}
                  selected={d.parentId === c.id}
                  onPress={() => setD((x) => ({ ...x, parentId: c.id, categoryId: c.children?.length ? undefined : c.id, condition: undefined, attributes: {} }))}
                />
              ))}
            </View>
            {parent?.children?.length ? (
              <View style={[styles.wrap, styles.subList]}>
                {parent.children.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.name}
                    selected={d.categoryId === c.id}
                    onPress={() =>
                      setD((x) => ({
                        ...x,
                        categoryId: c.id,
                        attributes: {},
                        priceType: !c.form || c.form.price.types.includes(x.priceType) ? x.priceType : c.form.price.types[0],
                      }))
                    }
                  />
                ))}
              </View>
            ) : null}
            {err('category')}
            {parent ? (
              <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel="Type d’annonce">
                {(['offer', 'request'] as const).map((t) => (
                  <Chip key={t} label={labels[t]} selected={d.adType === t} onPress={() => set('adType', t)} />
                ))}
              </View>
            ) : null}
            {needsIdentity ? (
              <View style={styles.notice}>
                <Text style={type.body}>
                  Pour proposer une annonce dans « {sub?.name ?? parent?.name} », vérifiez d’abord votre identité. Cela protège les utilisateurs contre les fausses annonces.
                </Text>
                <Button label="Vérifier mon identité" variant="secondary" onPress={() => router.push('/verify-identity')} />
              </View>
            ) : null}
          </Section>
        ) : null}

        {at('photos') ? (
          <Section
            title="Photos"
            hint={
              photosOptional
                ? 'Facultatives pour cette catégorie. 8 maximum.'
                : 'Des photos nettes, à la lumière du jour. La première est celle affichée dans les listes. 8 maximum.'
            }
          >
            <PhotoStrip photos={photos.photos} remaining={photos.remaining} onAdd={pickPhotos} onRemove={photos.remove} onRetry={photos.retry} onMakeCover={photos.makeCover} />
            {uploading ? <Text style={type.small}>Envoi des photos : {photos.done}/{photos.photos.length}. Continuez, l’envoi se poursuit.</Text> : null}
            {err('photos')}
          </Section>
        ) : null}

        {at('details') && sub && form?.fields.length ? (
          <AttributeFields
            fields={form.fields}
            values={attrs}
            onChange={(k, v) => setD((x) => ({ ...x, attributes: { ...(x.attributes ?? {}), ...{ [k]: v ?? '' } } }))}
            errors={showErrors ? Object.fromEntries(Object.entries(errors).filter(([k]) => k.startsWith('attr_')).map(([k, v]) => [k.slice(5), v])) : {}}
            showRequired={d.adType === 'offer'}
          />
        ) : null}

        {at('details') ? (
          <>
            <Section title="Titre">
              <TextInput value={d.title} onChangeText={(v) => set('title', v)} placeholder={titlePlaceholder(parent?.slug, d.adType)} placeholderTextColor={colors.inkMuted} maxLength={120} style={styles.input} />
              {err('title')}
            </Section>

            <Section title="Description" hint="Les acheteurs vous contactent par la messagerie ou WhatsApp : inutile d’écrire votre numéro.">
              <TextInput
                value={d.description}
                onChangeText={(v) => set('description', v)}
                placeholder={descriptionPlaceholder(parent?.slug, d.adType)}
                placeholderTextColor={colors.inkMuted}
                multiline
                maxLength={5000}
                style={[styles.input, styles.multiline]}
              />
              {err('description')}
            </Section>

            {showCondition ? (
              <Section title="État" hint="Facultatif">
                <View style={styles.wrap}>
                  {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                    <Chip key={value} label={label} selected={d.condition === value} onPress={() => set('condition', d.condition === value ? undefined : value)} />
                  ))}
                </View>
              </Section>
            ) : null}
          </>
        ) : null}

        {at('price') ? (
          <Section title={priceTitle} hint={stepped ? 'Un prix proche de celui des annonces similaires part plus vite.' : undefined}>
            <View style={styles.wrap}>
              {priceTypes.map((p) => (
                <Chip key={p.value} label={p.label} selected={d.priceType === p.value} onPress={() => set('priceType', p.value)} />
              ))}
            </View>
            {priceRequired ? (
              <View style={styles.priceRow}>
                <TextInput
                  value={groupDigits(d.price)}
                  onChangeText={(v) => set('price', v.replace(/\D/g, '').replace(/^0+/, '').slice(0, 11))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.inkMuted}
                  style={styles.priceInput}
                  accessibilityLabel="Prix en francs CFA"
                />
                <Text style={styles.currency}>{priceUnit ? `FCFA / ${priceUnit}` : 'FCFA'}</Text>
              </View>
            ) : null}
            {err('price')}
          </Section>
        ) : null}

        {at('place') ? (
          <Section title="Ville" hint={stepped ? 'Les acheteurs voient la ville, jamais votre adresse.' : undefined}>
            <View style={styles.wrap}>
              {cities.data?.map((c) => (
                <Chip key={c.id} label={c.slug === OTHER_CITY_SLUG ? 'Autre ville' : c.name} selected={d.cityId === c.id}
                  onPress={() => setD((x) => (x.cityId === c.id ? x : { ...x, cityId: c.id, districtId: null, districtOther: undefined }))} />
              ))}
            </View>
            {isOtherCity ? (
              <TextInput value={d.cityOther ?? ''} onChangeText={(v) => set('cityOther', v)} placeholder="Nom de votre ville (ex. : Kribi)" placeholderTextColor={colors.inkMuted}
                maxLength={60} accessibilityLabel="Nom de votre ville" style={[styles.input, styles.placeOther]} />
            ) : null}
            {err('city')}
          </Section>
        ) : null}
        {at('place') && d.cityId && (districts.data?.length || isOtherCity) ? (
          <Section title="Quartier" hint="Facultatif. Il aide les acheteurs proches ; votre adresse n’est jamais affichée.">
            {districts.data?.length ? (
              <View style={styles.wrap}>
                <Chip label="Ne pas préciser" selected={!d.districtId && d.districtOther === undefined} onPress={() => setD((x) => ({ ...x, districtId: null, districtOther: undefined }))} />
                {districts.data.map((x) => (
                  <Chip key={x.id} label={x.name} selected={d.districtId === x.id} onPress={() => setD((y) => ({ ...y, districtId: x.id, districtOther: undefined }))} />
                ))}
                <Chip label="Autre quartier" selected={!d.districtId && d.districtOther !== undefined} onPress={() => setD((x) => ({ ...x, districtId: null, districtOther: x.districtOther ?? '' }))} />
              </View>
            ) : null}
            {!d.districtId && (d.districtOther !== undefined || !districts.data?.length) ? (
              <TextInput value={d.districtOther ?? ''} onChangeText={(v) => set('districtOther', v)} placeholder="Nom du quartier" placeholderTextColor={colors.inkMuted}
                maxLength={60} accessibilityLabel="Nom du quartier" style={[styles.input, styles.placeOther]} />
            ) : null}
          </Section>
        ) : null}

        {at('price') && askWallets ? (
          <Section title="Paiement électronique accepté" hint="Facultatif. L’acheteur vous paie directement, à la remise de l’article : rien ne passe par l’application.">
            <View style={styles.wrap}>
              {countryWallets.map((w) => (
                <Pressable
                  key={w}
                  onPress={() => set('paymentMethods', wallets.includes(w) ? wallets.filter((x) => x !== w) : [...wallets, w])}
                  style={[styles.walletChip, wallets.includes(w) && styles.walletChipOn]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: wallets.includes(w) }}
                  accessibilityLabel={walletName(w)}
                >
                  <WalletLogo code={w} height={22} />
                  <Text style={styles.walletText}>{walletName(w)}</Text>
                </Pressable>
              ))}
            </View>
          </Section>
        ) : null}

        {at('place') && askHandDelivery ? (
          <Section title="Mode de remise" hint="Vous rencontrez l’acheteur : il vérifie l’article et paie à la remise.">
            <View style={styles.wrap}>
              <Chip label="Remise en main propre" selected={handDelivery} onPress={() => set('handDelivery', true)} />
              <Chip label="Non" selected={!handDelivery} onPress={() => set('handDelivery', false)} />
            </View>
          </Section>
        ) : null}

        {isRecap ? (
          <View style={styles.recap}>
            <Text style={type.body}>Vérifiez votre annonce avant de l’envoyer.</Text>
            <RecapBlock title="Catégorie" onEdit={() => goTo(0)}>
              <Text style={type.body}>{[parent?.name, sub?.name].filter(Boolean).join(' › ') || '—'}</Text>
              <Text style={type.small}>{labels[d.adType]}</Text>
            </RecapBlock>
            <RecapBlock title={`Photos (${photos.photos.length})`} onEdit={() => goTo(1)}>
              {photos.photos.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
                  {photos.photos.map((p) => (
                    <Image key={p.id} source={{ uri: p.uri }} style={styles.recapThumb} contentFit="cover" />
                  ))}
                </ScrollView>
              ) : (
                <Text style={type.small}>Aucune photo</Text>
              )}
            </RecapBlock>
            <RecapBlock title="Détails" onEdit={() => goTo(2)}>
              <Text style={type.heading}>{d.title.trim()}</Text>
              {facts.map((f) => (
                <Text key={f.label} style={type.body}>
                  <Text style={styles.factLabel}>{f.label} : </Text>
                  {f.value}
                </Text>
              ))}
              {showCondition && d.condition ? (
                <Text style={type.body}>
                  <Text style={styles.factLabel}>État : </Text>
                  {CONDITION_LABELS[d.condition as keyof typeof CONDITION_LABELS]}
                </Text>
              ) : null}
              <Text style={type.body} numberOfLines={4}>
                {d.description.trim()}
              </Text>
            </RecapBlock>
            <RecapBlock title={priceTitle} onEdit={() => goTo(3)}>
              <PriceTag priceType={d.priceType} priceXaf={priceRequired ? Number(d.price) : null} unit={priceUnit} />
              {askWallets && wallets.length ? <WalletList codes={wallets} /> : null}
            </RecapBlock>
            <RecapBlock title="Lieu" onEdit={() => goTo(4)}>
              <Text style={type.body}>
                {[districts.data?.find((x) => x.id === d.districtId)?.name ?? (d.districtOther?.trim() || null), isOtherCity ? d.cityOther?.trim() : cities.data?.find((c) => c.id === d.cityId)?.name].filter(Boolean).join(', ') || '—'}
              </Text>
              {askHandDelivery ? <Text style={type.small}>{handDelivery ? 'Remise en main propre' : 'Pas de remise en main propre'}</Text> : null}
            </RecapBlock>
          </View>
        ) : null}

        {!stepped ? (
          <>
            <Button label={publishLabel} onPress={() => void submit()} loading={submitting} disabled={uploading || needsIdentity} style={{ marginTop: space.md }} />
            <Text style={[type.small, { textAlign: 'center' }]}>Chaque annonce est vérifiée avant sa mise en ligne.</Text>
          </>
        ) : null}
        {isRecap ? <Text style={[type.small, { textAlign: 'center' }]}>Chaque annonce est vérifiée avant sa mise en ligne, en général en quelques minutes.</Text> : null}
        {draftKey && (!stepped || step === 0 || isRecap) ? (
          <Pressable
            onPress={() =>
              dialog('Effacer le brouillon ?', 'Le texte, les choix et les photos saisis seront supprimés. Cette action est définitive.', [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Effacer', style: 'destructive', onPress: clearDraft },
              ])
            }
            style={({ pressed }) => [styles.clear, pressed && { backgroundColor: '#FFE2DF' }]}
            accessibilityRole="button"
          >
            <View style={styles.clearIcon}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </View>
            <Text style={styles.clearText}>Effacer le brouillon</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {stepped ? (
        <View style={styles.footer}>
          {step > 0 ? <Button label="Retour" variant="secondary" onPress={() => goTo(step - 1)} style={styles.back} /> : null}
          {isRecap ? (
            <Button label={publishLabel} onPress={() => void submit()} loading={submitting} disabled={uploading || needsIdentity} style={styles.forward} />
          ) : (
            <Button label="Continuer" onPress={next} style={styles.forward} />
          )}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{title}</Text>
      {hint ? <Text style={type.small}>{hint}</Text> : null}
      {children}
    </View>
  );
}

function RecapBlock({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <View style={styles.recapBlock}>
      <View style={styles.recapHead}>
        <Text style={styles.recapTitle}>{title}</Text>
        <Pressable onPress={onEdit} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Modifier : ${title}`}>
          <Text style={styles.edit}>Modifier</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  walletChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.bg },
  walletChipOn: { borderColor: colors.primary, backgroundColor: colors.tint },
  walletText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  container: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl * 2 },
  section: { gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  subList: { paddingLeft: space.md, borderLeftWidth: 2, borderLeftColor: colors.line },
  placeOther: { marginTop: space.sm },
  input: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 10, paddingHorizontal: space.md, minHeight: 48, fontSize: 16, color: colors.ink },
  multiline: { minHeight: 120, paddingTop: space.md, textAlignVertical: 'top' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  priceInput: { flex: 1, minWidth: 0, borderWidth: 1.5, borderColor: colors.line, borderRadius: 10, paddingHorizontal: space.md, height: 54, fontSize: 22, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
  currency: { fontSize: 18, fontWeight: '700', color: colors.inkMuted },
  notice: { backgroundColor: colors.warningBg, borderRadius: 10, padding: space.lg, gap: space.md },
  error: { color: colors.danger, fontSize: 14 },
  // « Effacer le brouillon » : bouton ovale rouge pâle, comme « Supprimer mon compte »
  clear: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, alignSelf: 'center', marginTop: space.md, paddingVertical: 8, paddingLeft: 8, paddingRight: space.lg, borderRadius: 999, borderWidth: 1, borderColor: '#F2D4D0', backgroundColor: '#FFF8F7' },
  clearIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFE9E6', alignItems: 'center', justifyContent: 'center' },
  clearText: { fontSize: 15, fontWeight: '700', color: colors.danger },
  progress: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.md, gap: space.xs, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.bg },
  bars: { flexDirection: 'row', gap: space.xs, marginTop: space.sm },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.tintLine },
  barDone: { backgroundColor: colors.primary },
  footer: { flexDirection: 'row', gap: space.md, padding: space.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
  back: { flex: 1 },
  forward: { flex: 2 },
  recap: { gap: space.md },
  recapBlock: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: space.lg, gap: space.xs },
  recapHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.xs },
  recapTitle: { fontSize: 13, color: colors.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  edit: { color: colors.primary, fontSize: 15 },
  factLabel: { color: colors.inkMuted },
  recapThumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: colors.surface },
});
