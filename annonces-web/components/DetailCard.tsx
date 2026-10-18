import type { ReactNode } from 'react';
import {
  bedOutline, briefcaseOutline, calendarNumberOutline, calendarOutline, cashOutline, cogOutline, cubeOutline, documentOutline,
  documentTextOutline, flameOutline, flashOutline, footstepsOutline, gridOutline, homeOutline, hourglassOutline, hardwareChipOutline,
  informationCircleOutline, locationOutline, pricetagOutline, resizeOutline, ribbonOutline, schoolOutline, serverOutline,
  shieldCheckmarkOutline, sparklesOutline, speedometerOutline, swapHorizontalOutline, timeOutline, triangleOutline,
} from 'ionicons/icons';
import { Ion } from './Ion';

/**
 * Cadre de la page d'annonce (maquette du porteur, 18 octobre 2026) : bandeau bleu pâle avec une pastille
 * bleu marine et son icône, le titre, et à droite une étiquette facultative (type d'annonce).
 */
export function DetailCard({ id, icon, title, chip, children }: { id: string; icon: string; title: string; chip?: ReactNode; children: ReactNode }) {
  return (
    <section className="detail-card" aria-labelledby={id}>
      <div className="detail-band">
        <span className="detail-icon"><Ion icon={icon} size={20} /></span>
        <h2 id={id}>{title}</h2>
        {chip ? <span className="detail-chip">{chip}</span> : null}
      </div>
      <div className="detail-body">{children}</div>
    </section>
  );
}

// Icône de chaque caractéristique (clé du formulaire de la catégorie) ; même liste que l'application
const FACT_ICONS: Record<string, string> = {
  category: gridOutline, condition: sparklesOutline, brand: pricetagOutline, model: cubeOutline, storage: serverOutline,
  ram: hardwareChipOutline, year: calendarOutline, mileage: speedometerOutline, fuel: flameOutline, gearbox: cogOutline,
  engine: flashOutline, customs: shieldCheckmarkOutline, title_deed: documentTextOutline, surface: triangleOutline, area: triangleOutline,
  deal: swapHorizontalOutline, property_type: homeOutline, rooms: bedOutline, bedrooms: bedOutline, furnished: cubeOutline,
  advance_months: cashOutline, size: resizeOutline, shoe_size: footstepsOutline, sector: briefcaseOutline, contract: documentOutline,
  schedule: timeOutline, experience: ribbonOutline, education: schoolOutline, rate_unit: timeOutline, place: locationOutline,
  availability: calendarNumberOutline, age: hourglassOutline,
};

/** Caractéristiques sur deux colonnes, chacune avec son icône, séparées par un trait vertical. */
export function FactGrid({ facts }: { facts: { key: string; label: string; value: string }[] }) {
  return (
    <dl className="fact-grid">
      {facts.map((f) => (
        <div key={f.key} className="fact">
          <span className="fact-icon"><Ion icon={FACT_ICONS[f.key] ?? informationCircleOutline} size={20} /></span>
          <span>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </span>
        </div>
      ))}
    </dl>
  );
}
