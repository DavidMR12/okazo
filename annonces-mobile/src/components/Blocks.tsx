import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, space } from '../theme';
import { Button } from './Button';
import { Text } from './Typography';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Briques communes des écrans « Mon compte », « Messages », « Panier », « Favoris » : même direction artistique
 * que le site (demandes du porteur, 20 octobre 2026) : cadres arrondis, rangées ovales, titres dans un ovale,
 * encadrés illustrés et icônes décoratives en filigrane pour qu'un écran peu rempli ne paraisse pas vide.
 */

/** Initiales d'un nom (« Compte de test » → « CD »). */
export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

/** Titre d'en-tête centré dans un ovale (« Mon compte », « Messages », « Mon panier », « Mes favoris »). */
export function PillTitle({ text }: { text: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

/** Rond bleu marine avec les initiales. */
export function Avatar({ name, size = 42 }: { name: string; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]} accessibilityElementsHidden>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

/** Pastille de compteur (« 3 articles »). */
export function CountBadge({ label }: { label: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

// Positions des icônes en filigrane : réparties sur toute la surface, tailles et inclinaisons variées
const SPOTS = [
  { top: '4%', left: '6%', size: 34, rotate: '-14deg', opacity: 0.16 },
  { top: '10%', right: '8%', size: 46, rotate: '12deg', opacity: 0.12 },
  { top: '38%', left: '-2%', size: 52, rotate: '8deg', opacity: 0.1 },
  { top: '34%', right: '-3%', size: 40, rotate: '-10deg', opacity: 0.14 },
  { bottom: '8%', left: '12%', size: 42, rotate: '16deg', opacity: 0.12 },
  { bottom: '4%', right: '14%', size: 30, rotate: '-18deg', opacity: 0.16 },
  { top: '64%', left: '40%', size: 26, rotate: '0deg', opacity: 0.1 },
] as const;

/** Icônes décoratives en filigrane, posées en fond d'un encadré (ne captent ni le toucher ni le lecteur d'écran). */
export function Decor({ icons }: { icons: IconName[] }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {SPOTS.map((s, i) => {
        const { size, rotate, opacity, ...pos } = s;
        return (
          <View key={i} style={[styles.spot, pos, { opacity, transform: [{ rotate }] }]}>
            <Ionicons name={icons[i % icons.length]} size={size} color={colors.primary} />
          </View>
        );
      })}
    </View>
  );
}

/**
 * Encadré illustré pour une liste vide ou un écran réservé aux comptes connectés : grande icône dans un double
 * cercle, icônes en filigrane autour, texte et bouton en gras.
 */
export function EmptyCard({ icon, text, action, onAction, decor }: { icon: IconName; text: string; action?: string; onAction?: () => void; decor?: IconName[] }) {
  return (
    <View style={[styles.empty, decor && styles.emptyTall]}>
      {decor ? <Decor icons={decor} /> : null}
      <View style={styles.halo}>
        <View style={styles.emptyIcon}>
          <Ionicons name={icon} size={36} color={colors.primary} />
        </View>
      </View>
      <Text style={styles.emptyText}>{text}</Text>
      {action && onAction ? <Button label={action} onPress={onAction} bold style={styles.emptyBtn} /> : null}
    </View>
  );
}

/** Bandeau décoratif sous une liste courte : icônes en filigrane et une phrase, pour ne pas laisser un grand vide. */
export function DecorFooter({ icons, text }: { icons: IconName[]; text: string }) {
  return (
    <View style={styles.footer}>
      <Decor icons={icons} />
      <Text style={styles.footerText}>{text}</Text>
    </View>
  );
}

/** Encadré de sécurité : bouclier + titre + texte. */
export function SafetyNote({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.safety}>
      <View style={styles.safetyIcon}>
        <Ionicons name="shield-checkmark-outline" size={20} color={colors.navy} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.safetyTitle}>{title}</Text>
        <Text style={styles.safetyText}>{text}</Text>
      </View>
    </View>
  );
}

/** Rangée ovale : pastille ronde avec icône, libellé, sous-titre, et un chevron ou un élément à droite. */
export function TileRow({ icon, label, hint, onPress, right }: { icon: IconName; label: string; hint?: string; onPress?: () => void; right?: ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.tile, pressed && { backgroundColor: colors.tint }]}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={styles.tileIcon}>
        <Ionicons name={icon} size={20} color={colors.navy} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.tileLabel}>{label}</Text>
        {hint ? <Text style={styles.tileHint}>{hint}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} /> : null)}
    </Pressable>
  );
}

export const cardShadow = {
  borderWidth: 1,
  borderColor: '#E6EDF8',
  shadowColor: '#1E3A8A',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 20, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5, borderColor: colors.tintLine, backgroundColor: colors.tint, maxWidth: 260 },
  pillText: { fontSize: 17, fontWeight: '800', color: colors.navy, textAlign: 'center' },
  avatar: { backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800' },
  badge: { alignSelf: 'flex-start', height: 28, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.tint, justifyContent: 'center' },
  badgeText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  spot: { position: 'absolute' },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
    borderRadius: 28,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#C9D6EE',
    backgroundColor: '#F6F9FF',
    overflow: 'hidden',
  },
  emptyTall: { minHeight: 420 },
  halo: { width: 104, height: 104, borderRadius: 52, backgroundColor: '#E4ECFC', alignItems: 'center', justifyContent: 'center' },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  emptyText: { textAlign: 'center', color: colors.inkMuted, fontSize: 15, lineHeight: 22, maxWidth: 300 },
  emptyBtn: { alignSelf: 'stretch', borderRadius: 999 },
  footer: { height: 220, marginTop: space.lg, borderRadius: 28, backgroundColor: '#F6F9FF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingHorizontal: space.xl },
  footerText: { textAlign: 'center', color: colors.inkMuted, fontSize: 14, lineHeight: 20 },
  safety: { flexDirection: 'row', gap: space.md, padding: 14, borderRadius: 16, backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.tintLine },
  safetyIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  safetyTitle: { fontSize: 14, fontWeight: '700', color: colors.navy },
  safetyText: { fontSize: 13, lineHeight: 19, color: colors.inkMuted },
  tile: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, paddingLeft: 10, paddingRight: space.lg, borderRadius: 999, borderWidth: 1, borderColor: colors.tintLine, backgroundColor: colors.bg },
  tileIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: 15, fontWeight: '700', color: colors.ink },
  tileHint: { fontSize: 13, color: colors.inkMuted },
});
