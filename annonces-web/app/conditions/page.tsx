import type { Metadata } from 'next';
import Link from 'next/link';
import { CGU_VERSION, SITE_NAME } from '@/lib/site';

export const metadata: Metadata = { title: 'Conditions générales d’utilisation' };

/*
 * PROJET À FAIRE VALIDER PAR UN JURISTE (Cameroun, puis Gabon et Congo) avant la mise en ligne.
 * À compléter : identité de l'éditeur (société, RCCM, NIU, siège, représentant, contact), hébergeur.
 * Textes à vérifier par le juriste (cités ici seulement pour lui, pas dans la page) :
 *  - loi n° 2010/021 du 21 décembre 2010 régissant le commerce électronique au Cameroun (responsabilité des
 *    intermédiaires techniques, obligations d'information) ;
 *  - loi-cadre n° 2011/012 du 6 mai 2011 portant protection du consommateur au Cameroun (clauses abusives,
 *    règles impératives que les conditions ne peuvent pas écarter) ;
 *  - loi n° 2010/012 du 21 décembre 2010 relative à la cybersécurité et à la cybercriminalité au Cameroun ;
 *  - loi n° 2024/017 du 23 décembre 2024 relative à la protection des données à caractère personnel ;
 *  - Acte uniforme OHADA relatif à la médiation (2017) pour l'étape amiable ;
 *  - équivalents gabonais et congolais pour les utilisateurs de ces pays.
 * Limites connues : une exclusion totale de responsabilité et une clause attributive de juridiction peuvent être
 * jugées abusives face à un consommateur ; elles sont donc rédigées « dans les limites permises par la loi ».
 */
export default function TermsPage() {
  const dev = process.env.NODE_ENV !== 'production';
  return (
    <div className="narrow stack legal">
      {dev ? <p className="notice-warn">Projet de conditions, à faire valider par un juriste avant la mise en ligne. Les passages entre crochets sont à compléter.</p> : null}
      <h1>Conditions générales d’utilisation</h1>
      <p className="muted">Version du {new Date(CGU_VERSION).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>

      <h2>1. Qui sommes-nous</h2>
      <p>{SITE_NAME} est un service de petites annonces entre particuliers et professionnels, édité par [raison sociale], [forme juridique] au capital de [montant] FCFA, immatriculée au RCCM de [ville] sous le n° [numéro], NIU [numéro], dont le siège est situé [adresse], représentée par [nom et fonction]. Contact : [adresse e-mail] ou par la messagerie du service.</p>

      <h2>2. Ce que fait {SITE_NAME}, et ce qu’il ne fait pas</h2>
      <p>{SITE_NAME} met en relation des personnes qui proposent ou recherchent des biens, des services ou des emplois. Nous fournissons l’espace de publication, la messagerie et des outils de sécurité.</p>
      <p><strong>{SITE_NAME} n’est ni vendeur, ni acheteur, ni employeur, ni intermédiaire de paiement.</strong> Nous ne sommes pas partie aux contrats conclus entre utilisateurs, nous ne détenons pas les biens et nous ne recevons aucun paiement pour le compte des utilisateurs. La vente, le service ou l’emploi se concluent directement entre les personnes concernées, sous leur seule responsabilité.</p>
      <p>Les moyens de paiement électronique affichés sur une annonce (Mobile Money, Orange Money, Wave…) indiquent seulement ce que le vendeur déclare accepter. Le paiement se fait directement entre l’acheteur et le vendeur ; {SITE_NAME} n’y intervient pas.</p>

      <h2>3. Acceptation des conditions</h2>
      <p>En créant un compte ou en utilisant le service, vous acceptez les présentes conditions. Si vous ne les acceptez pas, n’utilisez pas le service. Nous pouvons les modifier ; la nouvelle version est publiée sur cette page et vous est présentée à votre prochaine connexion. Continuer à utiliser le service vaut acceptation de la nouvelle version.</p>

      <h2>4. Votre compte</h2>
      <ul>
        <li>Vous devez avoir au moins 18 ans, ou l’accord de vos parents, et fournir des informations exactes.</li>
        <li>Un numéro de téléphone vérifié est exigé pour publier, contacter un vendeur, écrire, faire une offre ou postuler. Une même personne ne doit pas utiliser plusieurs comptes pour contourner une sanction.</li>
        <li>Votre compte est personnel : vous êtes responsable de ce qui est fait avec. Ne communiquez jamais un code reçu par SMS, WhatsApp ou e-mail, ni votre mot de passe. <strong>{SITE_NAME} ne vous demandera jamais ces codes.</strong></li>
        <li>La vérification d’identité, quand elle est demandée, confirme qu’une pièce a été présentée ; elle ne garantit pas l’honnêteté de la personne.</li>
      </ul>

      <h2>5. Règles pour publier</h2>
      <p>Vous publiez sous votre seule responsabilité. Vous vous engagez à ce que chaque annonce :</p>
      <ul>
        <li>porte sur un bien qui vous appartient ou que vous avez le droit de vendre, ou sur un service ou un emploi réel ;</li>
        <li>soit exacte (état, prix, photos de l’article lui-même, défauts signalés) ;</li>
        <li>respecte la loi : sont notamment interdits les armes, les médicaments et produits de santé, les drogues, les animaux protégés, les contrefaçons, les biens volés, les documents officiels, les contenus pour adultes, les offres d’emploi exigeant un paiement du candidat, les placements « à rendement garanti » et toute activité illégale.</li>
      </ul>
      <p>Chaque annonce est vérifiée avant sa mise en ligne, et de nouveau après chaque modification. Nous pouvons refuser, suspendre ou retirer une annonce, sans indemnité, si elle ne respecte pas ces règles ou si elle présente un risque de fraude. Vous nous autorisez à afficher, adapter (format, compression) et diffuser gratuitement le contenu de vos annonces pour faire fonctionner et promouvoir le service, tant qu’elles sont en ligne.</p>

      <h2>6. Votre sécurité : règles contre les arnaques</h2>
      <p>La plupart des arnaques suivent les mêmes schémas. Pour vous protéger :</p>
      <ul>
        <li><strong>Ne payez jamais à l’avance</strong>, ni acompte, ni « frais de livraison », ni « frais de dossier », par Mobile Money, transfert ou carte, à quelqu’un que vous n’avez pas rencontré.</li>
        <li>Rencontrez le vendeur dans un lieu public, de jour, et <strong>vérifiez l’article avant de payer</strong> (et les papiers d’un véhicule ou d’un bien immobilier auprès des services compétents).</li>
        <li>Après un paiement Mobile Money, vérifiez votre solde dans l’application de votre opérateur : un SMS de confirmation peut être faux.</li>
        <li>Méfiez-vous des prix trop bas, des vendeurs pressés, des personnes qui refusent la rencontre ou qui veulent poursuivre la discussion hors de {SITE_NAME}.</li>
        <li>Un recruteur sérieux ne demande jamais d’argent à un candidat.</li>
        <li>Ne communiquez jamais un code reçu par SMS, WhatsApp ou e-mail : c’est la clé de votre compte ou de votre portefeuille.</li>
      </ul>
      <p>Signalez toute annonce, conversation ou personne suspecte avec le bouton « Signaler ». Nous examinons chaque signalement et pouvons suspendre ou bannir un compte, bloquer un numéro ou un appareil, et conserver les éléments utiles à une plainte.</p>

      <h2>7. Comportements interdits et sanctions</h2>
      <p>Sont interdits notamment : la fraude et la tentative d’escroquerie, l’usurpation d’identité, le harcèlement et les insultes, le spam, la collecte des coordonnées d’autres utilisateurs, les faux avis, le contournement des sanctions et toute atteinte au fonctionnement du service.</p>
      <p>Selon la gravité, nous pouvons, sans préavis ni indemnité : retirer un contenu, limiter les fonctions d’un compte, le suspendre (30 jours au plus par un modérateur) ou le bannir définitivement, et refuser toute nouvelle inscription avec le même numéro ou le même appareil. Vous pouvez contester une décision en nous écrivant (article 12).</p>

      <h2>8. Coopération avec les autorités</h2>
      <p>En cas de fraude ou d’infraction, nous conservons les éléments nécessaires (annonces, conversations signalées, numéro, appareil, dates de connexion) pendant la durée prévue par la loi, et nous les communiquons aux autorités judiciaires ou de police qui en font la demande dans les formes légales. Les victimes sont invitées à porter plainte auprès des services de police ou de gendarmerie.</p>

      <h2>9. Responsabilité</h2>
      <p>Dans les limites permises par la loi applicable :</p>
      <ul>
        <li>{SITE_NAME} agit comme intermédiaire technique : nous ne sommes pas responsables du contenu des annonces et des messages publiés par les utilisateurs, ni de l’exécution des ventes, services ou emplois conclus entre eux (qualité, conformité, paiement, livraison, garantie). Nous agissons promptement pour retirer un contenu manifestement illicite qui nous est signalé.</li>
        <li>Nos outils de sécurité (vérification des annonces, avertissements, vérification d’identité, avis) réduisent les risques mais ne les suppriment pas : ils ne constituent pas une garantie sur une personne ou un article.</li>
        <li>Le service est fourni « en l’état ». Nous faisons notre possible pour qu’il soit disponible, sans pouvoir garantir l’absence d’interruption, notamment pour maintenance, panne du réseau ou de l’opérateur, ou cas de force majeure.</li>
        <li>Notre responsabilité ne peut être engagée que pour un manquement qui nous est directement imputable, et elle est limitée au préjudice direct et prévisible. Le service étant gratuit pour les utilisateurs, elle ne peut excéder [montant] FCFA, sauf faute lourde ou intentionnelle de notre part, ou disposition légale impérative contraire.</li>
      </ul>

      <h2>10. Votre responsabilité envers nous</h2>
      <p>Vous êtes responsable des contenus que vous publiez et de vos échanges avec les autres utilisateurs. Si une réclamation, une action ou une sanction est dirigée contre {SITE_NAME} en raison de vos annonces, de vos messages ou de votre manquement aux présentes conditions, vous vous engagez à nous en garantir et à nous indemniser, dans les limites permises par la loi.</p>

      <h2>11. Données personnelles</h2>
      <p>Nous utilisons vos données pour faire fonctionner le service et lutter contre la fraude, comme expliqué dans la page <Link href="/confidentialite">Confidentialité et cookies</Link>. Votre numéro n’est jamais affiché dans une annonce ; il n’est communiqué qu’à un utilisateur connecté qui le demande, sauf si vous choisissez « Messagerie uniquement ».</p>

      <h2>12. Réclamations et règlement amiable</h2>
      <p>Avant toute action en justice, vous acceptez de nous adresser une réclamation écrite et détaillée ([adresse e-mail] ou [adresse postale]). Nous y répondons dans un délai de 30 jours. Si le désaccord persiste, les parties s’efforcent de le régler à l’amiable, le cas échéant par une médiation, pendant 30 jours supplémentaires. Cette étape ne vous prive pas du droit de saisir les autorités en cas d’infraction pénale ou d’urgence.</p>
      <p>Les litiges entre utilisateurs (vente, paiement, service, emploi) se règlent entre eux ; {SITE_NAME} peut, sans y être obligé, transmettre les éléments dont il dispose aux autorités saisies.</p>

      <h2>13. Droit applicable et tribunaux compétents</h2>
      <p>Les présentes conditions sont soumises au droit camerounais. À défaut d’accord amiable, tout litige relatif à leur interprétation ou à leur exécution relève de la compétence exclusive des juridictions de Douala (Cameroun), y compris en cas de pluralité de défendeurs ou d’appel en garantie, sauf disposition légale impérative contraire, notamment celles qui protègent le consommateur dans son pays de résidence.</p>

      <h2>14. Durée, suppression du compte</h2>
      <p>Les conditions s’appliquent tant que vous utilisez le service. Vous pouvez supprimer votre compte à tout moment depuis « Mon compte ». Nous pouvons fermer un compte qui ne respecte pas ces conditions (article 7). Les articles 8, 9, 10, 12 et 13 continuent de s’appliquer après la fermeture du compte.</p>

      <h2>15. Dispositions générales</h2>
      <p>Si une clause est jugée nulle, les autres restent applicables. Le fait de ne pas faire valoir un droit ne vaut pas renonciation à ce droit. En cas de traduction, la version française fait foi.</p>
    </div>
  );
}
