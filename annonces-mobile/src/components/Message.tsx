import { StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import { colors, space, type } from '../theme';
import { Button } from './Button';

/** États vides et erreurs : dire ce qui se passe et quoi faire, sans s’excuser. */
export function Message({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.box}>
      <Text style={[type.heading, styles.center]}>{title}</Text>
      {body ? <Text style={[type.body, styles.center, { color: colors.inkMuted }]}>{body}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={{ marginTop: space.md, alignSelf: 'stretch' }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: space.xl, gap: space.sm, alignItems: 'center' },
  center: { textAlign: 'center' },
});
