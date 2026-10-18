/**
 * Drapeaux des pays de la zone, dessinés en SVG : les émojis drapeaux ne s'affichent pas sous Windows
 * (on y verrait « CM » au lieu du drapeau).
 */
const STAR = (cx: number, cy: number, r: number, fill: string) => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.4 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
  return <polygon points={pts} fill={fill} />;
};

const FLAGS: Record<string, React.ReactNode> = {
  // Cameroun : vert, rouge, jaune, étoile jaune au centre
  CM: (
    <>
      <rect width="10" height="20" fill="#007A5E" />
      <rect x="10" width="10" height="20" fill="#CE1126" />
      <rect x="20" width="10" height="20" fill="#FCD116" />
      {STAR(15, 10, 4, '#FCD116')}
    </>
  ),
  // Gabon : vert, jaune, bleu (bandes horizontales)
  GA: (
    <>
      <rect width="30" height="6.67" fill="#009E60" />
      <rect y="6.67" width="30" height="6.67" fill="#FCD116" />
      <rect y="13.33" width="30" height="6.67" fill="#3A75C4" />
    </>
  ),
  // Congo : vert et rouge séparés par une bande jaune en diagonale
  CG: (
    <>
      <rect width="30" height="20" fill="#FBDE4A" />
      <polygon points="0,0 20,0 0,20" fill="#009543" />
      <polygon points="30,0 30,20 10,20" fill="#DC241F" />
    </>
  ),
  // Tchad : bleu, jaune, rouge
  TD: (
    <>
      <rect width="10" height="20" fill="#002664" />
      <rect x="10" width="10" height="20" fill="#FECB00" />
      <rect x="20" width="10" height="20" fill="#C60C30" />
    </>
  ),
  // Centrafrique : bandes bleu, blanc, vert, jaune, bande rouge verticale, étoile jaune
  CF: (
    <>
      <rect width="30" height="5" fill="#003082" />
      <rect y="5" width="30" height="5" fill="#FFFFFF" />
      <rect y="10" width="30" height="5" fill="#289728" />
      <rect y="15" width="30" height="5" fill="#FFCE00" />
      <rect x="12.5" width="5" height="20" fill="#D21034" />
      {STAR(4, 2.5, 2, '#FFCE00')}
    </>
  ),
  // Guinée équatoriale : vert, blanc, rouge, triangle bleu
  GQ: (
    <>
      <rect width="30" height="6.67" fill="#3E9A00" />
      <rect y="6.67" width="30" height="6.67" fill="#FFFFFF" />
      <rect y="13.33" width="30" height="6.67" fill="#E32118" />
      <polygon points="0,0 9,10 0,20" fill="#0073CE" />
    </>
  ),
};

export function Flag({ code, width = 24 }: { code: string; width?: number }) {
  return (
    <svg className="flag" width={width} height={(width * 2) / 3} viewBox="0 0 30 20" aria-hidden focusable={false}>
      {FLAGS[code] ?? <rect width="30" height="20" fill="#DCE6FA" />}
    </svg>
  );
}
