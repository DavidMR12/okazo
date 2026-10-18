import { priceLabel } from '@/lib/format';
import type { PriceType } from '@/lib/types';

/** Le prix présenté comme une étiquette de marché : seul élément coloré des listes. */
export function PriceTag({ priceType, priceXaf, unit, large }: { priceType: PriceType; priceXaf: number | null; unit?: string | null; large?: boolean }) {
  const amount = (priceType === 'fixed' || priceType === 'negotiable') && priceXaf !== null;
  return (
    <span className={`price${large ? ' price-lg' : ''}`}>
      <span className="price-tag">{priceLabel(priceType, priceXaf)}{amount && unit ? ` / ${unit}` : ''}</span>
      {priceType === 'negotiable' ? <span className="price-note">À débattre</span> : null}
    </span>
  );
}
