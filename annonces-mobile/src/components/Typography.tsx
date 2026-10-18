import { forwardRef } from 'react';
import { Text as RNText, TextInput as RNTextInput, StyleSheet, type TextInputProps, type TextProps } from 'react-native';
import { FONT } from '../theme';

/**
 * Texte de l'application, en Inter (décision du porteur, 18 octobre 2026, d'après sa maquette ; remplace Roboto Slab).
 * React Native n'a pas de police globale : tous les écrans importent Text et TextInput d'ici, jamais de 'react-native'.
 * Avec une police chargée, Android ignore fontWeight (ou simule un faux gras) : on choisit donc le fichier Inter
 * de la graisse demandée (400, 500, 600, 700, 800), et on retire fontWeight. Un style peut imposer sa police (fontFamily).
 */
const WEIGHTS: Record<string, string> = {
  '100': 'Inter_400Regular', '200': 'Inter_400Regular', '300': 'Inter_400Regular', '400': 'Inter_400Regular', normal: 'Inter_400Regular',
  '500': 'Inter_500Medium', '600': 'Inter_600SemiBold', '700': 'Inter_700Bold', bold: 'Inter_700Bold', '800': 'Inter_800ExtraBold', '900': 'Inter_800ExtraBold',
};

const withFont = (style: TextProps['style']) => {
  const flat = StyleSheet.flatten(style) ?? {};
  const { fontWeight, fontFamily, ...rest } = flat;
  const family = fontFamily ?? (fontWeight ? WEIGHTS[String(fontWeight)] : undefined);
  return [rest, family ? { fontFamily: family } : styles.font];
};

export const Text = forwardRef<RNText, TextProps>(function Text({ style, ...props }, ref) {
  return <RNText ref={ref} {...props} style={withFont(style)} />;
});

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, ...props }, ref) {
  return <RNTextInput ref={ref} {...props} style={withFont(style)} />;
});

const styles = StyleSheet.create({ font: { fontFamily: FONT } });
