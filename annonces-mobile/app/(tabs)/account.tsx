import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text, TextInput } from '../../src/components/Typography';
import { ApiError } from '../../src/api/client';
import { useMe, useMyVerification, useUpdateProfile } from '../../src/api/hooks';
import { useAuth } from '../../src/auth/AuthProvider';
import { Button } from '../../src/components/Button';
import { Message } from '../../src/components/Message';
import { VerifiedBadge } from '../../src/components/VerifiedBadge';
import { setDataSaver, useNetwork } from '../../src/lib/network';
import { colors, space, type } from '../../src/theme';

export default function AccountScreen() {
  const { status, signOut } = useAuth();
  const me = useMe();
  const verification = useMyVerification();
  const update = useUpdateProfile();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    if (me.data) setName(me.data.displayName);
  }, [me.data]);

  if (status !== 'signedIn') {
    return (
      <Message
        title="Connectez-vous"
        body="Pour publier, contacter les vendeurs et retrouver vos favoris sur tous vos appareils."
        actionLabel="Se connecter"
        onAction={() => router.push('/login')}
      />
    );
  }
  if (me.isPending) return <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.primary} />;
  if (!me.data) return <Message title="Impossible de charger votre compte" actionLabel="Réessayer" onAction={() => void me.refetch()} />;

  const saveName = () =>
    update.mutate(
      { displayName: name.trim() },
      {
        onSuccess: () => setEditing(false),
        onError: (e) => Alert.alert('Nom affiché', e instanceof ApiError ? e.message : 'Enregistrement impossible.'),
      },
    );

  const v = verification.data;
  const verificationText =
    v?.level === 'identity'
      ? null
      : v?.request?.status === 'pending'
        ? 'Vérification en cours (48 h maximum)'
        : v?.request?.status === 'rejected'
          ? `Vérification refusée : ${v.request.rejectionReason ?? ''}`
          : "Identité non vérifiée. Obligatoire pour l’immobilier et les véhicules.";

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        {editing ? (
          <View style={{ gap: space.sm }}>
            <TextInput value={name} onChangeText={setName} maxLength={60} autoFocus style={styles.input} accessibilityLabel="Nom affiché" />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button label="Annuler" variant="secondary" onPress={() => { setName(me.data!.displayName); setEditing(false); }} style={{ flex: 1 }} />
              <Button label="Enregistrer" onPress={saveName} loading={update.isPending} disabled={name.trim().length < 2} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setEditing(true)} style={styles.nameRow} accessibilityRole="button" accessibilityHint="Modifier le nom affiché">
            <Text style={type.title}>{me.data.displayName}</Text>
            <Ionicons name="pencil" size={18} color={colors.inkMuted} />
          </Pressable>
        )}
        {me.data.phone ? (
          <Text style={type.small}>{me.data.phone}</Text>
        ) : (
          <Pressable onPress={() => router.push('/verify-phone')} style={styles.phoneWarn} accessibilityRole="button">
            <Text style={type.small}>Pas encore de numéro vérifié : il en faut un pour publier, contacter ou écrire.</Text>
            <Text style={styles.phoneLink}>Vérifier mon numéro ›</Text>
          </Pressable>
        )}
        {v?.level === 'identity' ? <VerifiedBadge /> : verificationText ? <Text style={type.small}>{verificationText}</Text> : null}
        {me.data.status === 'suspended' ? <Text style={styles.warning}>Compte suspendu : vous ne pouvez pas publier pour le moment.</Text> : null}
      </View>

      <View style={styles.pref}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.body, { fontWeight: '600' }]}>Messagerie uniquement</Text>
          <Text style={type.small}>Votre numéro n’est jamais donné : les acheteurs vous écrivent dans l’application.</Text>
        </View>
        <Switch
          value={me.data.contactPreference === 'messages_only'}
          onValueChange={(on) =>
            update.mutate(
              { contactPreference: on ? 'messages_only' : 'all' },
              { onError: (e) => Alert.alert('Préférence', e instanceof ApiError ? e.message : 'Enregistrement impossible.') },
            )
          }
          trackColor={{ true: colors.primary, false: colors.line }}
          accessibilityLabel="Être contacté uniquement par la messagerie"
        />
      </View>

      <View style={styles.menu}>
        <Row icon="pricetags-outline" label="Mes annonces" onPress={() => router.push('/my-listings')} />
        <Row icon="heart-outline" label="Mes favoris" onPress={() => router.push('/favorites')} />
        <Row icon="bookmark-outline" label="Mes recherches" onPress={() => router.push('/saved-searches')} />
        <Row icon="briefcase-outline" label="Mes candidatures" onPress={() => router.push('/applications')} />
        <DataSaverRow />
        {v?.level !== 'identity' && v?.request?.status !== 'pending' ? (
          <Row
            icon="shield-checkmark-outline"
            label="Vérifier mon identité"
            onPress={() => router.push('/verify-identity')}
          />
        ) : null}
        <Row icon="log-out-outline" label="Se déconnecter" onPress={() => void signOut()} />
      </View>

      <Pressable onPress={() => router.push('/delete-account')} style={styles.delete} accessibilityRole="button">
        <Text style={styles.deleteText}>Supprimer mon compte</Text>
      </Pressable>
    </ScrollView>
  );
}

/** Économie de données : pas de préchargement, photos en miniature, envois plus légers (automatique en 2G/3G). */
function DataSaverRow() {
  const net = useNetwork();
  return (
    <View style={styles.row}>
      <Ionicons name="cellular-outline" size={22} color={colors.ink} />
      <View style={{ flex: 1 }}>
        <Text style={type.body}>Économie de données</Text>
        <Text style={type.small}>{net.slow && !net.saver ? 'Activée automatiquement : réseau lent.' : 'Photos plus légères, aucun préchargement.'}</Text>
      </View>
      <Switch
        value={net.saver}
        onValueChange={setDataSaver}
        trackColor={{ true: colors.primary, false: colors.line }}
        thumbColor="#fff"
        accessibilityLabel="Économie de données"
      />
    </View>
  );
}

function Row({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]} accessibilityRole="button">
      <Ionicons name={icon} size={22} color={colors.ink} />
      <Text style={[type.body, { flex: 1 }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  phoneWarn: { backgroundColor: colors.warningBg, borderRadius: 10, padding: space.md, gap: 4, marginTop: space.xs },
  phoneLink: { color: colors.primary, fontSize: 14 },
  container: { paddingBottom: space.xxl },
  card: { padding: space.lg, gap: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 10, height: 48, paddingHorizontal: space.md, fontSize: 18, color: colors.ink },
  warning: { color: colors.danger, fontSize: 14, marginTop: space.xs },
  pref: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  menu: { marginTop: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, height: 56 },
  delete: { padding: space.lg, marginTop: space.xl },
  deleteText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
});
