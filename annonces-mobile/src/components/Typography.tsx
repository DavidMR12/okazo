import { forwardRef, type ComponentRef } from 'react';
import { Text as RNText, TextInput as RNTextInput, StyleSheet, type TextInputProps, type TextProps } from 'react-native';
import { FONT } from '../theme';

/**
 * Texte de l'application, en Outfit partout (demande du porteur, 15 novembre 2026 : plus aucune police neutre ; remplace Inter).
 * React Native n'a pas de police globale : tous les écrans importent Text et TextInput d'ici, jamais de 'react-native'.
 * Avec une police chargée, Android ignore fontWeight (ou simule un faux gras) : on choisit donc le fichier Outfit
 * de la graisse demandée (400, 500, 600, 700, 800), et on retire fontWeight. Un style peut imposer sa police (fontFamily).
 */
const WEIGHTS: Record<string, string> = {
  '100': 'Outfit_400Regular', '200': 'Outfit_400Regular', '300': 'Outfit_400Regular', '400': 'Outfit_400Regular', normal: 'Outfit_400Regular',
  '500': 'Outfit_500Medium', '600': 'Outfit_600SemiBold', '700': 'Outfit_700Bold', bold: 'Outfit_700Bold', '800': 'Outfit_800ExtraBold', '900': 'Outfit_800ExtraBold',
};

const withFont = (style: TextProps['style']) => {
  const flat = StyleSheet.flatten(style) ?? {};
  const { fontWeight, fontFamily, ...rest } = flat;
  const family = fontFamily ?? (fontWeight ? WEIGHTS[String(fontWeight)] : undefined);
  return [rest, family ? { fontFamily: family } : styles.font];
};

export const Text = forwardRef<ComponentRef<typeof RNText>, TextProps>(function Text({ style, ...props }, ref) {
  return <RNText ref={ref} {...props} style={withFont(style)} />;
});

export const TextInput = forwardRef<ComponentRef<typeof RNTextInput>, TextInputProps>(function TextInput({ style, ...props }, ref) {
  return <RNTextInput ref={ref} {...props} style={withFont(style)} />;
});

const styles = StyleSheet.create({ font: { fontFamily: FONT } });
