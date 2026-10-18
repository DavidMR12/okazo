import { RuleHit, ruleLabel } from '@/lib/admin';

/** Rouge : la règle aurait refusé l'annonce. Ambre : relecture demandée. */
export function RuleBadges({ hits }: { hits: RuleHit[] }) {
  if (!hits.length) return <span className="muted">Aucune règle déclenchée</span>;
  return (
    <span className="badges">
      {hits.map((h, i) => (
        <span key={`${h.rule}-${i}`} className={`badge ${h.severity === 'reject' ? 'badge-red' : 'badge-amber'}`}>{ruleLabel(h)}</span>
      ))}
    </span>
  );
}
