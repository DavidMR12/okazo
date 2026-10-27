import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text, TextInput } from '../../src/components/Typography';
import { ApiError } from '../../src/api/client';
import { useCountries, useMe, useMyVerification, useUpdateProfile } from '../../src/api/hooks';
import { useAuth } from '../../src/auth/AuthProvider';
import { SITE_URL, SUPPORT_EMAIL } from '../../src/brand';
import { Avatar, EmptyCard, TileRow } from '../../src/components/Blocks';
import { Button } from '../../src/components/Button';
import { DetailCard } from '../../src/components/DetailCard';
import { setDataSaver, useNetwork } from '../../src/lib/network';
import { colors, space } from '../../src/theme';
import { dialog } from '../../src/components/Dialog';

const APP_VERSION = Constants.expoConfig?.version ?? '—';
// « 2026-10-15 » → « 15 octobre 2026 »
const frenchDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * « Mon compte » : carte de profil, puis des cadres comme sur le site (activité, profil et contact, sécurité),
 * la suppression du compte en bas, en rouge (demande du porteur, 20 octobre 2026).
 */
export default function AccountScreen() {
  const { status, signOut } = useAuth();
  const me = useMe();
  const verification = useMyVerification();
  const update = useUpdateProfile();
  const countries = useCountries();
  const [name, setName] = useState('');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reprise du nom enregistré à l’affichage
    if (me.data) setName(me.data.displayName);
  }, [me.data]);

  if (status !== 'signedIn') {
    return (
      <View style={styles.padded}>
        <EmptyCard
          icon="person-outline"
          text="Connectez-vous pour publier, contacter les vendeurs et retrouver vos favoris sur tous vos appareils."
          action="Se connecter"
          onAction={() => router.push('/login')}
          decor={['person-outline', 'pricetags-outline', 'heart-outline', 'chatbubbles-outline', 'shield-checkmark-outline']}
        />
      </View>
    );
  }
  if (me.isPending) return <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />;
  if (!me.data) {
    return (
      <View style={styles.padded}>
        <EmptyCard icon="cloud-offline-outline" text="Impossible de charger votre compte." action="Réessayer" onAction={() => void me.refetch()} />
      </View>
    );
  }

  const saveName = () =>
    update.mutate(
      { displayName: name.trim() },
      { onError: (e) => dialog('Nom affiché', e instanceof ApiError ? e.message : 'Enregistrement impossible.') },
    );

  const v = verification.data;
  const verified = v?.level === 'identity';
  const verificationHint = verified
    ? 'Votre identité est vérifiée : un badge rassure les acheteurs.'
    : v?.request?.status === 'pending'
      ? 'Vérification en cours (48 h maximum).'
      : v?.request?.status === 'rejected'
        ? `Vérification refusée : ${v.request.rejectionReason ?? ''}`
        : 'Obligatoire pour l’immobilier et les véhicules.';
  const canVerify = !verified && v?.request?.status !== 'pending';
  const nameChanged = name.trim().length >= 2 && name.trim() !== me.data.displayName;
  const countryName = countries.data?.find((c) => c.code === me.data.countryCode)?.name ?? me.data.countryCode;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" style={{ backgroundColor: colors.bg }}>
      {/* Carte de profil */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroAvatar}>
            <Avatar name={me.data.displayName} size={60} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.heroName} numberOfLines={2}>{me.data.displayName}</Text>
            <View style={styles.heroLine}>
              <Ionicons name="call-outline" size={15} color="#fff" />
              <Text style={styles.heroText}>{me.data.phone ?? 'Aucun numéro vérifié'}</Text>
            </View>
            {me.data.email ? (
              <View style={styles.heroLine}>
                <Ionicons name="mail-outline" size={15} color="#fff" />
                <Text style={styles.heroText} numberOfLines={1}>{me.data.email}</Text>
              </View>
            ) : null}
            <View style={[styles.heroBadge, verified && styles.heroBadgeOk]}>
              <Ionicons name={verified ? 'shield-checkmark' : 'shield-outline'} size={14} color={verified ? colors.trust : '#fff'} />
              <Text style={[styles.heroBadgeText, verified && { color: colors.trust }]}>{verified ? 'Identité vérifiée' : 'Identité non vérifiée'}</Text>
            </View>
          </View>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/publish')} style={({ pressed }) => [styles.publish, pressed && { opacity: 0.9 }]} accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={styles.publishText}>Publier une annonce</Text>
        </Pressable>
      </View>

      {!me.data.phone ? (
        <Pressable onPress={() => router.push('/verify-phone')} style={styles.phoneWarn} accessibilityRole="button">
          <Text style={styles.small}>Pas encore de numéro vérifié : il en faut un pour publier, contacter ou écrire.</Text>
          <Text style={styles.phoneLink}>Vérifier mon numéro ›</Text>
        </Pressable>
      ) : null}
      {me.data.status === 'suspended' ? <Text style={styles.warning}>Compte suspendu : vous ne pouvez pas publier pour le moment.</Text> : null}

      <DetailCard icon="grid-outline" title="Mon activité">
        <View style={styles.list}>
          <TileRow icon="pricetags-outline" label="Mes annonces" hint="Gérer vos annonces en ligne" onPress={() => router.push('/my-listings')} />
          <TileRow icon="chatbubbles-outline" label="Messages" hint="Vos conversations" onPress={() => router.push('/(tabs)/messages')} />
          <TileRow icon="heart-outline" label="Mes favoris" hint="Les annonces gardées" onPress={() => router.push('/favorites')} />
          <TileRow icon="notifications-outline" label="Mes recherches" hint="Alertes de nouvelles annonces" onPress={() => router.push('/saved-searches')} />
          <TileRow icon="briefcase-outline" label="Mes candidatures" hint="Offres d’emploi" onPress={() => router.push('/applications')} />
        </View>
      </DetailCard>

      <DetailCard icon="person-outline" title="Profil et contact">
        <View style={styles.list}>
          <Text style={styles.label}>Nom affiché sur vos annonces</Text>
          <View style={styles.inline}>
            <TextInput value={name} onChangeText={setName} maxLength={60} style={styles.input} accessibilityLabel="Nom affiché" placeholderTextColor={colors.inkMuted} />
            <Button label="Enregistrer" onPress={saveName} loading={update.isPending} disabled={!nameChanged} />
          </View>
          <TileRow
            icon="chatbox-ellipses-outline"
            label="Messagerie uniquement"
            hint="Votre numéro n’est jamais donné : les acheteurs vous écrivent dans l’application."
            right={
              <Switch
                value={me.data.contactPreference === 'messages_only'}
                onValueChange={(on) =>
                  update.mutate(
                    { contactPreference: on ? 'messages_only' : 'all' },
                    { onError: (e) => dialog('Préférence', e instanceof ApiError ? e.message : 'Enregistrement impossible.') },
                  )
                }
                trackColor={{ true: colors.primary, false: colors.line }}
                thumbColor="#fff"
                accessibilityLabel="Être contacté uniquement par la messagerie"
              />
            }
          />
        </View>
      </DetailCard>

      <DetailCard icon="lock-closed-outline" title="Sécurité">
        <View style={styles.list}>
          <TileRow
            icon={verified ? 'shield-checkmark-outline' : 'id-card-outline'}
            label="Vérification d’identité"
            hint={verificationHint}
            onPress={canVerify ? () => router.push('/verify-identity') : undefined}
          />
          <Button label="Se déconnecter" variant="secondary" onPress={() => void signOut()} />
        </View>
      </DetailCard>

      <DetailCard icon="settings-outline" title="Paramètres de l’application">
        <View style={styles.list}>
          <DataSaverRow />
          <TileRow icon="notifications-outline" label="Notifications" hint="Messages, offres et alertes de recherche : à régler dans le téléphone." onPress={() => void Linking.openSettings()} />
          <TileRow icon="earth-outline" label="Pays" hint={countryName} />
          <TileRow icon="language-outline" label="Langue" hint="Français" />
          <TileRow icon="phone-portrait-outline" label="Version de l’application" hint={APP_VERSION} />
        </View>
      </DetailCard>

      <DetailCard icon="help-buoy-outline" title="Aide et contact">
        <View style={styles.list}>
          <TileRow icon="help-circle-outline" label="Centre d’aide" hint="Questions fréquentes" onPress={() => router.push('/help')} />
          <TileRow icon="shield-checkmark-outline" label="Conseils de sécurité" hint="Acheter et vendre sans risque" onPress={() => router.push('/help')} />
          <TileRow
            icon="mail-outline"
            label="Nous contacter"
            hint={SUPPORT_EMAIL || 'Adresse de contact bientôt disponible'}
            onPress={SUPPORT_EMAIL ? () => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`) : undefined}
          />
        </View>
      </DetailCard>

      <DetailCard icon="document-text-outline" title="Informations juridiques">
        <View style={styles.list}>
          <TileRow icon="reader-outline" label="Conditions d’utilisation" hint={me.data.termsVersion ? `Version du ${frenchDate(me.data.termsVersion)}` : undefined} onPress={() => void Linking.openURL(`${SITE_URL}/conditions`)} />
          <TileRow icon="lock-closed-outline" label="Confidentialité" hint="Vos données et vos droits" onPress={() => void Linking.openURL(`${SITE_URL}/confidentialite`)} />
          <TileRow icon="flag-outline" label="Signaler un contenu illicite" hint="Arnaque, contrefaçon, contenu interdit : comment faire" onPress={() => router.push('/help')} />
        </View>
      </DetailCard>

      <DetailCard icon="sparkles-outline" title={`Nos offres`} chip="Bientôt" chipIcon="time-outline">
        <View style={styles.list}>
          <TileRow icon="flame-outline" label="Annonce à la une" hint="Votre annonce en tête de l’accueil, avec le badge « À la une »." right={<Soon />} />
          <TileRow icon="arrow-up-circle-outline" label="Remontée en tête de liste" hint="Votre annonce revient en haut des résultats, comme neuve." right={<Soon />} />
          <TileRow icon="storefront-outline" label="Vitrine professionnelle" hint="Pour les commerçants : page boutique et annonces illimitées." right={<Soon />} />
          <Text style={styles.offersNote}>Paiement par Mobile Money (MTN, Orange, Airtel, Moov…) à l’ouverture des offres.</Text>
        </View>
      </DetailCard>

      <Pressable onPress={() => router.push('/delete-account')} style={styles.delete} accessibilityRole="button">
        <Ionicons name="trash-outline" size={18} color={colors.danger} />
        <Text style={styles.deleteText}>Supprimer mon compte</Text>
      </Pressable>
    </ScrollView>
  );
}

/** Étiquette « Bientôt » des offres payantes (pas encore ouvertes). */
function Soon() {
  return (
    <View style={styles.soon}>
      <Text style={styles.soonText}>Bientôt</Text>
    </View>
  );
}

/** Économie de données : pas de préchargement, photos en miniature, envois plus légers (automatique en 2G/3G). */
function DataSaverRow() {
  const net = useNetwork();
  return (
    <TileRow
      icon="cellular-outline"
      label="Économie de données"
      hint={net.slow && !net.saver ? 'Activée automatiquement : réseau lent.' : 'Photos plus légères, aucun préchargement.'}
      right={<Switch value={net.saver} onValueChange={setDataSaver} trackColor={{ true: colors.primary, false: colors.line }} thumbColor="#fff" accessibilityLabel="Économie de données" />}
    />
  );
}

const styles = StyleSheet.create({
  padded: { flex: 1, padding: space.lg, backgroundColor: colors.bg },
  container: { paddingBottom: space.xxl * 2 },
  hero: { margin: space.lg, marginBottom: 0, padding: space.lg, borderRadius: 20, backgroundColor: colors.navy, gap: space.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  heroAvatar: { borderRadius: 34, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', padding: 2 },
  heroName: { fontSize: 20, fontWeight: '800', color: '#fff' },
  heroLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroText: { fontSize: 14, color: '#fff', opacity: 0.92, flexShrink: 1 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)' },
  heroBadgeOk: { backgroundColor: '#DDF5E9' },
  heroBadgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  publish: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 12, backgroundColor: '#fff' },
  publishText: { fontSize: 16, fontWeight: '700', color: colors.primary },
  phoneWarn: { marginHorizontal: space.lg, marginTop: space.lg, backgroundColor: colors.warningBg, borderRadius: 12, padding: space.md, gap: 4 },
  phoneLink: { color: colors.primary, fontSize: 14 },
  small: { fontSize: 13, lineHeight: 18, color: colors.ink },
  warning: { color: colors.danger, fontSize: 14, marginHorizontal: space.lg, marginTop: space.md },
  list: { gap: space.sm },
  label: { fontSize: 13, color: colors.inkMuted },
  inline: { gap: space.sm, marginBottom: space.xs },
  input: { height: 48, borderWidth: 1.5, borderColor: colors.line, borderRadius: 12, paddingHorizontal: space.md, fontSize: 16, color: colors.ink },
  delete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: space.lg,
    marginTop: space.lg,
    justifyContent: 'center',
    padding: space.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#F2D4D0',
    backgroundColor: '#FFF8F7',
  },
  deleteText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
  soon: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#FFF4D6' },
  soonText: { fontSize: 11, fontWeight: '800', color: '#8A5A00' },
  offersNote: { fontSize: 12, lineHeight: 18, color: colors.inkMuted, textAlign: 'center', marginTop: 2 },
});
