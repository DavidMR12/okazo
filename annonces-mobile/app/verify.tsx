import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../src/components/Typography';
import { ApiError } from '../src/api/client';
import { useAuth } from '../src/auth/AuthProvider';
import { Button } from '../src/components/Button';
import { colors, space, type } from '../src/theme';

export default function VerifyScreen() {
  const params = useLocalSearchParams<{ phone: string; channel?: 'sms' | 'whatsapp'; resendAfter?: string }>();
  const { phone, resendAfter } = params;
  const [channel, setChannel] = useState<'sms' | 'whatsapp'>(params.channel === 'whatsapp' ? 'whatsapp' : 'sms');
  const { verifyCode, requestCode } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wait, setWait] = useState(Number(resendAfter ?? 60));

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = async (value = code) => {
    if (value.length !== 6) return;
    setError(null);
    setLoading(true);
    try {
      const r = await verifyCode(phone, value);
      router.dismiss(2); // ferme la vérification et la connexion : retour à l’écran d’origine
      if (!r.termsAccepted) router.push('/accept-terms'); // CGU à accepter (preuve en cas de litige)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Vérification impossible. Réessayez.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const resend = async (via = channel) => {
    setError(null);
    try {
      const res = await requestCode(phone, via);
      setChannel(via);
      setWait(res.resendAfterSec);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Envoi impossible.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={type.title}>Entrez le code reçu</Text>
      <Text style={type.body}>Code envoyé par {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} au {phone}.</Text>
      <TextInput
        value={code}
        onChangeText={(v) => {
          const clean = v.replace(/\D/g, '').slice(0, 6);
          setCode(clean);
          if (clean.length === 6) void submit(clean); // validation automatique au 6e chiffre
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
        editable={!loading}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label="Valider" onPress={() => void submit()} loading={loading} disabled={code.length !== 6} />
      <Button
        label={wait > 0 ? `Renvoyer le code dans ${wait} s` : 'Renvoyer le code'}
        onPress={() => void resend()}
        variant="secondary"
        disabled={wait > 0}
      />
      {wait <= 0 ? (
        <Button label={`Recevoir plutôt par ${channel === 'sms' ? 'WhatsApp' : 'SMS'}`} variant="secondary" onPress={() => void resend(channel === 'sms' ? 'whatsapp' : 'sms')} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.xl, gap: space.lg },
  code: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 12,
    textAlign: 'center',
    color: colors.ink,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    paddingVertical: space.md,
    fontVariant: ['tabular-nums'],
  },
  error: { color: colors.danger, fontSize: 14 },
});
