import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SUPPORT_EMAIL } from '../src/brand';
import { SafetyNote } from '../src/components/Blocks';
import { DetailCard } from '../src/components/DetailCard';
import { Text } from '../src/components/Typography';
import { colors, space } from '../src/theme';

// Questions fréquentes : réponses courtes, conformes au fonctionnement réel de l'application
const FAQ: { q: string; a: string }[] = [
  { q: 'Publier une annonce coûte-t-il quelque chose ?', a: 'Non. La publication est gratuite. Chaque annonce est vérifiée avant sa mise en ligne, en général en quelques minutes.' },
  { q: 'Comment contacter un vendeur ?', a: 'Touchez « Contacter » sur l’annonce : vous pouvez lui écrire dans la messagerie, et, s’il l’accepte, par WhatsApp ou par téléphone.' },
  { q: 'Comment payer ?', a: 'Aucun paiement ne passe par l’application. Vous payez le vendeur à la remise de l’article, en espèces ou par portefeuille électronique, après l’avoir vérifié.' },
  { q: 'Pourquoi mon annonce a-t-elle été refusée ?', a: 'Le motif est indiqué dans « Mes annonces ». Corrigez l’annonce puis renvoyez-la : elle repasse par une vérification rapide.' },
  { q: 'Comment faire vérifier mon identité ?', a: 'Depuis « Mon compte » › Sécurité › Vérification d’identité : une photo de votre pièce d’identité et un selfie. Réponse sous 48 h.' },
  { q: 'Comment supprimer mon compte ?', a: 'En bas de « Mon compte ». Vos annonces, favoris et documents sont effacés ; un code de confirmation vous est envoyé.' },
];

const TIPS = [
  'Ne payez jamais à l’avance, même un « acompte » ou des « frais de livraison ».',
  'Rencontrez le vendeur dans un lieu public, en journée, et vérifiez l’article avant de payer.',
  'Restez sur la messagerie : en cas de problème, vous pourrez signaler la conversation.',
  'Méfiez-vous d’un prix très inférieur au marché ou d’un vendeur pressé.',
  'Un vrai recruteur ne demande jamais d’argent (frais de dossier, formation, tenue).',
];

/** Aide et contact : questions fréquentes, conseils de sécurité, contact du support. */
export default function HelpScreen() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <ScrollView contentContainerStyle={styles.container} style={{ backgroundColor: colors.bg }}>
      <DetailCard icon="help-buoy-outline" title="Questions fréquentes">
        <View style={{ gap: space.sm }}>
          {FAQ.map((f, i) => (
            <Pressable key={f.q} onPress={() => setOpen(open === i ? null : i)} style={styles.faq} accessibilityRole="button" accessibilityState={{ expanded: open === i }}>
              <View style={styles.faqHead}>
                <Text style={styles.q}>{f.q}</Text>
                <Ionicons name={open === i ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkMuted} />
              </View>
              {open === i ? <Text style={styles.a}>{f.a}</Text> : null}
            </Pressable>
          ))}
        </View>
      </DetailCard>

      <DetailCard icon="shield-checkmark-outline" title="Conseils de sécurité">
        <View style={{ gap: space.sm }}>
          {TIPS.map((t) => (
            <View key={t} style={styles.tip}>
              <Ionicons name="checkmark-circle" size={18} color={colors.trust} />
              <Text style={styles.tipText}>{t}</Text>
            </View>
          ))}
        </View>
      </DetailCard>

      <DetailCard icon="mail-outline" title="Nous contacter">
        {SUPPORT_EMAIL ? (
          <Pressable onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} style={styles.contact} accessibilityRole="link">
            <Ionicons name="mail" size={18} color="#fff" />
            <Text style={styles.contactText}>{SUPPORT_EMAIL}</Text>
          </Pressable>
        ) : (
          <Text style={styles.a}>L’adresse de contact sera indiquée ici très bientôt. En attendant, signalez un problème depuis l’annonce ou la conversation concernée.</Text>
        )}
      </DetailCard>

      <View style={{ marginHorizontal: space.lg, marginTop: space.lg }}>
        <SafetyNote title="Une arnaque ? Signalez-la" text="Touchez « Signaler cette annonce » en bas d’une annonce, ou le menu « ⋯ » d’une conversation : l’équipe de modération vérifie rapidement." />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: space.xxl * 2 },
  faq: { borderRadius: 22, borderWidth: 1, borderColor: colors.tintLine, paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  faqHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  q: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  a: { fontSize: 14, lineHeight: 21, color: colors.inkMuted },
  tip: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  tipText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.ink },
  contact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 999, backgroundColor: colors.primary },
  contactText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
