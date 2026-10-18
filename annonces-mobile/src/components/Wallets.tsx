import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { Text } from './Typography';

/**
 * Portefeuilles électroniques (décision du porteur, 15 octobre 2026) : logo officiel de l'opérateur sur sa
 * couleur de marque (sources : Maquettes/logos-paiement/SOURCES.md), nom du portefeuille écrit à côté.
 * Le vendeur indique ceux qu'il accepte ; le paiement se fait entre acheteur et vendeur, à la remise.
 */
export const WALLETS: Record<string, { name: string; logo: number }> = {
  mtn_momo: { name: 'MTN MoMo', logo: require('../assets/wallets/mtn-momo.png') },
  orange_money: { name: 'Orange Money', logo: require('../assets/wallets/orange-money.png') },
  airtel_money: { name: 'Airtel Money', logo: require('../assets/wallets/airtel-money.png') },
  moov_money: { name: 'Moov Money', logo: require('../assets/wallets/moov-money.png') },
  wave: { name: 'Wave', logo: require('../assets/wallets/wave.png') },
};

export const walletName = (code: string) => WALLETS[code]?.name ?? code;

export function WalletLogo({ code, height = 26 }: { code: string; height?: number }) {
  const w = WALLETS[code];
  if (!w) return null;
  return <Image source={w.logo} style={[styles.logo, { height, width: Math.round((height * 240) / 150) }]} contentFit="contain" accessibilityElementsHidden importantForAccessibility="no" />;
}

/** « Paiement électronique accepté » : logos et noms des portefeuilles. */
export function WalletList({ codes }: { codes: string[] }) {
  if (!codes.length) return null;
  return (
    <View style={styles.list} accessibilityLabel={`Paiements électroniques acceptés : ${codes.map(walletName).join(', ')}`}>
      {codes.map((c) => (
        <View key={c} style={styles.item}>
          <WalletLogo code={c} />
          <Text style={styles.name}>{walletName(c)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { borderRadius: 5, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff' },
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
});
