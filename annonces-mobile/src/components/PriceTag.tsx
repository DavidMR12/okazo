import { StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import type { PriceType } from '../api/types';
import { priceLabel } from '../lib/format';
import { colors, PRICE_FONT } from '../theme';

/**
 * Le prix, information n°1 d'une annonce : texte foncé et plus grand que le reste (direction artistique
 * d'octobre 2026, qui remplace l'étiquette safran). « à débattre » à côté, en discret.
 */
export function PriceTag({
  priceType,
  priceXaf,
  unit,
  size = 'md',
}: {
  priceType: PriceType;
  priceXaf: number | null;
  unit?: string | null; // « mois » pour un salaire ou un loyer, « h » pour un tarif horaire
  size?: 'sm' | 'md' | 'lg'; // sm : cartes étroites (« à débattre » passe à la ligne)
}) {
  const lg = size === 'lg';
  const sm = size === 'sm';
  const amount = priceType === 'fixed' || priceType === 'negotiable';
  return (
    <View style={[styles.row, sm && styles.rowSm]}>
      <Text style={[styles.text, lg && styles.textLg, sm && styles.textSm]} numberOfLines={1} adjustsFontSizeToFit={sm} minimumFontScale={0.8}>
        {priceLabel(priceType, priceXaf)}
        {amount && priceXaf !== null && unit ? ` / ${unit}` : ''}
      </Text>
      {priceType === 'negotiable' && <Text style={[styles.note, lg && styles.noteLg]} numberOfLines={1}>À débattre</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexShrink: 1 },
  // Le prix reste entier ; c'est « À débattre » qui se raccourcit si la place manque
  text: { fontSize: 16, fontFamily: PRICE_FONT, color: colors.ink, fontVariant: ['tabular-nums'], flexShrink: 0 },
  textLg: { fontSize: 26 },
  rowSm: { flexDirection: 'column', alignItems: 'flex-start', gap: 0 },
  textSm: { fontSize: 15, flexShrink: 1 }, // cartes étroites : le prix rétrécit un peu plutôt que de déborder
  note: { fontSize: 12, color: colors.inkMuted, fontWeight: '400', flexShrink: 1 },
  noteLg: { fontSize: 14 },
});
