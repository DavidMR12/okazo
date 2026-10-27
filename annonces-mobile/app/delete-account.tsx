import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Text, TextInput } from '../src/components/Typography';
import { api, ApiError } from '../src/api/client';
import { useAuth } from '../src/auth/AuthProvider';
import { Button } from '../src/components/Button';
import { colors, space, type } from '../src/theme';
import { dialog } from '../src/components/Dialog';

export default function DeleteAccountScreen() {
  const { forgetSession } = useAuth();
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const sendCode = async () => {
    setLoading(true);
    try {
      await api('/me/delete/request', { method: 'POST', auth: true });
      setCodeSent(true);
    } catch (e) {
      dialog('Suppression du compte', e instanceof ApiError ? e.message : 'Envoi du code impossible.');
    } finally {
      setLoading(false);
    }
  };

  const remove = () =>
    dialog('Supprimer définitivement ?', 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await api('/me', { method: 'DELETE', body: { code }, auth: true });
            await forgetSession();
            router.dismissAll();
            dialog('Compte supprimé', 'Vos données personnelles ont été effacées.');
          } catch (e) {
            dialog('Suppression du compte', e instanceof ApiError ? e.message : 'Suppression impossible.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={type.title}>Ce qui sera supprimé</Text>
      <Text style={type.body}>Votre numéro, votre nom, vos annonces et leurs photos, vos favoris et vos documents de vérification d’identité.</Text>
      <Text style={type.body}>
        Pour lutter contre la fraude, nous conservons l’historique des signalements et des décisions de modération, sans vos données de contact.
      </Text>

      {!codeSent ? (
        <Button label="Recevoir un code de confirmation" variant="danger" onPress={sendCode} loading={loading} />
      ) : (
        <>
          <Text style={type.body}>Entrez le code reçu par SMS.</Text>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={6}
            autoFocus
            style={styles.code}
            accessibilityLabel="Code à 6 chiffres"
          />
          <Button label="Supprimer mon compte" variant="danger" onPress={remove} loading={loading} disabled={code.length !== 6} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.xl, gap: space.lg },
  code: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 10,
    textAlign: 'center',
    color: colors.ink,
    borderBottomWidth: 2,
    borderBottomColor: colors.danger,
    paddingVertical: space.md,
  },
});
