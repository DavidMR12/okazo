// Formulaires des catégories (champs propres à chaque catégorie, façon LeBonCoin).
// Génère une migration SQL : node db/forms/category-forms.js db/migrations/00X_….sql
// Pour modifier un formulaire : changer ce fichier, générer une NOUVELLE migration (ne jamais réécrire une migration appliquée).
// Format stocké dans categories.attributes_schema :
//   { fields: [...], price: { label, requestLabel, types, unit, unitFrom }, condition: boolean }
// Les champs d'une catégorie principale s'appliquent à toutes ses sous-catégories (l'API fusionne).
const opt = (...labels) => labels.map((l) => (Array.isArray(l) ? { value: l[0], label: l[1], ...(l[2] ? { unit: l[2] } : {}) } : { value: slug(l), label: l }));
function slug(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
const YEAR = new Date().getFullYear() + 1;

const forms = {
  // ---------------------------------------------------------------- emploi
  emploi: {
    condition: false,
    price: { label: 'Salaire mensuel', requestLabel: 'Salaire souhaité', types: ['fixed', 'negotiable', 'contact'], unit: 'mois' },
    fields: [
      { key: 'contract', label: 'Type de contrat', type: 'select', required: true, filter: true,
        options: opt('CDI', 'CDD', 'Intérim', 'Stage', 'Apprentissage', ['freelance', 'Freelance ou indépendant'], ['journalier', 'Journalier']) },
      { key: 'schedule', label: 'Temps de travail', type: 'select', filter: true,
        options: opt('Temps plein', 'Temps partiel', 'Week-end', ['ponctuel', 'Ponctuel ou à la tâche']) },
      { key: 'sector', label: 'Secteur', type: 'select', filter: true,
        options: opt('Commerce et vente', 'Restauration et hôtellerie', ['btp', 'BTP et construction'], 'Transport et chauffeurs', 'Santé',
          'Éducation et formation', 'Informatique et télécoms', 'Administratif et comptabilité', 'Agriculture et élevage',
          'Sécurité et gardiennage', ['menage', 'Ménage et services à domicile'], 'Beauté et coiffure', 'Industrie et artisanat', 'Autre') },
      { key: 'experience', label: 'Expérience', type: 'select', filter: true,
        options: opt(['debutant', 'Débutant accepté'], ['1_2', '1 à 2 ans'], ['3_5', '3 à 5 ans'], ['5_plus', 'Plus de 5 ans']) },
      { key: 'education', label: 'Diplôme', type: 'select',
        options: opt(['aucun', 'Aucun diplôme exigé'], ['cep_bepc', 'CEP ou BEPC'], ['bac', 'Probatoire ou Bac'], ['bac_2_3', 'BTS ou Licence'], ['bac_5', 'Master ou plus']) },
    ],
  },

  // ---------------------------------------------------------------- services
  services: {
    condition: false,
    price: { label: 'Tarif', requestLabel: 'Budget', types: ['fixed', 'negotiable', 'contact'], unitFrom: 'rate_unit' },
    fields: [
      { key: 'rate_unit', label: 'Le tarif est', type: 'select', required: true,
        options: opt(['heure', 'À l’heure', 'h'], ['jour', 'À la journée', 'jour'], ['forfait', 'Au forfait'], ['devis', 'Sur devis']) },
      { key: 'place', label: 'Lieu de la prestation', type: 'select', filter: true,
        options: opt(['domicile', 'À domicile'], ['chez_moi', 'Chez le prestataire'], ['les_deux', 'Les deux']) },
      { key: 'area', label: 'Zone d’intervention', type: 'text', maxLength: 80, placeholder: 'Ex. : Akwa, Bonapriso, Bonanjo' },
      { key: 'availability', label: 'Disponibilités', type: 'select',
        options: opt('En semaine', 'Le week-end', 'Le soir', 'Tous les jours') },
    ],
  },

  // ---------------------------------------------------------------- véhicules
  voitures: {
    price: { label: 'Prix' },
    fields: [
      { key: 'brand', label: 'Marque', type: 'select', required: true, filter: true,
        options: opt('Toyota', 'Hyundai', 'Kia', ['mercedes', 'Mercedes-Benz'], 'Nissan', 'Mitsubishi', 'Peugeot', 'Renault', 'Honda',
          'Ford', 'Volkswagen', 'Suzuki', 'Lexus', 'BMW', 'Land Rover', 'Isuzu', 'Chevrolet', 'Mazda', 'Autre') },
      { key: 'model', label: 'Modèle', type: 'text', maxLength: 40, placeholder: 'Ex. : Corolla, RAV4, Tucson' },
      { key: 'year', label: 'Année', type: 'number', min: 1960, max: YEAR, required: true, filter: true },
      { key: 'mileage', label: 'Kilométrage', type: 'number', min: 0, max: 2000000, unit: 'km', filter: true },
      { key: 'fuel', label: 'Carburant', type: 'select', filter: true, options: opt('Essence', 'Diesel', 'Hybride', 'Électrique', 'GPL') },
      { key: 'gearbox', label: 'Boîte de vitesses', type: 'select', filter: true, options: opt('Manuelle', 'Automatique') },
      { key: 'customs', label: 'Dédouanement', type: 'select', filter: true, options: opt(['dedouane', 'Dédouané'], ['non_dedouane', 'Non dédouané']) },
    ],
  },
  motos: {
    fields: [
      { key: 'brand', label: 'Marque', type: 'select', required: true, filter: true,
        options: opt('Yamaha', 'Honda', 'Suzuki', 'Haojue', 'Nanfang', 'Lifan', 'TVS', 'Bajaj', 'Kawasaki', 'Autre') },
      { key: 'year', label: 'Année', type: 'number', min: 1960, max: YEAR, filter: true },
      { key: 'mileage', label: 'Kilométrage', type: 'number', min: 0, max: 500000, unit: 'km', filter: true },
      { key: 'engine', label: 'Cylindrée', type: 'number', min: 49, max: 2000, unit: 'cm³', filter: true },
      { key: 'customs', label: 'Dédouanement', type: 'select', filter: true, options: opt(['dedouane', 'Dédouané'], ['non_dedouane', 'Non dédouané']) },
    ],
  },

  // ---------------------------------------------------------------- immobilier
  immobilier: {
    condition: false,
    price: { label: 'Prix', requestLabel: 'Budget' },
    fields: [
      { key: 'property_type', label: 'Type de bien', type: 'select', required: true, filter: true,
        options: opt('Appartement', ['maison', 'Maison ou villa'], 'Studio', 'Chambre', 'Duplex', 'Bureau', ['boutique', 'Boutique ou local commercial'], 'Entrepôt') },
      { key: 'rooms', label: 'Pièces', type: 'number', min: 1, max: 50, filter: true },
      { key: 'bedrooms', label: 'Chambres', type: 'number', min: 0, max: 30, filter: true },
      { key: 'surface', label: 'Surface', type: 'number', min: 1, max: 100000, unit: 'm²', filter: true },
    ],
  },
  'ventes-immobilieres': {
    fields: [
      { key: 'title_deed', label: 'Titre foncier', type: 'select', filter: true,
        options: opt(['avec', 'Avec titre foncier'], ['en_cours', 'Titre foncier en cours'], ['sans', 'Sans titre foncier']) },
    ],
  },
  locations: {
    price: { label: 'Loyer mensuel', requestLabel: 'Loyer maximum', types: ['fixed', 'negotiable', 'contact'], unit: 'mois' },
    fields: [
      { key: 'furnished', label: 'Ameublement', type: 'select', filter: true, options: opt('Meublé', 'Non meublé') },
      { key: 'advance_months', label: 'Avance demandée', type: 'number', min: 0, max: 24, unit: 'mois de loyer' },
    ],
  },
  colocations: {
    price: { label: 'Loyer mensuel', requestLabel: 'Loyer maximum', types: ['fixed', 'negotiable', 'contact'], unit: 'mois' },
    fields: [{ key: 'furnished', label: 'Ameublement', type: 'select', filter: true, options: opt('Meublé', 'Non meublé') }],
  },
  'bureaux-commerces': {
    fields: [{ key: 'deal', label: 'Transaction', type: 'select', required: true, filter: true, options: opt(['vente', 'À vendre'], ['location', 'À louer']) }],
  },
  terrains: {
    // Un terrain n'a ni pièces ni chambres : seuls la surface et le titre foncier comptent
    replaceParentFields: true,
    fields: [
      { key: 'surface', label: 'Surface', type: 'number', min: 1, max: 10000000, unit: 'm²', required: true, filter: true },
      { key: 'title_deed', label: 'Titre foncier', type: 'select', required: true, filter: true,
        options: opt(['avec', 'Avec titre foncier'], ['en_cours', 'Titre foncier en cours'], ['sans', 'Sans titre foncier']) },
      { key: 'deal', label: 'Transaction', type: 'select', filter: true, options: opt(['vente', 'À vendre'], ['location', 'À louer']) },
    ],
  },

  // ---------------------------------------------------------------- électronique
  telephones: {
    fields: [
      { key: 'brand', label: 'Marque', type: 'select', required: true, filter: true,
        options: opt('Samsung', ['apple', 'Apple (iPhone)'], 'Tecno', 'Infinix', 'Itel', 'Xiaomi', 'Huawei', 'Oppo', 'Nokia', 'Google', 'Autre') },
      { key: 'storage', label: 'Stockage', type: 'select', filter: true, options: opt(['16', '16 Go'], ['32', '32 Go'], ['64', '64 Go'], ['128', '128 Go'], ['256', '256 Go'], ['512', '512 Go'], ['1024', '1 To']) },
    ],
  },
  tablettes: {
    fields: [
      { key: 'brand', label: 'Marque', type: 'select', filter: true, options: opt('Samsung', ['apple', 'Apple (iPad)'], 'Lenovo', 'Huawei', 'Tecno', 'Autre') },
      { key: 'storage', label: 'Stockage', type: 'select', filter: true, options: opt(['16', '16 Go'], ['32', '32 Go'], ['64', '64 Go'], ['128', '128 Go'], ['256', '256 Go'], ['512', '512 Go']) },
    ],
  },
  ordinateurs: {
    fields: [
      { key: 'brand', label: 'Marque', type: 'select', required: true, filter: true, options: opt('HP', 'Dell', 'Lenovo', ['apple', 'Apple (Mac)'], 'Asus', 'Acer', 'Toshiba', 'Microsoft', 'Autre') },
      { key: 'ram', label: 'Mémoire vive', type: 'select', filter: true, options: opt(['4', '4 Go'], ['8', '8 Go'], ['16', '16 Go'], ['32', '32 Go'], ['64', '64 Go']) },
      { key: 'storage', label: 'Stockage', type: 'select', filter: true, options: opt(['128', '128 Go'], ['256', '256 Go'], ['512', '512 Go'], ['1024', '1 To'], ['2048', '2 To ou plus']) },
    ],
  },

  // ---------------------------------------------------------------- mode
  'vetements-femme': { fields: [{ key: 'size', label: 'Taille', type: 'select', filter: true, options: opt('XS', 'S', 'M', 'L', 'XL', 'XXL', ['3xl', '3XL et plus'], ['unique', 'Taille unique']) }] },
  'vetements-homme': { fields: [{ key: 'size', label: 'Taille', type: 'select', filter: true, options: opt('XS', 'S', 'M', 'L', 'XL', 'XXL', ['3xl', '3XL et plus'], ['unique', 'Taille unique']) }] },
  chaussures: { fields: [{ key: 'shoe_size', label: 'Pointure', type: 'number', min: 16, max: 50, filter: true }] },
  'vetements-enfant': { fields: [{ key: 'age', label: 'Âge', type: 'select', filter: true, options: opt(['0_1', '0 à 1 an'], ['1_3', '1 à 3 ans'], ['4_7', '4 à 7 ans'], ['8_12', '8 à 12 ans'], ['13_16', '13 à 16 ans']) }] },

  // ---------------------------------------------------------------- animaux
  animaux: { condition: false },
};

forms.utilitaires = forms.voitures; // mêmes champs que les voitures

const json = (o) => JSON.stringify(o).replace(/'/g, "''");
const lines = Object.entries(forms).map(([s, f]) => `UPDATE categories SET attributes_schema = '${json(f)}'::jsonb WHERE slug = '${s}';`);
const sql = `-- =====================================================================
-- Migration 006 : champs propres à chaque catégorie (formulaires façon LeBonCoin)
-- Format de categories.attributes_schema :
--   { "fields": [...], "price": { "label", "requestLabel", "types", "unit", "unitFrom" }, "condition": bool }
-- Les champs d'une catégorie principale valent pour ses sous-catégories (fusion dans l'API,
-- sauf "replaceParentFields"). Champs : select (options), number (min, max, unit), text (maxLength).
-- "required" : obligatoire pour proposer ; "filter" : utilisable comme filtre de recherche.
-- Modifiable sans redéploiement : une nouvelle migration UPDATE suffit.
-- =====================================================================
BEGIN;

${lines.join('\n\n')}

COMMIT;
`;
require('fs').writeFileSync(process.argv[2], sql);
console.log(`${lines.length} catégories décrites`);
