import { Ionicons } from '@expo/vector-icons';
import * as Facebook from 'expo-auth-session/providers/facebook';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, space, type } from '../theme';
import { Text } from './Typography';

WebBrowser.maybeCompleteAuthSession();

/**
 * « Continuer avec Google / Facebook ». Chaque bouton n'existe que si son identifiant est configuré
 * (variables EXPO_PUBLIC_…) ET si l'API l'accepte. Le jeton obtenu est vérifié par l'API, jamais ici.
 * Ces connexions fonctionnent dans l'application installée (version de développement ou finale), pas dans Expo Go.
 */
const G = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
};
const FB_APP_ID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID;
export const socialConfigured = { google: !!(G.androidClientId || G.iosClientId || G.webClientId), facebook: !!FB_APP_ID };

type OnToken = (provider: 'google' | 'facebook', token: string) => void;

export function SocialLogin({ enabled, onToken, busy, label = 'Continuer' }: { enabled: { google: boolean; facebook: boolean }; onToken: OnToken; busy?: boolean; label?: string }) {
  const google = enabled.google && socialConfigured.google;
  const facebook = enabled.facebook && socialConfigured.facebook;
  if (!google && !facebook) return null;
  return (
    <View style={{ gap: space.md }}>
      <View style={styles.sep}>
        <View style={styles.line} />
        <Text style={type.small}>ou</Text>
        <View style={styles.line} />
      </View>
      {google ? <GoogleButton onToken={onToken} busy={busy} label={label} /> : null}
      {facebook ? <FacebookButton onToken={onToken} busy={busy} label={label} /> : null}
      <Text style={type.small}>Avec Google ou Facebook, nous vous demanderons aussi votre numéro avant de publier ou de contacter : cela protège tout le monde contre les arnaques.</Text>
    </View>
  );
}

function GoogleButton({ onToken, busy, label }: { onToken: OnToken; busy?: boolean; label: string }) {
  const [request, response, prompt] = Google.useIdTokenAuthRequest({ clientId: G.webClientId, androidClientId: G.androidClientId, iosClientId: G.iosClientId });
  useEffect(() => {
    if (response?.type === 'success' && response.params.id_token) onToken('google', response.params.id_token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);
  return (
    <Pressable style={[styles.btn, styles.google]} disabled={!request || busy} onPress={() => void prompt()} accessibilityRole="button">
      <Ionicons name="logo-google" size={20} color="#DB4437" />
      <Text style={styles.googleText}>{label} avec Google</Text>
    </Pressable>
  );
}

function FacebookButton({ onToken, busy, label }: { onToken: OnToken; busy?: boolean; label: string }) {
  const [request, response, prompt] = Facebook.useAuthRequest({ clientId: FB_APP_ID! });
  useEffect(() => {
    if (response?.type === 'success' && response.authentication?.accessToken) onToken('facebook', response.authentication.accessToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);
  return (
    <Pressable style={[styles.btn, styles.facebook]} disabled={!request || busy} onPress={() => void prompt()} accessibilityRole="button">
      <Ionicons name="logo-facebook" size={20} color="#fff" />
      <Text style={styles.facebookText}>{label} avec Facebook</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sep: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, height: 50, borderRadius: 25 },
  google: { borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.bg },
  googleText: { fontSize: 16, color: colors.ink },
  facebook: { backgroundColor: '#1877F2' },
  facebookText: { fontSize: 16, color: '#fff' },
});
