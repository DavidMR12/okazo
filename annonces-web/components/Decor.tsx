import {
  bagHandleOutline, bookmarkOutline, cardOutline, cartOutline, chatboxOutline, chatbubbleEllipsesOutline, chatbubbleOutline,
  chatbubblesOutline, cubeOutline, giftOutline, happyOutline, heart, heartOutline, mailOutline, paperPlaneOutline, personOutline,
  pricetagOutline, pricetagsOutline, shieldCheckmarkOutline, sparklesOutline, starOutline, storefrontOutline,
} from 'ionicons/icons';
import { Ion } from './Ion';

// Jeux d'icônes de chaque écran (mêmes que l'application)
export const DECOR_FAVORITES = [heartOutline, pricetagOutline, heart, starOutline, bookmarkOutline, heartOutline, sparklesOutline];
export const DECOR_MESSAGES = [chatbubbleOutline, chatbubblesOutline, mailOutline, chatbubbleEllipsesOutline, paperPlaneOutline, happyOutline, chatboxOutline];
export const DECOR_CART = [cartOutline, bagHandleOutline, pricetagOutline, cubeOutline, storefrontOutline, giftOutline, cardOutline];
export const DECOR_ACCOUNT = [personOutline, pricetagsOutline, heartOutline, chatbubblesOutline, shieldCheckmarkOutline];

// Positions des icônes en filigrane : réparties sur toute la surface, tailles et inclinaisons variées (comme l'application)
const SPOTS = [
  { top: '5%', left: '6%', size: 38, rotate: -14, opacity: 0.16 },
  { top: '9%', right: '8%', size: 52, rotate: 12, opacity: 0.12 },
  { top: '40%', left: '-1%', size: 58, rotate: 8, opacity: 0.1 },
  { top: '34%', right: '-2%', size: 44, rotate: -10, opacity: 0.14 },
  { bottom: '8%', left: '14%', size: 46, rotate: 16, opacity: 0.12 },
  { bottom: '5%', right: '16%', size: 34, rotate: -18, opacity: 0.16 },
  { top: '66%', left: '44%', size: 28, rotate: 0, opacity: 0.1 },
] as const;

/**
 * Icônes décoratives en filigrane, posées en fond d'un encadré (demande du porteur, 20 octobre 2026 :
 * « Favoris » et « Messages » ne doivent pas paraître vides). Invisibles pour les lecteurs d'écran.
 */
export function Decor({ icons }: { icons: string[] }) {
  return (
    <span className="decor" aria-hidden>
      {SPOTS.map(({ size, rotate, opacity, ...pos }, i) => (
        <span key={i} className="decor-spot" style={{ ...pos, opacity, transform: `rotate(${rotate}deg)` }}>
          <Ion icon={icons[i % icons.length]} size={size} />
        </span>
      ))}
    </span>
  );
}

/** Bandeau décoratif sous une liste courte : icônes en filigrane et une phrase. */
export function DecorFooter({ icons, text }: { icons: string[]; text: string }) {
  return (
    <div className="decor-footer">
      <Decor icons={icons} />
      <p>{text}</p>
    </div>
  );
}
