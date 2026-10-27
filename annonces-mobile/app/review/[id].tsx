import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { ApiError } from '../../src/api/client';
import { useCreateReview } from '../../src/api/hooks';
import { Button } from '../../src/components/Button';
import { RATING_LABELS, StarInput } from '../../src/components/Stars';
import { Text, TextInput } from '../../src/components/Typography';
import { reviewRoleLabel } from '../../src/lib/format';
import { colors, space, type } from '../../src/theme';
import { dialog } from '../../src/components/Dialog';

/** Donner son avis après un échange : une note de 1 à 5 étoiles et, si on veut, quelques mots. */
export default function ReviewScreen() {
  const { id, name, role, job } = useLocalSearchParams<{ id: string; name?: string; role?: 'buyer' | 'seller'; job?: string }>();
  // Personne notée : l'autre partie de l'échange (offre d'emploi : candidat ou recruteur)
  const other = reviewRoleLabel(role === 'seller' ? 'buyer' : 'seller', job ? 'emploi' : null).toLowerCase();
  const create = useCreateReview(id);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const send = () => {
    const text = comment.trim();
    if (!rating) return setError('Choisissez une note de 1 à 5 étoiles.');
    if (text && text.length < 10) return setError('Écrivez au moins 10 caractères, ou laissez le commentaire vide.');
    setError(null);
    create.mutate(
      { rating, comment: text || undefined },
      {
        onSuccess: () => {
          dialog('Merci pour votre avis', 'Il aide toute la communauté à échanger en confiance.');
          router.back();
        },
        onError: (e) => setError(e instanceof ApiError ? e.message : 'Envoi impossible. Réessayez.'),
      },
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={type.title}>Votre avis sur {name ?? 'cet échange'}</Text>
        <Text style={type.small}>
          Comment s’est passé l’échange avec {other === 'acheteur' ? 'cet acheteur' : `ce ${other}`} : ponctualité, respect de ce qui était prévu, amabilité.
        </Text>

        <View style={styles.stars}>
          <StarInput value={rating} onChange={setRating} />
          <Text style={styles.label}>{rating ? RATING_LABELS[rating] : 'Touchez une étoile'}</Text>
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={type.heading}>Un commentaire ?</Text>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder={job ? 'Facultatif. Ex. : ponctuel, sérieux, entretien bien organisé.' : 'Facultatif. Ex. : à l’heure, article conforme à l’annonce.'}
            placeholderTextColor={colors.inkMuted}
            multiline
            maxLength={500}
            style={styles.input}
          />
          <Text style={type.small}>Votre avis est public, signé de votre nom. Pas de numéro de téléphone ni de lien.</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="Publier mon avis" onPress={send} loading={create.isPending} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl * 2 },
  stars: { alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  label: { fontSize: 16, color: colors.ink },
  input: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 10, padding: space.md, minHeight: 110, fontSize: 16, color: colors.ink, textAlignVertical: 'top' },
  error: { color: colors.danger, fontSize: 14 },
});
