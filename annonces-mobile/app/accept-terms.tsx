import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { api, ApiError } from '../src/api/client';
import { useMe } from '../src/api/hooks';
import { BRAND_NAME, SITE_URL } from '../src/brand';
import { Button } from '../src/components/Button';
import { Text } from '../src/components/Typography';
import { colors, space, type } from '../src/theme';

/**
 * Acceptation explicite des CGU (interrupteur à cocher), demandée après la connexion et à chaque nouvelle version.
 * L'API garde chaque acceptation (version, date, IP, appareil) : c'est la preuve en cas de litige.
 * Ensuite : vérification du numéro si le compte n'en a pas (e-mail, Google).
 */
export default function AcceptTermsScreen() {
  const { phoneRequired } = useLocalSearchParams<{ phoneRequired?: string }>();
  const me = useMe();
  const qc = useQueryClient();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    const version = (me.data as { termsVersion?: string } | undefined)?.termsVersion;
    if (!version) return;
    setBusy(true);
    setError(null);
    try {
      await api('/me/terms', { method: 'POST', auth: true, body: { version, platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'web' ? 'web' : 'android' } });
      void qc.invalidateQueries({ queryKey: ['me'] });
      router.back();
      if (phoneRequired === '1' || !me.data?.phone) router.push({ pathname: '/verify-phone', params: { welcome: '1' } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  };

  const points = [
    `${BRAND_NAME} met en relation acheteurs et vendeurs ; nous ne sommes partie à aucune vente et aucun paiement ne passe par nous.`,
    'Ne payez jamais à l’avance : vérifiez l’article et payez à la remise.',
    'Vous êtes responsable de vos annonces et de vos messages ; les fraudes sont sanctionnées et signalées aux autorités.',
    'Litiges : réclamation écrite et règlement amiable d’abord ; droit camerounais, tribunaux de Douala.',
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={type.title}>Conditions d’utilisation</Text>
      <Text style={type.body}>Pour publier, contacter un vendeur, écrire ou postuler, lisez et acceptez nos conditions. En bref :</Text>
      <View style={{ gap: space.sm }}>
        {points.map((p) => (
          <Text key={p} style={type.body}>•  {p}</Text>
        ))}
      </View>
      <Text style={styles.link} onPress={() => void Linking.openURL(`${SITE_URL}/conditions`)} accessibilityRole="link">Lire les conditions complètes ›</Text>
      <Pressable style={styles.check} onPress={() => setChecked((c) => !c)} accessibilityRole="checkbox" accessibilityState={{ checked }}>
        <Switch value={checked} onValueChange={setChecked} trackColor={{ true: colors.primary, false: colors.line }} />
        <Text style={[type.body, { flex: 1 }]}>J’ai lu et j’accepte les conditions générales d’utilisation et la politique de confidentialité.</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label="Accepter et continuer" onPress={() => void accept()} loading={busy} disabled={!checked || !me.data} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.xl, gap: space.lg },
  link: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  check: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: 12, backgroundColor: colors.tint },
  error: { color: colors.danger, fontSize: 14 },
});
