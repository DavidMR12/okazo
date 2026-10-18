/**
 * Palette pensée pour la lecture en plein soleil sur des écrans d’entrée de gamme :
 * contraste élevé, peu de couleurs, chacune avec un rôle précis.
 */
export const colors = {
  ink: '#141B2D', // texte principal (bleu nuit très foncé)
  inkMuted: '#56625B', // texte secondaire
  line: '#E1E6E3', // séparateurs
  surface: '#F2F5F3', // fonds de zones, champs
  bg: '#FFFFFF',
  // Direction artistique d'octobre 2026 : bleu vif de marque, bleu marine pour le nom, bleu pâle pour les tuiles
  primary: '#1E5EDB', // actions principales, icônes, liens « Voir tout » (contraste 5:1 sous texte blanc)
  primaryPressed: '#174BB0',
  navy: '#132F6B', // nom de la marque
  tint: '#EEF3FD', // fond des tuiles de catégories et des pastilles
  tintLine: '#DCE6FA',
  saffron: '#F5B700', // ancienne étiquette de prix (plus utilisée par défaut)
  trust: '#1B7F53', // identité vérifiée, confirmations
  danger: '#B83227',
  warningBg: '#FFF4D6', // encadré de sécurité
  whatsapp: '#177A43', // contraste 5:1 sous texte blanc
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// Police de l'application : Roboto Slab SemiBold (600), embarquée dans l'app (voir app.config.ts)
// et chargée au démarrage pour Expo Go et le web (app/_layout.tsx). Utilisée par src/components/Typography.
export const FONT = 'Inter_500Medium'; // police de l'application (Inter, maquette du porteur, 18 octobre 2026)
// Titres des annonces (listes, cartes, page d'annonce) : Google Sans SemiBold, choix du porteur (12 octobre 2026)
// Prix : Roboto Slab ExtraBold, bien plus gras que le reste du texte (demande du porteur, 12 octobre 2026)
export const PRICE_FONT = 'Inter_800ExtraBold';
export const TITLE_FONT = 'Inter_700Bold';

export const type = {
  title: { fontSize: 22, lineHeight: 28, fontWeight: '800' as const, color: colors.ink },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '700' as const, color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink },
  small: { fontSize: 13, lineHeight: 18, color: colors.inkMuted },
};
