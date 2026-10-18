import { StyleSheet, View } from 'react-native';
import type { FormField } from '../api/types';
import { colors, space, type } from '../theme';
import { Chip } from './Chip';
import { Text, TextInput } from './Typography';

/**
 * Champs propres à la catégorie (contrat, kilométrage, surface…), décrits par l'API.
 * Les valeurs restent du texte pendant la saisie ; elles sont converties à l'envoi.
 */
export function AttributeFields({
  fields,
  values,
  onChange,
  errors,
  showRequired,
}: {
  fields: FormField[];
  values: Record<string, string>;
  onChange: (key: string, value: string | undefined) => void;
  errors: Record<string, string>;
  showRequired: boolean; // « Je propose » : les champs obligatoires le sont ; « Je recherche » : tout est facultatif
}) {
  return (
    <>
      {fields.map((f) => (
        <View key={f.key} style={styles.field}>
          <Text style={type.heading}>
            {f.label}
            {!(f.required && showRequired) ? <Text style={styles.optional}> · facultatif</Text> : null}
          </Text>
          {f.type === 'select' ? (
            <View style={styles.wrap}>
              {f.options.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  selected={values[f.key] === o.value}
                  onPress={() => onChange(f.key, values[f.key] === o.value ? undefined : o.value)}
                />
              ))}
            </View>
          ) : f.type === 'number' ? (
            <View style={styles.row}>
              <TextInput
                value={values[f.key] ?? ''}
                onChangeText={(v) => onChange(f.key, v.replace(/\D/g, '').slice(0, 9) || undefined)}
                keyboardType="number-pad"
                placeholder={f.min !== undefined && f.max !== undefined && f.key === 'year' ? `${f.max - 1}` : ''}
                placeholderTextColor={colors.inkMuted}
                style={[styles.input, styles.number]}
                accessibilityLabel={f.unit ? `${f.label} en ${f.unit}` : f.label}
              />
              {f.unit ? <Text style={styles.unit}>{f.unit}</Text> : null}
            </View>
          ) : (
            <TextInput
              value={values[f.key] ?? ''}
              onChangeText={(v) => onChange(f.key, v || undefined)}
              placeholder={f.placeholder}
              placeholderTextColor={colors.inkMuted}
              maxLength={f.maxLength ?? 120}
              style={styles.input}
            />
          )}
          {errors[f.key] ? <Text style={styles.error}>{errors[f.key]}</Text> : null}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.sm },
  optional: { fontSize: 13, color: colors.inkMuted },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 10, paddingHorizontal: space.md, minHeight: 48, fontSize: 16, color: colors.ink },
  number: { flex: 1, minWidth: 0, maxWidth: 200 },
  unit: { fontSize: 16, color: colors.inkMuted },
  error: { color: colors.danger, fontSize: 14 },
});
