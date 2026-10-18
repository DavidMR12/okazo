import { describeAttributes, mergeForms, priceUnit, validateAttributes } from '../../src/categories/category-forms';

const parent = {
  condition: false,
  price: { label: 'Salaire mensuel', requestLabel: 'Salaire souhaité', types: ['fixed', 'contact'] as ('fixed' | 'contact')[], unit: 'mois' },
  fields: [
    { key: 'contract', label: 'Type de contrat', type: 'select' as const, required: true, options: [{ value: 'cdi', label: 'CDI' }, { value: 'cdd', label: 'CDD' }] },
    { key: 'sector', label: 'Secteur', type: 'select' as const, options: [{ value: 'btp', label: 'BTP' }] },
  ],
};

describe('Formulaires des catégories', () => {
  it('une sous-catégorie hérite des champs de sa catégorie principale et peut les compléter', () => {
    const form = mergeForms(parent, { fields: [{ key: 'years', label: 'Années', type: 'number', min: 0, max: 50 }] });
    expect(form.fields.map((f) => f.key)).toEqual(['contract', 'sector', 'years']);
    expect(form.condition).toBe(false);
    expect(form.price.label).toBe('Salaire mensuel');
  });

  it('peut remplacer les champs de sa catégorie principale (terrain sans pièces ni chambres)', () => {
    const form = mergeForms(parent, { replaceParentFields: true, fields: [{ key: 'surface', label: 'Surface', type: 'number', unit: 'm²' }] });
    expect(form.fields.map((f) => f.key)).toEqual(['surface']);
  });

  it('formulaire par défaut : prix libre et « état » proposé', () => {
    const form = mergeForms(null, null);
    expect(form).toEqual({ fields: [], price: { label: 'Prix', requestLabel: 'Budget', types: ['fixed', 'negotiable', 'free', 'contact'] }, condition: true });
  });

  it('valide, nettoie et ignore les champs inconnus', () => {
    const form = mergeForms(null, {
      fields: [
        { key: 'brand', label: 'Marque', type: 'select', required: true, options: [{ value: 'toyota', label: 'Toyota' }] },
        { key: 'year', label: 'Année', type: 'number', min: 1960, max: 2027 },
        { key: 'model', label: 'Modèle', type: 'text', maxLength: 20 },
      ],
    });
    expect(validateAttributes(form, { brand: 'toyota', year: '2012', model: '  Corolla   XLi ', pirate: 'x' }, 'offer')).toEqual({
      brand: 'toyota',
      year: 2012,
      model: 'Corolla XLi',
    });
    expect(() => validateAttributes(form, { year: 2012 }, 'offer')).toThrow(/Marque/);
    expect(validateAttributes(form, {}, 'request')).toEqual({}); // une demande n'a pas de champ obligatoire
    expect(() => validateAttributes(form, { brand: 'tesla' }, 'offer')).toThrow(/choisissez une valeur/);
    expect(() => validateAttributes(form, { brand: 'toyota', year: 1800 }, 'offer')).toThrow(/entre 1960 et 2027/);
    expect(() => validateAttributes(form, { brand: 'toyota', year: 2012.5 }, 'offer')).toThrow(/entier/);
    expect(() => validateAttributes(form, { brand: 'toyota', model: 'x'.repeat(21) }, 'offer')).toThrow(/20 caractères/);
  });

  it('caractéristiques lisibles et unité du prix', () => {
    const form = mergeForms(null, {
      price: { unitFrom: 'rate_unit' },
      fields: [
        { key: 'rate_unit', label: 'Tarif', type: 'select', options: [{ value: 'heure', label: 'À l’heure', unit: 'h' }, { value: 'forfait', label: 'Au forfait' }] },
        { key: 'mileage', label: 'Kilométrage', type: 'number', unit: 'km' },
        { key: 'year', label: 'Année', type: 'number' },
      ],
    });
    expect(describeAttributes(form, { rate_unit: 'heure', mileage: 98000, year: 2012, ghost: 1 })).toEqual([
      { key: 'rate_unit', label: 'Tarif', value: 'À l’heure' },
      { key: 'mileage', label: 'Kilométrage', value: '98 000 km' },
      { key: 'year', label: 'Année', value: '2012' },
    ]);
    expect(priceUnit(form, { rate_unit: 'heure' })).toBe('h');
    expect(priceUnit(form, { rate_unit: 'forfait' })).toBeNull();
    expect(priceUnit(mergeForms(parent, null), {})).toBe('mois');
  });
});
