import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AdPlacement, adsModule, adsReady, adUnitId, onAdsReady } from '../lib/ads';
import { colors, space } from '../theme';
import { Text } from './Typography';

/**
 * Emplacement publicitaire encadré, comme sur le site (« Publicité » au-dessus).
 * Rien n'est affiché (pas même le cadre) tant qu'aucune annonce n'est chargée : Expo Go, consentement refusé
 * sans annonce non personnalisée disponible, pas de réseau, pas d'annonce à servir.
 */
export function AdBanner({ placement }: { placement: AdPlacement }) {
  const [ready, setReady] = useState(adsReady());
  const [loaded, setLoaded] = useState(false);
  useEffect(() => (ready ? undefined : onAdsReady(() => setReady(true))), [ready]);

  const ads = adsModule();
  const unitId = adUnitId(placement);
  if (!ads || !unitId || !ready) return null;
  const { BannerAd, BannerAdSize } = ads;

  return (
    <View style={[styles.box, !loaded && styles.hidden]}>
      {loaded ? <Text style={styles.label}>Publicité</Text> : null}
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.INLINE_ADAPTIVE_BANNER}
        maxHeight={260}
        onAdLoaded={() => setLoaded(true)}
        onAdFailedToLoad={() => setLoaded(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginHorizontal: space.lg,
    marginTop: space.lg,
    paddingVertical: space.sm,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fff',
    alignItems: 'center',
    overflow: 'hidden',
    gap: 6,
  },
  // Gardée montée (sinon la demande d'annonce repart à zéro) mais sans place à l'écran tant que rien n'est chargé
  hidden: { height: 1, marginTop: 0, paddingVertical: 0, borderWidth: 0, opacity: 0 },
  label: { fontSize: 11, letterSpacing: 0.4, color: colors.inkMuted, alignSelf: 'flex-start', marginLeft: space.md },
});
