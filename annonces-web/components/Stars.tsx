/** Étoiles dorées (repère universel), demi-étoiles comprises. Rendu serveur possible : aucun état. */
export const RATING_LABELS = ['', 'Très décevant', 'Décevant', 'Correct', 'Bien', 'Excellent'];

const Star = ({ fill }: { fill: 0 | 0.5 | 1 }) => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" aria-hidden focusable={false}>
    <defs>
      <linearGradient id={`half-${fill}`}>
        <stop offset={fill === 1 ? '100%' : fill === 0.5 ? '50%' : '0%'} stopColor="#F5B700" />
        <stop offset={fill === 1 ? '100%' : fill === 0.5 ? '50%' : '0%'} stopColor="transparent" />
      </linearGradient>
    </defs>
    <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z" fill={`url(#half-${fill})`} stroke="#F5B700" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

export function Stars({ value }: { value: number }) {
  return (
    <span className="stars" role="img" aria-label={`${String(value).replace('.', ',')} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} fill={value >= i ? 1 : value >= i - 0.5 ? 0.5 : 0} />
      ))}
    </span>
  );
}

/** « ★ 4,6 · 12 avis », ou « Pas encore d’avis ». */
export function RatingSummary({ avg, count, href }: { avg?: number | null; count?: number; href?: string }) {
  if (!count || avg === null || avg === undefined) return <span className="muted">Pas encore d’avis</span>;
  const text = (
    <>
      <Stars value={avg} /> <strong>{avg.toFixed(1).replace('.', ',')}</strong> <span className="muted">· {count} avis</span>
    </>
  );
  return href ? <a href={href} className="rating">{text}</a> : <span className="rating">{text}</span>;
}
