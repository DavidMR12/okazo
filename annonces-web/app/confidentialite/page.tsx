import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = { title: 'Confidentialité et cookies' };

/**
 * Trame à compléter et faire valider par un juriste : identité de l'éditeur, contact,
 * durées de conservation, autorités compétentes au Cameroun, au Gabon et au Congo.
 * Une politique de confidentialité accessible est exigée par Google AdSense et par les stores.
 */
export default function PrivacyPage() {
  return (
    <div className="narrow stack">
      <h1>Confidentialité et cookies</h1>
      <h2>Données que nous utilisons</h2>
      <p>Pour créer un compte : votre numéro de téléphone. Pour publier : le contenu de vos annonces et leurs photos. Pour la vérification d’identité : une photo de votre pièce d’identité et un selfie, consultés uniquement par notre équipe de vérification.</p>
      <h2>Pourquoi</h2>
      <p>Faire fonctionner le service, mettre en relation acheteurs et vendeurs, et lutter contre la fraude (signalements, identifiant d’appareil, vérification des annonces).</p>
      <h2>Messagerie</h2>
      <p>Vos conversations ne sont visibles que par vous et votre interlocuteur. Notre équipe de modération ne peut lire une conversation que si l’un des deux participants la signale, pour vérifier une arnaque ou un comportement insultant. Les messages sont analysés automatiquement pour afficher des avertissements de sécurité (paiement à l’avance, liens, demande de code), sans être lus par une personne.</p>
      <h2>Cookies</h2>
      <p>Cookies nécessaires : maintien de votre connexion et mémorisation de votre choix sur les cookies. Ils ne peuvent pas être désactivés.</p>
      <p>Publicité : {SITE_NAME} est financé par la publicité Google. Si vous acceptez, Google peut utiliser des cookies pour afficher des publicités adaptées à vos centres d’intérêt. Si vous refusez, les publicités ne sont pas personnalisées. Vous pouvez changer d’avis à tout moment avec le lien « Gérer les cookies » en bas de page.</p>
      <h2>Vos droits</h2>
      <p>Vous pouvez modifier vos informations ou supprimer votre compte depuis « Mon compte ». La suppression efface votre numéro, votre nom, vos annonces, vos favoris et vos documents d’identité.</p>
    </div>
  );
}
