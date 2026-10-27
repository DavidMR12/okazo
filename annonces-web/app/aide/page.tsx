import type { Metadata } from 'next';
import { checkmarkCircle, flagOutline, helpBuoyOutline, mailOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { DetailCard } from '@/components/DetailCard';
import { Ion } from '@/components/Ion';
import { SITE_NAME, SUPPORT_EMAIL } from '@/lib/site';

export const metadata: Metadata = { title: 'Aide et contact', description: `Questions fréquentes, conseils de sécurité et contact de ${SITE_NAME}.` };

// Questions fréquentes : mêmes réponses que dans l'application (app/help.tsx)
const FAQ: { q: string; a: string }[] = [
  { q: 'Publier une annonce coûte-t-il quelque chose ?', a: 'Non. La publication est gratuite. Chaque annonce est vérifiée avant sa mise en ligne, en général en quelques minutes.' },
  { q: 'Comment contacter un vendeur ?', a: 'Cliquez sur « Contacter » sur l’annonce : vous pouvez lui écrire dans la messagerie, et, s’il l’accepte, par WhatsApp ou par téléphone.' },
  { q: 'Comment payer ?', a: `Aucun paiement ne passe par ${SITE_NAME}. Vous payez le vendeur à la remise de l’article, en espèces ou par portefeuille électronique, après l’avoir vérifié.` },
  { q: 'Pourquoi mon annonce a-t-elle été refusée ?', a: 'Le motif est indiqué dans « Mes annonces ». Corrigez l’annonce puis renvoyez-la : elle repasse par une vérification rapide.' },
  { q: 'Comment faire vérifier mon identité ?', a: 'Depuis l’application mobile : « Mon compte » › Sécurité › Vérification d’identité (photo de la pièce d’identité et selfie). Réponse sous 48 h.' },
  { q: 'Comment supprimer mon compte ?', a: 'En bas de « Mon compte ». Vos annonces, favoris et documents sont effacés ; un code de confirmation vous est envoyé.' },
];

const TIPS = [
  'Ne payez jamais à l’avance, même un « acompte » ou des « frais de livraison ».',
  'Rencontrez le vendeur dans un lieu public, en journée, et vérifiez l’article avant de payer.',
  'Restez sur la messagerie : en cas de problème, vous pourrez signaler la conversation.',
  'Méfiez-vous d’un prix très inférieur au marché ou d’un vendeur pressé.',
  'Un vrai recruteur ne demande jamais d’argent (frais de dossier, formation, tenue).',
];

/** Aide et contact : questions fréquentes, conseils de sécurité, signalement, contact du support. */
export default function HelpPage() {
  return (
    <div className="account">
      <h1 className="pill-title">Aide et contact</h1>

      <DetailCard id="faq" icon={helpBuoyOutline} title="Questions fréquentes">
        <div className="faq-list">
          {FAQ.map((f, i) => (
            <details key={f.q} className="faq" open={i === 0}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </DetailCard>

      <div id="securite">
        <DetailCard id="h-tips" icon={shieldCheckmarkOutline} title="Conseils de sécurité">
          <ul className="tips">
            {TIPS.map((t) => (
              <li key={t}><Ion icon={checkmarkCircle} size={18} /> {t}</li>
            ))}
          </ul>
        </DetailCard>
      </div>

      <div id="signaler">
        <DetailCard id="h-report" icon={flagOutline} title="Signaler un contenu illicite">
          <p className="help-text">Arnaque, contrefaçon, objet interdit, contenu choquant : cliquez sur « Signaler » sur la page de l’annonce, ou sur le menu « ⋯ » d’une conversation. L’équipe de modération vérifie rapidement et peut retirer l’annonce ou suspendre le compte.</p>
        </DetailCard>
      </div>

      <DetailCard id="h-contact" icon={mailOutline} title="Nous contacter">
        {SUPPORT_EMAIL ? (
          <a href={`mailto:${SUPPORT_EMAIL}`} className="btn help-contact"><Ion icon={mailOutline} size={19} /> {SUPPORT_EMAIL}</a>
        ) : (
          <p className="help-text">L’adresse de contact sera indiquée ici très bientôt. En attendant, signalez un problème depuis l’annonce ou la conversation concernée.</p>
        )}
      </DetailCard>
    </div>
  );
}
