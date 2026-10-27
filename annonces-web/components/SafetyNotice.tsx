import { shieldCheckmarkOutline } from 'ionicons/icons';
import { safetyTips } from '@/lib/safety';
import { Ion } from './Ion';

/** Conseils « Avant de payer » : encadré bleu pâle avec bouclier, comme dans l'application (27 octobre 2026). */
export function SafetyNotice({ parentSlug }: { parentSlug?: string | null }) {
  const tips = safetyTips(parentSlug);
  return (
    <div className="safety safety-tips" role="note">
      <strong><span className="safety-icon"><Ion icon={shieldCheckmarkOutline} size={20} /></span>{tips.title}</strong>
      {tips.lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
    </div>
  );
}
