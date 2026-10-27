import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../src/components/Typography';
import { ApiError } from '../src/api/client';
import { useReport } from '../src/api/hooks';
import type { ReportReason } from '../src/api/types';
import { Button } from '../src/components/Button';
import { colors, space, type } from '../src/theme';
import { dialog } from '../src/components/Dialog';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'scam', label: "Arnaque ou demande d’argent à l’avance" },
  { value: 'fake_photos', label: 'Photos volées ou trompeuses' },
  { value: 'prohibited_item', label: 'Article interdit' },
  { value: 'duplicate', label: 'Annonce en double' },
  { value: 'wrong_category', label: 'Mauvaise catégorie' },
  { value: 'harassment', label: 'Comportement insultant ou harcèlement' },
  { value: 'other', label: 'Autre problème' },
];

export default function ReportScreen() {
  const { listingId, userId } = useLocalSearchParams<{ listingId?: string; userId?: string }>();
  const report = useReport();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');

  const needsDetails = reason === 'other' && details.trim().length < 10;

  const submit = () => {
    if (!reason) return;
    report.mutate(
      { listingId, userId, reason, details: details.trim() || undefined },
      {
        onSuccess: (r) => {
          dialog('Signalement envoyé', r.message);
          router.back();
        },
        onError: (e) => dialog('Signalement', e instanceof ApiError ? e.message : 'Envoi impossible.'),
      },
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={type.heading}>Quel est le problème ?</Text>
        <View style={styles.list} accessibilityRole="radiogroup">
          {REASONS.map((r) => {
            const selected = reason === r.value;
            return (
              <Pressable
                key={r.value}
                onPress={() => setReason(r.value)}
                style={[styles.option, selected && styles.optionSelected]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.primary : colors.inkMuted} />
                <Text style={[type.body, { flex: 1 }]}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={details}
          onChangeText={setDetails}
          placeholder={reason === 'other' ? 'Décrivez le problème (obligatoire)' : 'Détails (facultatif)'}
          placeholderTextColor={colors.inkMuted}
          multiline
          maxLength={1000}
          style={styles.details}
        />
        <Text style={type.small}>Votre signalement est anonyme pour le vendeur. Notre équipe l’examine rapidement.</Text>
        <Button label="Envoyer le signalement" onPress={submit} loading={report.isPending} disabled={!reason || needsDetails} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.xl, gap: space.lg },
  list: { gap: space.xs },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md, borderRadius: 10 },
  optionSelected: { backgroundColor: colors.surface },
  details: { minHeight: 96, borderWidth: 1.5, borderColor: colors.line, borderRadius: 10, padding: space.md, fontSize: 15, color: colors.ink, textAlignVertical: 'top' },
});
