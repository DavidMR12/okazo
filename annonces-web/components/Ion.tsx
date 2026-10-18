/**
 * Icône Ionicons (la même famille que l'application mobile), à la couleur du texte.
 * Le dessin vient du paquet « ionicons » (adresse data:) et sert de masque : aucune police d'icônes à télécharger.
 * Les icônes dessinées au trait (liste, crayon, versions « outline ») dépendent d'une feuille de style d'Ionicons
 * (épaisseur et couleur du trait) absente d'un masque : on l'ajoute dans le dessin, sinon elles sortent remplies ou vides.
 */
const STROKE_STYLE =
  "<style>.ionicon-fill-none{fill:none}.ionicon-stroke-width{stroke-width:32px}path,circle,line,rect,polyline,polygon,ellipse{stroke:black}</style>";

const withStrokes = (icon: string) => {
  if (!icon.startsWith('data:image/svg+xml;utf8,<svg') || !icon.includes('ionicon-')) return icon;
  const end = icon.indexOf('>') + 1;
  return icon.slice(0, end) + STROKE_STYLE + icon.slice(end);
};

export function Ion({ icon, size = 24, className }: { icon: string; size?: number; className?: string }) {
  const src = withStrokes(icon);
  return (
    <span
      aria-hidden
      className={className ? `ion ${className}` : 'ion'}
      style={{ width: size, height: size, WebkitMaskImage: `url("${src}")`, maskImage: `url("${src}")` }}
    />
  );
}
