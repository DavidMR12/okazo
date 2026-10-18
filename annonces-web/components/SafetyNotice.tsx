import { safetyTips } from '@/lib/safety';

export function SafetyNotice({ parentSlug }: { parentSlug?: string | null }) {
  const tips = safetyTips(parentSlug);
  return (
    <div className="safety" role="note">
      <strong>{tips.title}</strong>
      {tips.lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
    </div>
  );
}
