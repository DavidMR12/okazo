import { Image } from 'expo-image';

/**
 * Drapeaux des pays de la zone (petites images, mêmes dessins que le site) : les émojis drapeaux
 * ne s'affichent pas partout (Windows, version navigateur de l'application).
 */
const FLAGS: Record<string, number> = {
  CM: require('../assets/flags/cm.png'),
  GA: require('../assets/flags/ga.png'),
  CG: require('../assets/flags/cg.png'),
  TD: require('../assets/flags/td.png'),
  CF: require('../assets/flags/cf.png'),
  GQ: require('../assets/flags/gq.png'),
};

export function Flag({ code, width = 24 }: { code: string; width?: number }) {
  const src = FLAGS[code];
  const style = { width, height: (width * 2) / 3, borderRadius: 2, backgroundColor: '#DCE6FA' };
  return src ? <Image source={src} style={style} contentFit="cover" accessibilityElementsHidden importantForAccessibility="no" /> : <Image style={style} />;
}
