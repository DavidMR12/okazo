import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../src/components/Typography';
import { ApiError } from '../src/api/client';
import { useAuthMethods, useCountries } from '../src/api/hooks';
import { useAuth } from '../src/auth/AuthProvider';
import { Button } from '../src/components/Button';
import { DialCodePicker } from '../src/components/DialCodePicker';
import { SITE_URL } from '../src/brand';
import { SocialLogin } from '../src/components/SocialLogin';
import { colors, space, type } from '../src/theme';

// Utilisés si la liste des pays n’a pas encore pu être chargée (hors ligne)
const FALLBACK = [
  { code: 'CM', name: 'Cameroun', dialCode: '+237' },
  { code: 'GA', name: 'Gabon', dialCode: '+241' },
  { code: 'CG', name: 'Congo', dialCode: '+242' },
];

/** Sélecteur ovale à deux choix (Téléphone / E-mail, SMS / WhatsApp), comme sur le site. */
function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; color?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <View style={styles.pill} accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.pillItem, on && { backgroundColor: o.color ?? colors.primary }]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Text style={[styles.pillText, on && { color: '#fff' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Connexion ou inscription : téléphone (code par SMS ou WhatsApp), e-mail et mot de passe, ou Google
 * (décision du porteur, 15 octobre 2026 ; Facebook retiré). Sans numéro (e-mail, Google), un numéro vérifié
 * est demandé ensuite, une seule fois, avant d'agir.
 */
export default function LoginScreen() {
  const { requestCode, signInWithOAuth, emailCode, emailSession } = useAuth();
  const methods = useAuthMethods();
  const canWhatsApp = methods.data?.otpChannels.includes('whatsapp') ?? false;
  const countries = useCountries();
  const list = countries.data?.length ? countries.data : FALLBACK;
  const [tab, setTab] = useState<'phone' | 'email'>('phone');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ---- téléphone
  const [channel, setChannel] = useState<'sms' | 'whatsapp'>('sms');
  const [country, setCountry] = useState(list[0].code);
  const dial = list.find((c) => c.code === country)?.dialCode ?? list[0].dialCode;
  const [number, setNumber] = useState('');
  const digits = number.replace(/\D/g, '').replace(/^0+/, '');
  const phone = `${dial}${digits}`;

  // ---- e-mail
  const [mode, setMode] = useState<'login' | 'register' | 'confirm' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const strong = password.length >= 8 && /\p{L}/u.test(password) && /\d/.test(password);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  };

  // Compte sans numéro (e-mail, Google) : on propose tout de suite de le vérifier (on peut passer)
  // Après la connexion : CGU à accepter si besoin (preuve en cas de litige), puis numéro à vérifier
  const finish = (r: { isNewUser: boolean; phoneRequired: boolean; termsAccepted: boolean }) => {
    router.back();
    if (!r.termsAccepted) router.push({ pathname: '/accept-terms', params: { phoneRequired: r.phoneRequired ? '1' : '' } });
    else if (r.phoneRequired) router.push({ pathname: '/verify-phone', params: { welcome: r.isNewUser ? '1' : '' } });
  };

  const sendPhoneCode = () =>
    run(async () => {
      const res = await requestCode(phone, channel);
      router.push({ pathname: '/verify', params: { phone, channel, resendAfter: String(res.resendAfterSec) } });
    });

  const social = (provider: 'google' | 'facebook', token: string) => run(async () => finish(await signInWithOAuth(provider, token, country)));

  const goEmail = (m: typeof mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
    setCode('');
    if (m !== 'reset' && m !== 'confirm') setPassword('');
  };

  const field = (props: { label: string; value: string; onChangeText: (v: string) => void; secure?: boolean; keyboardType?: 'email-address' | 'number-pad'; autoComplete?: 'email' | 'password' | 'new-password' | 'name' | 'one-time-code'; placeholder?: string }) => (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{props.label}</Text>
      <View>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        secureTextEntry={props.secure && !showPassword}
        keyboardType={props.keyboardType}
        autoComplete={props.autoComplete}
        autoCapitalize="none"
        placeholder={props.placeholder}
        placeholderTextColor={colors.inkMuted}
        style={[styles.field, props.secure ? { paddingRight: 48 } : null]}
        accessibilityLabel={props.label}
      />
      {props.secure ? (
        <Pressable
          onPress={() => setShowPassword((s) => !s)}
          hitSlop={6}
          style={styles.eye}
          accessibilityRole="button"
          accessibilityLabel={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        >
          <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.inkMuted} />
        </Pressable>
      ) : null}
      </View>
    </View>
  );
  const emailField = field({ label: 'Adresse e-mail', value: email, onChangeText: setEmail, keyboardType: 'email-address', autoComplete: 'email', placeholder: 'vous@exemple.com' });
  const passwordHint = <Text style={[type.small, password && !strong ? { color: colors.danger } : null]}>8 caractères au moins, avec une lettre et un chiffre.</Text>;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={type.title}>Connexion ou inscription</Text>
        {methods.data?.email !== false ? (
          <Segmented label="Se connecter avec" value={tab} onChange={(t) => { setTab(t); setError(null); }} options={[{ value: 'phone', label: 'Téléphone' }, { value: 'email', label: 'E-mail' }]} />
        ) : null}

        {tab === 'phone' ? (
          <>
            <Text style={type.body}>Nous vous envoyons un code par SMS{canWhatsApp ? ' ou WhatsApp' : ''}. Pas de mot de passe à retenir.</Text>
            <View style={styles.inputRow}>
              <DialCodePicker countries={list} value={country} onChange={setCountry} />
              <TextInput
                value={number}
                onChangeText={setNumber}
                placeholder="6 77 12 34 56"
                placeholderTextColor={colors.inkMuted}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                style={styles.input}
                accessibilityLabel="Numéro de téléphone"
              />
            </View>
            {canWhatsApp ? (
              <View style={styles.row}>
                <Text style={type.small}>Recevoir le code par</Text>
                <Segmented label="Recevoir le code par" value={channel} onChange={setChannel} options={[{ value: 'sms', label: 'SMS' }, { value: 'whatsapp', label: 'WhatsApp', color: colors.whatsapp }]} />
              </View>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button label="Recevoir le code" onPress={() => void sendPhoneCode()} loading={busy} disabled={digits.length < 7} />
          </>
        ) : mode === 'login' ? (
          <>
            {emailField}
            {field({ label: 'Mot de passe', value: password, onChangeText: setPassword, secure: true, autoComplete: 'password' })}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button label="Se connecter" loading={busy} disabled={!email || !password} onPress={() => void run(async () => finish(await emailSession('login', { email, password })))} />
            <View style={styles.links}>
              <Text style={styles.link} onPress={() => goEmail('forgot')}>Mot de passe oublié ?</Text>
              <Text style={styles.link} onPress={() => goEmail('register')}>Créer un compte</Text>
            </View>
          </>
        ) : mode === 'register' ? (
          <>
            {field({ label: 'Votre nom (affiché sur vos annonces)', value: name, onChangeText: setName, autoComplete: 'name', placeholder: 'Awa N.' })}
            {emailField}
            {field({ label: 'Choisissez un mot de passe', value: password, onChangeText: setPassword, secure: true, autoComplete: 'new-password' })}
            {passwordHint}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              label="Créer mon compte"
              loading={busy}
              disabled={name.trim().length < 2 || !email || !strong}
              onPress={() =>
                void run(async () => {
                  await emailCode('register', { email, password, displayName: name.trim(), country });
                  setNotice(`Code envoyé à ${email.trim().toLowerCase()}. Il expire dans 15 min (pensez aux courriers indésirables).`);
                  setMode('confirm');
                })
              }
            />
            <Text style={styles.link} onPress={() => goEmail('login')}>J’ai déjà un compte</Text>
          </>
        ) : mode === 'forgot' ? (
          <>
            <Text style={type.body}>Indiquez votre adresse : nous vous envoyons un code pour choisir un nouveau mot de passe.</Text>
            {emailField}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              label="Recevoir un code"
              loading={busy}
              disabled={!email}
              onPress={() =>
                void run(async () => {
                  await emailCode('forgot', { email });
                  setNotice(`Si un compte existe pour ${email.trim().toLowerCase()}, un code vient d’y être envoyé.`);
                  setMode('reset');
                })
              }
            />
            <Text style={styles.link} onPress={() => goEmail('login')}>Retour à la connexion</Text>
          </>
        ) : (
          <>
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            {field({ label: 'Code à 6 chiffres', value: code, onChangeText: (v) => setCode(v.replace(/\D/g, '').slice(0, 6)), keyboardType: 'number-pad', autoComplete: 'one-time-code' })}
            {mode === 'reset' ? (
              <>
                {field({ label: 'Nouveau mot de passe', value: password, onChangeText: setPassword, secure: true, autoComplete: 'new-password' })}
                {passwordHint}
              </>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              label={mode === 'confirm' ? 'Confirmer mon adresse' : 'Enregistrer le mot de passe'}
              loading={busy}
              disabled={code.length !== 6 || (mode === 'reset' && !strong)}
              onPress={() => void run(async () => finish(await emailSession(mode === 'confirm' ? 'verify' : 'reset', mode === 'confirm' ? { email, code } : { email, code, password })))}
            />
            <Text style={styles.link} onPress={() => goEmail(mode === 'confirm' ? 'register' : 'forgot')}>Renvoyer un code</Text>
          </>
        )}

        <SocialLogin enabled={{ google: !!methods.data?.google, facebook: false }} onToken={(p, t) => void social(p, t)} busy={busy} />
        <Text style={type.small}>
          En continuant, vous acceptez les{' '}
          <Text style={styles.legalLink} onPress={() => void Linking.openURL(`${SITE_URL}/conditions`)} accessibilityRole="link">conditions d’utilisation</Text>
          {' '}et la{' '}
          <Text style={styles.legalLink} onPress={() => void Linking.openURL(`${SITE_URL}/confidentialite`)} accessibilityRole="link">politique de confidentialité</Text>.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.xl, gap: space.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  pill: { flexDirection: 'row', alignSelf: 'flex-start', padding: 4, gap: 4, borderWidth: 1.5, borderColor: colors.line, borderRadius: 999, backgroundColor: colors.tint },
  pillItem: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: 999 },
  pillText: { fontSize: 15, fontWeight: '800', color: colors.ink },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: space.md,
    height: 54,
    gap: space.sm,
  },
  input: { flex: 1, fontSize: 18, color: colors.ink, letterSpacing: 0.5 },
  label: { fontSize: 14, fontWeight: '700', color: colors.ink },
  eye: { position: 'absolute', right: 4, top: 3, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  field: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 10, paddingHorizontal: space.md, height: 50, fontSize: 16, color: colors.ink },
  links: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.sm },
  link: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  notice: { backgroundColor: colors.tint, color: colors.ink, padding: space.md, borderRadius: 10 },
  error: { color: colors.danger, fontSize: 14 },
  legalLink: { color: colors.primary, fontWeight: '700' },
});
