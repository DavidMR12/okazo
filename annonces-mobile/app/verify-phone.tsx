import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { api, ApiError } from '../src/api/client';
import { useAuthMethods, useCountries } from '../src/api/hooks';
import { Button } from '../src/components/Button';
import { Chip } from '../src/components/Chip';
import { DialCodePicker } from '../src/components/DialCodePicker';
import { Text, TextInput } from '../src/components/Typography';
import { colors, space, type } from '../src/theme';

const FALLBACK = [
  { code: 'CM', name: 'Cameroun', dialCode: '+237' },
  { code: 'GA', name: 'Gabon', dialCode: '+241' },
  { code: 'CG', name: 'Congo', dialCode: '+242' },
];

/**
 * Compte créé avec Google ou Facebook : vérifier un numéro (une seule fois) pour publier, contacter, écrire,
 * faire une offre ou postuler. Code par SMS ou WhatsApp. On peut passer et parcourir en attendant.
 */
export default function VerifyPhoneScreen() {
  const { welcome } = useLocalSearchParams<{ welcome?: string }>();
  const qc = useQueryClient();
  const countries = useCountries();
  const methods = useAuthMethods();
  const list = countries.data?.length ? countries.data : FALLBACK;
  const [country, setCountry] = useState(list[0].code);
  const dial = list.find((c) => c.code === country)?.dialCode ?? list[0].dialCode;
  const [number, setNumber] = useState('');
  const [channel, setChannel] = useState<'sms' | 'whatsapp'>('sms');
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const canWhatsApp = methods.data?.otpChannels.includes('whatsapp') ?? false;

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = async (via = channel) => {
    const target = phone ?? `${dial}${number.replace(/\D/g, '').replace(/^0+/, '')}`;
    setError(null);
    setLoading(true);
    try {
      const r = await api<{ resendAfterSec: number }>('/me/phone/request', { method: 'POST', auth: true, body: { phone: target, channel: via } });
      setPhone(target);
      setChannel(via);
      setWait(r.resendAfterSec);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Envoi impossible. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  const verify = async (value = code) => {
    if (value.length !== 6 || !phone) return;
    setError(null);
    setLoading(true);
    try {
      await api('/me/phone/verify', { method: 'POST', auth: true, body: { phone, code: value } });
      void qc.invalidateQueries({ queryKey: ['me'] });
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Vérification impossible. Réessayez.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {welcome ? <Text style={styles.welcome}>Bienvenue ! Votre compte est créé.</Text> : null}
        {!phone ? (
          <>
            <Text style={type.title}>Vérifiez votre numéro</Text>
            <Text style={type.body}>Une seule fois : il faut un numéro vérifié pour publier, contacter un vendeur, écrire ou postuler. Il n’apparaît jamais dans vos annonces.</Text>
            <View style={styles.inputRow}>
              <DialCodePicker countries={list} value={country} onChange={setCountry} />
              <TextInput value={number} onChangeText={setNumber} placeholder="6 77 12 34 56" placeholderTextColor={colors.inkMuted} keyboardType="phone-pad" style={styles.input} accessibilityLabel="Numéro de téléphone" />
            </View>
            {canWhatsApp ? (
              <View style={styles.chips}>
                <Text style={type.small}>Recevoir le code par</Text>
                <Chip label="SMS" selected={channel === 'sms'} onPress={() => setChannel('sms')} />
                <Chip label="WhatsApp" selected={channel === 'whatsapp'} onPress={() => setChannel('whatsapp')} />
              </View>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button label="Recevoir le code" onPress={() => void send()} loading={loading} disabled={number.replace(/\D/g, '').length < 7} />
          </>
        ) : (
          <>
            <Text style={type.title}>Entrez le code reçu</Text>
            <Text style={type.body}>Code envoyé par {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} au {phone}.</Text>
            <TextInput
              value={code}
              onChangeText={(v) => {
                const clean = v.replace(/\D/g, '').slice(0, 6);
                setCode(clean);
                if (clean.length === 6) void verify(clean);
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={6}
              autoFocus
              style={styles.code}
              placeholder="••••••"
              placeholderTextColor={colors.line}
              accessibilityLabel="Code à 6 chiffres"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button label="Valider" onPress={() => void verify()} loading={loading} disabled={code.length !== 6} />
            <Button label={wait > 0 ? `Renvoyer le code dans ${wait} s` : 'Renvoyer le code'} variant="secondary" disabled={wait > 0} onPress={() => void send()} />
            {canWhatsApp && wait <= 0 ? (
              <Pressable onPress={() => void send(channel === 'sms' ? 'whatsapp' : 'sms')} accessibilityRole="button">
                <Text style={styles.link}>Recevoir plutôt par {channel === 'sms' ? 'WhatsApp' : 'SMS'}</Text>
              </Pressable>
            ) : null}
          </>
        )}
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.later}>Plus tard</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.xl, gap: space.lg },
  welcome: { backgroundColor: '#E3F3EA', color: colors.trust, borderRadius: 10, padding: space.md, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.line, borderRadius: 10, paddingHorizontal: space.md, height: 54, gap: space.sm },
  dial: { fontSize: 18, color: colors.ink },
  input: { flex: 1, fontSize: 18, color: colors.ink },
  code: { fontSize: 32, letterSpacing: 12, textAlign: 'center', color: colors.ink, borderBottomWidth: 2, borderBottomColor: colors.primary, paddingVertical: space.md },
  error: { color: colors.danger, fontSize: 14 },
  link: { color: colors.primary, fontSize: 15, textAlign: 'center' },
  later: { color: colors.inkMuted, fontSize: 15, textAlign: 'center', textDecorationLine: 'underline', padding: space.md },
});
