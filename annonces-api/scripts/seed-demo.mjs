// Données fictives pour voir le site et l'application « remplis » (développement local uniquement).
// Usage : node scripts/seed-demo.mjs            → ajoute les données de démonstration
//         node scripts/seed-demo.mjs --reset    → efface toutes les données de démonstration
// Les comptes de démonstration ont un numéro +237 699 0x xx xx (plage réservée à la démo) : faciles à retrouver et à effacer.
// Les photos sont des visuels d'illustration générés (dégradé et titre), envoyés dans le stockage comme de vraies photos traitées.
import { DeleteObjectsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import postgres from 'postgres';
import sharp from 'sharp';

// ---------------------------------------------------------------- configuration (.env de l'API, sinon l'environnement du conteneur)
const ENV_FILE = new URL('../.env', import.meta.url);
const env = existsSync(ENV_FILE)
  ? Object.fromEntries(
      readFileSync(ENV_FILE, 'utf8')
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    )
  : process.env;
// Hors base locale : seulement pour l'avant-première fermée (PREVIEW_MODE), sur demande explicite.
// L'effacement (--reset) reste permis avec la seule demande explicite, pour tout nettoyer avant l'ouverture.
const AVANT_PREMIERE = process.env.DEMO_AVANT_PREMIERE === 'oui';
if (!/localhost|127\.0\.0\.1/.test(env.DATABASE_URL) && !(AVANT_PREMIERE && (env.PREVIEW_MODE === 'true' || process.argv.includes('--reset')))) {
  console.error('Refusé : ce script ne tourne que sur une base locale (ou en avant-première avec DEMO_AVANT_PREMIERE=oui).');
  process.exit(1);
}
const sql = postgres(env.DATABASE_URL, { max: 4, onnotice: () => {} });
const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION || 'us-east-1',
  forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
});
const BUCKET = env.S3_BUCKET;
const DEMO_PHONE = '+2376990%';

// ---------------------------------------------------------------- hasard reproductible
let seed = 20261012;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => Math.floor(a + rnd() * (b - a + 1));
const round = (n, step) => Math.max(step, Math.round(n / step) * step);

// ---------------------------------------------------------------- effacement
async function reset() {
  const keys = await sql`
    select li.storage_key from listing_images li join listings l on l.id = li.listing_id
      join users u on u.id = l.user_id where u.phone_e164 like ${DEMO_PHONE}`;
  const all = keys.flatMap((k) => [k.storage_key, k.storage_key.replace(/-1200\.webp$/, '-400.webp')]);
  for (let i = 0; i < all.length; i += 900) {
    await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: all.slice(i, i + 900).map((Key) => ({ Key })) } })).catch(() => undefined);
  }
  // Les annonces d'abord (leurs photos, conversations, avis et offres suivent), puis les comptes
  await sql`delete from listings where user_id in (select id from users where phone_e164 like ${DEMO_PHONE})`;
  const [{ n }] = await sql`
    with gone as (delete from users where phone_e164 like ${DEMO_PHONE} returning id) select count(*)::int as n from gone`;
  console.log(`Données de démonstration effacées : ${n} comptes, ${all.length} fichiers.`);
}

// ---------------------------------------------------------------- catalogue fictif
// [titre, prix minimum, prix maximum] par sous-catégorie ; « {ville} » est remplacé par le quartier ou la ville.
const ITEMS = {
  telephones: [['iPhone 13, 128 Go, très bon état', 230000, 320000], ['Samsung Galaxy A54, 128 Go', 140000, 190000], ['Tecno Camon 20 Pro, 256 Go', 95000, 130000], ['Infinix Note 30, sous garantie', 85000, 115000], ['iPhone 11, 64 Go, batterie 88 %', 150000, 190000], ['Xiaomi Redmi Note 12', 90000, 120000], ['Itel A70, neuf sous blister', 45000, 60000], ['Samsung Galaxy S22 Ultra', 380000, 480000], ['Huawei P30 Lite', 70000, 95000], ['Tecno Spark 10, 128 Go', 60000, 80000]],
  ordinateurs: [['HP EliteBook 840 G5, Core i5, 8 Go', 180000, 240000], ['Lenovo ThinkPad T480, SSD 256 Go', 170000, 220000], ['MacBook Air M1, 8 Go, 256 Go', 450000, 560000], ['Dell Latitude 5490, Core i7', 210000, 270000], ['Ordinateur de bureau HP + écran 22 pouces', 150000, 200000], ['Asus VivoBook 15, presque neuf', 230000, 290000]],
  'tv-audio': [['Télévision Samsung 43 pouces Smart TV', 160000, 220000], ['TV LG 55 pouces 4K', 290000, 360000], ['Barre de son JBL avec caisson', 90000, 140000], ['Enceinte Bluetooth JBL Charge 5', 70000, 95000], ['Décodeur Canal+ avec parabole', 25000, 40000]],
  tablettes: [['iPad 9e génération, 64 Go', 170000, 220000], ['Samsung Galaxy Tab A8', 110000, 150000], ['Tablette enfant Lenovo avec coque', 45000, 70000]],
  'consoles-jeux': [['PlayStation 5 avec deux manettes', 380000, 450000], ['PS4 Slim 500 Go + FIFA 23', 150000, 190000], ['Xbox Series S, comme neuve', 230000, 280000], ['Manette PS5 DualSense blanche', 35000, 45000]],
  'photo-video': [['Appareil photo Canon EOS 2000D + objectif', 230000, 300000], ['Caméra GoPro Hero 9', 160000, 210000], ['Trépied professionnel 1,70 m', 20000, 35000]],
  'accessoires-electroniques': [['Chargeur rapide Samsung 25 W d’origine', 8000, 12000], ['Écouteurs AirPods Pro', 90000, 130000], ['Batterie externe 20 000 mAh', 10000, 18000], ['Onduleur 1000 VA pour ordinateur', 45000, 65000]],
  voitures: [['Toyota Corolla {year}, climatisée', 3500000, 6500000], ['Toyota RAV4 {year}, 4x4', 7500000, 13000000], ['Hyundai Tucson {year}, automatique', 6500000, 11000000], ['Mercedes-Benz C200 {year}', 6000000, 12000000], ['Toyota Prado {year}, toutes options', 15000000, 28000000], ['Kia Rio {year}, faible consommation', 3000000, 5000000], ['Nissan X-Trail {year}', 5500000, 9000000], ['Toyota Yaris {year}, première main', 3200000, 5200000], ['Honda CR-V {year}', 5000000, 8500000], ['Peugeot 508 {year}, diesel', 4000000, 7000000]],
  motos: [['Moto Yamaha Crypton, très bon état', 450000, 650000], ['Moto Sanili 125, neuve', 550000, 700000], ['Scooter Honda PCX 150', 900000, 1300000], ['Moto TVS Apache 160', 750000, 950000]],
  'pieces-auto': [['Pneus Michelin 205/55 R16 (les 4)', 120000, 180000], ['Batterie de voiture 70 Ah', 45000, 65000], ['Phare avant Toyota Corolla', 35000, 60000], ['Jantes alliage 17 pouces', 150000, 250000]],
  utilitaires: [['Toyota Hiace {year}, 15 places', 9000000, 15000000], ['Camion Mitsubishi Canter {year}', 8000000, 14000000], ['Pick-up Toyota Hilux {year}', 12000000, 20000000]],
  locations: [['Appartement 2 chambres, salon, {ville}', 120000, 250000], ['Studio moderne meublé, {ville}', 70000, 130000], ['Chambre moderne avec douche interne, {ville}', 35000, 60000], ['Villa 4 chambres avec jardin, {ville}', 450000, 900000], ['Appartement 3 chambres neuf, {ville}', 200000, 380000]],
  'ventes-immobilieres': [['Maison 3 chambres titrée, {ville}', 25000000, 60000000], ['Duplex 5 chambres, {ville}', 80000000, 150000000], ['Immeuble R+2 à vendre, {ville}', 120000000, 250000000]],
  terrains: [['Terrain 500 m² titré, {ville}', 8000000, 25000000], ['Terrain 1 000 m² en bordure de route', 15000000, 40000000], ['Lot de 300 m² avec certificat de propriété', 5000000, 12000000]],
  colocations: [['Chambre en colocation, {ville}', 40000, 75000], ['Colocation étudiante proche université', 30000, 50000]],
  'bureaux-commerces': [['Boutique de 20 m² sur axe passant, {ville}', 100000, 250000], ['Bureau de 60 m² climatisé, {ville}', 250000, 500000]],
  'offres-emploi': [['Caissière pour supermarché, {ville}', 90000, 140000], ['Commercial terrain, moto fournie', 120000, 200000], ['Secrétaire bilingue, {ville}', 150000, 250000], ['Chauffeur de direction, permis B', 120000, 180000], ['Développeur web (React, Node)', 350000, 600000], ['Comptable confirmé, 3 ans d’expérience', 250000, 400000], ['Serveur ou serveuse de restaurant, {ville}', 70000, 100000]],
  'petits-boulots': [['Livreur à moto, journée', 5000, 8000], ['Aide pour déménagement samedi', 10000, 20000], ['Distribution de prospectus, {ville}', 4000, 6000], ['Hôtesse pour événement', 15000, 25000]],
  stages: [['Stage en marketing digital (3 mois)', 40000, 60000], ['Stage en comptabilité, {ville}', 30000, 50000]],
  'cours-particuliers': [['Cours de maths et physique, collège et lycée', 3000, 6000], ['Cours d’anglais, tous niveaux', 3000, 5000], ['Répétiteur primaire à domicile, {ville}', 2500, 4000], ['Préparation au bac, séries C et D', 5000, 8000]],
  'menage-aide-domicile': [['Femme de ménage disponible, {ville}', 40000, 70000], ['Aide-ménagère sérieuse avec références', 45000, 65000]],
  'garde-enfants': [['Nounou expérimentée, temps plein', 50000, 80000], ['Garde d’enfants le week-end, {ville}', 5000, 10000]],
  'bricolage-reparations': [['Plombier disponible 7j/7, {ville}', 5000, 15000], ['Électricien bâtiment, devis gratuit', 10000, 25000], ['Peintre en bâtiment, travail soigné', 20000, 50000]],
  'reparation-electronique': [['Réparation de téléphones en 1 h, {ville}', 5000, 20000], ['Dépannage d’ordinateurs à domicile', 5000, 15000]],
  'coiffure-beaute': [['Coiffeuse à domicile : tresses, tissages', 5000, 15000], ['Maquillage pour mariage et événements', 15000, 35000]],
  couture: [['Couturier : tenues en pagne sur mesure', 8000, 25000], ['Retouches rapides, {ville}', 1000, 5000]],
  'demenagement-transport': [['Déménagement avec camion et porteurs', 50000, 150000], ['Transport de marchandises Douala-Yaoundé', 80000, 200000]],
  evenements: [['Traiteur pour mariages et anniversaires', 150000, 500000], ['Location de bâches et chaises', 25000, 80000], ['DJ et sonorisation pour vos fêtes', 50000, 150000]],
  meubles: [['Salon complet 7 places en bois', 250000, 450000], ['Lit 2 places avec matelas', 120000, 220000], ['Armoire 3 portes', 90000, 160000], ['Table à manger 6 chaises', 150000, 280000], ['Bureau en bois avec tiroirs', 45000, 80000]],
  electromenager: [['Réfrigérateur LG 300 L', 230000, 320000], ['Congélateur coffre 250 L', 180000, 260000], ['Machine à laver Samsung 7 kg', 200000, 280000], ['Climatiseur split 1,5 CV', 220000, 300000], ['Cuisinière 4 feux avec four', 120000, 200000], ['Ventilateur sur pied Binatone', 18000, 28000]],
  decoration: [['Miroir mural décoratif', 20000, 45000], ['Rideaux occultants (la paire)', 15000, 30000], ['Tableau d’art africain', 25000, 60000]],
  cuisine: [['Service de vaisselle 24 pièces', 25000, 45000], ['Mixeur Moulinex 2 en 1', 20000, 35000], ['Marmites en aluminium (lot de 5)', 30000, 50000]],
  'linge-maison': [['Draps 2 places en coton', 12000, 20000], ['Serviettes de bain (lot de 4)', 10000, 18000]],
  'jardin-bricolage': [['Groupe électrogène 3,5 kVA', 280000, 380000], ['Perceuse Bosch avec coffret', 45000, 70000]],
  'vetements-femme': [['Robe en pagne wax, taille M', 15000, 30000], ['Ensemble kaba moderne', 20000, 40000], ['Jean taille haute, taille 38', 8000, 15000]],
  'vetements-homme': [['Costume deux pièces bleu nuit', 45000, 80000], ['Chemise en pagne, coupe ajustée', 10000, 18000], ['Lot de 3 polos Lacoste', 25000, 40000]],
  chaussures: [['Baskets Nike Air Force 1, pointure 43', 35000, 55000], ['Escarpins noirs, pointure 39', 15000, 25000], ['Sandales en cuir faites main', 10000, 20000]],
  'sacs-accessoires': [['Sac à main en cuir', 25000, 50000], ['Sac à dos pour ordinateur', 15000, 25000]],
  'montres-bijoux': [['Montre Casio G-Shock', 35000, 60000], ['Collier et boucles en or 18 carats', 150000, 350000]],
  'tissus-pagnes': [['Pagne wax hollandais 6 yards', 18000, 35000], ['Tissu bazin riche 5 m', 25000, 45000]],
  'beaute-soins': [['Parfum Dior Sauvage 100 ml', 55000, 85000], ['Lot de produits pour cheveux naturels', 10000, 20000]],
  'vetements-enfant': [['Lot de vêtements bébé 0-6 mois', 10000, 20000], ['Uniforme scolaire, taille 10 ans', 5000, 10000]],
  'equipement-bebe': [['Poussette Chicco avec nacelle', 60000, 110000], ['Lit parapluie pour bébé', 30000, 55000], ['Siège auto 0-4 ans', 35000, 60000]],
  jouets: [['Vélo enfant 16 pouces', 30000, 50000], ['Lot de jouets éducatifs', 10000, 25000]],
  'fournitures-scolaires': [['Lot de manuels de 3e', 15000, 30000], ['Cartable à roulettes', 10000, 18000]],
  'animaux-compagnie': [['Chiots berger allemand vaccinés', 80000, 150000], ['Chaton de 3 mois, propre', 15000, 30000], ['Perroquet gris du Gabon', 100000, 200000]],
  'animaux-ferme': [['Poulets de chair (lot de 50)', 150000, 250000], ['Chèvres adultes', 40000, 80000], ['Porcelets de 2 mois', 30000, 50000]],
  'accessoires-animaux': [['Cage pour chien taille L', 30000, 50000], ['Aquarium 100 L complet', 60000, 100000]],
  'sport-velos': [['VTT 26 pouces, 21 vitesses', 70000, 120000], ['Tapis de course électrique', 250000, 400000], ['Ballon Adidas officiel', 15000, 25000]],
  'instruments-musique': [['Guitare acoustique Yamaha', 70000, 120000], ['Clavier Yamaha PSR 61 touches', 120000, 200000], ['Batterie complète', 250000, 400000]],
  livres: [['Romans africains (lot de 10)', 15000, 25000], ['Encyclopédie Larousse', 20000, 40000]],
  billetterie: [['2 billets pour le concert du 31 décembre', 20000, 40000], ['Billet match Lions Indomptables', 10000, 25000]],
  collection: [['Pièces de monnaie anciennes', 15000, 50000], ['Masque traditionnel sculpté', 40000, 120000]],
  'autres-loisirs': [['Table de ping-pong', 120000, 200000], ['Jeu de société Monopoly', 15000, 25000]],
  'btp-outillage': [['Bétonnière 350 L', 450000, 700000], ['Échafaudage métallique', 200000, 350000]],
  'commerce-restauration': [['Friteuse professionnelle 2 bacs', 120000, 200000], ['Vitrine réfrigérée pour boissons', 300000, 450000]],
  'materiel-agricole': [['Motoculteur diesel', 1200000, 1800000], ['Pulvérisateur 16 L', 25000, 40000]],
  'materiel-bureau': [['Photocopieuse Canon multifonction', 350000, 600000], ['Fauteuil de bureau ergonomique', 60000, 110000]],
  'autres-services': [['Traduction anglais-français certifiée', 5000, 15000], ['Création de logo et flyers', 15000, 40000]],
};

const FIRST = ['Aïcha', 'Boris', 'Carine', 'Daniel', 'Estelle', 'Franck', 'Grâce', 'Hervé', 'Inès', 'Junior', 'Kevin', 'Laure', 'Marcel', 'Nadège', 'Olivier', 'Prisca', 'Rodrigue', 'Sandrine', 'Thierry', 'Ursule', 'Valérie', 'Wilfried', 'Yannick', 'Zita', 'Arnaud', 'Brice', 'Christelle', 'Diane', 'Eric', 'Flore', 'Gaëlle', 'Hugues', 'Ivana', 'Joël', 'Kelly', 'Landry', 'Murielle', 'Noël', 'Odette', 'Patrick'];
const SHOPS = ['Tech Center Akwa', 'Auto Plus Douala', 'Immo Confiance', 'Mobilier Prestige', 'Beauté Divine', 'Phone Store Mvog-Mbi', 'Électro Libreville', 'Brazza Motors'];
const DESCRIPTIONS = [
  'Article en très bon état, peu servi. Visible sur rendez-vous, paiement à la remise.',
  'Disponible immédiatement. Possibilité de voir avant d’acheter. Prix légèrement négociable.',
  'Vendu car déménagement. Tout fonctionne parfaitement, aucun défaut caché.',
  'Neuf, jamais utilisé, avec emballage d’origine et facture.',
  'Bon rapport qualité-prix. Contactez-moi par la messagerie pour plus de photos.',
];
const SERVICE_DESC = 'Sérieux, ponctuel et disponible. Plusieurs années d’expérience et des clients satisfaits. Écrivez-moi pour un devis.';
const JOB_DESC = 'Poste à pourvoir rapidement. Profil recherché : sérieux, motivé, avec une première expérience. Envoyez votre candidature avec un CV.';
const PALETTE = { vehicules: ['#1E5EDB', '#5B8DEF'], immobilier: ['#0F766E', '#34B3A6'], electronique: ['#3730A3', '#6D6AE8'], maison: ['#9A3412', '#E07A45'], mode: ['#9D174D', '#E0619C'], 'bebe-enfant': ['#B45309', '#F2B04A'], animaux: ['#3F6212', '#86B33C'], loisirs: ['#0E7490', '#3FB3CF'], 'materiel-pro': ['#374151', '#7C8696'], emploi: ['#1E3A8A', '#4F7BD9'], services: ['#6B21A8', '#A35DD8'] };

// ---------------------------------------------------------------- visuels d'illustration
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function lines(title, max = 22) {
  const out = [];
  let cur = '';
  for (const w of title.replace(/, .*$/, '').split(' ')) {
    if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  return out.slice(0, 3);
}
async function image(title, parent, variant) {
  const [a, b] = PALETTE[parent] ?? ['#1E5EDB', '#5B8DEF'];
  const ls = lines(title);
  const angle = variant * 37;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
    <defs><linearGradient id="g" gradientTransform="rotate(${angle} .5 .5)"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
    <rect width="1200" height="900" fill="url(#g)"/>
    <circle cx="${960 - variant * 120}" cy="${170 + variant * 60}" r="230" fill="#fff" opacity=".10"/>
    <circle cx="${180 + variant * 90}" cy="760" r="300" fill="#fff" opacity=".08"/>
    ${ls.map((l, i) => `<text x="600" y="${450 - (ls.length - 1) * 48 + i * 96}" font-family="Georgia, serif" font-size="78" font-weight="700" fill="#fff" text-anchor="middle">${esc(l)}</text>`).join('')}
    <text x="600" y="840" font-family="Georgia, serif" font-size="30" fill="#fff" opacity=".75" text-anchor="middle">Photo d’illustration${variant ? ` ${variant + 1}` : ''}</text>
  </svg>`;
  const base = sharp(Buffer.from(svg));
  return { full: await base.clone().webp({ quality: 72 }).toBuffer(), thumb: await base.clone().resize(400, 300).webp({ quality: 70 }).toBuffer() };
}
const put = (Key, Body) => s3.send(new PutObjectCommand({ Bucket: BUCKET, Key, Body, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }));

// ---------------------------------------------------------------- attributs selon le formulaire de la catégorie
function attributesFor(form, title, adType) {
  const out = {};
  for (const f of form?.fields ?? []) {
    if (f.type === 'select') {
      // Option citée dans le titre : « Apple (iPhone) » reconnaît « iPhone 13 », « Toyota » reconnaît « Toyota RAV4 »
      const words = (label) => label.toLowerCase().replace(/[()]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
      const titleWords = new Set(title.toLowerCase().split(/[^a-z0-9àâäéèêëîïôöùûüç-]+/));
      const byTitle = f.options.find((o) => o.value !== 'autre' && words(o.label).some((w) => titleWords.has(w)));
      if (byTitle) out[f.key] = byTitle.value;
      else if (f.required || rnd() < 0.7) out[f.key] = pick(f.options.filter((o) => o.value !== 'autre').length ? f.options.filter((o) => o.value !== 'autre') : f.options).value;
    } else if (f.type === 'number') {
      if (!(f.required || rnd() < 0.7)) continue;
      const k = f.key;
      const v = k === 'year' ? int(2008, 2021) : k === 'mileage' ? round(int(25000, 230000), 1000) : k.includes('surface') ? int(18, 320) : k.includes('room') || k.includes('bed') ? int(1, 5) : int(f.min ?? 1, Math.min(f.max ?? 10, (f.min ?? 1) + 20));
      out[k] = Math.min(Math.max(v, f.min ?? v), f.max ?? v);
    } else if (f.type === 'text' && f.required) out[f.key] = 'Standard';
  }
  if (adType === 'request') for (const f of form?.fields ?? []) if (!f.required) delete out[f.key];
  return out;
}

// ---------------------------------------------------------------- remplissage
async function seedAll() {
  const [{ n: existing }] = await sql`select count(*)::int as n from users where phone_e164 like ${DEMO_PHONE}`;
  if (existing) {
    console.log(`Des données de démonstration existent déjà (${existing} comptes). Lancez d’abord : node scripts/seed-demo.mjs --reset`);
    return;
  }
  const cities = await sql`select id, slug, name, country_code from cities where is_active`;
  const districts = await sql`select id, city_id, name from districts where is_active`;
  const cats = await sql`
    select c.id, c.slug, c.requires_verification as rv, p.slug as parent, p.requires_verification as prv, coalesce(c.attributes_schema, p.attributes_schema) as form
      from categories c join categories p on p.id = c.parent_id where c.is_active`;
  const cityWeight = { douala: 9, yaounde: 7, libreville: 4, 'port-gentil': 1, brazzaville: 3, 'pointe-noire': 2 };
  const weightedCities = cities.flatMap((c) => Array(cityWeight[c.slug] ?? 1).fill(c));

  // Vendeurs : particuliers et quelques boutiques ; la plupart ont une identité vérifiée
  const users = [];
  for (let i = 0; i < 48; i++) {
    const city = pick(weightedCities);
    const name = i < SHOPS.length ? SHOPS[i] : `${pick(FIRST)} ${String.fromCharCode(65 + int(0, 25))}.`;
    const [u] = await sql`
      insert into users (phone_e164, country_code, city_id, display_name, verification_level, daily_listing_limit, created_at)
      values (${'+2376990' + String(10000 + i).slice(-5)}, ${city.country_code}, ${city.id}, ${name}, ${rnd() < 0.7 ? 'identity' : 'phone'}, 1000, now() - make_interval(days => ${int(20, 700)}))
      returning id, verification_level`;
    users.push({ ...u, city });
  }

  let listings = 0;
  let files = 0;
  const created = [];
  for (const c of cats) {
    const items = ITEMS[c.slug];
    if (!items) continue;
    const count = ['telephones', 'voitures', 'locations', 'meubles', 'electromenager', 'offres-emploi'].includes(c.slug) ? 14 : c.parent === 'materiel-pro' || c.parent === 'loisirs' ? 3 : 6;
    for (let k = 0; k < count; k++) {
      const [base, min, max] = items[k % items.length];
      const sensitive = c.rv || c.prv;
      const adType = rnd() < 0.08 && !['emploi'].includes(c.parent) ? 'request' : 'offer';
      const candidates = users.filter((u) => !sensitive || adType === 'request' || u.verification_level === 'identity');
      const seller = pick(candidates);
      const city = rnd() < 0.75 ? seller.city : pick(weightedCities);
      const ds = districts.filter((d) => d.city_id === city.id);
      const district = ds.length && rnd() < 0.75 ? pick(ds) : null;
      const year = int(2008, 2021);
      const title = (adType === 'request' ? 'Recherche ' + base.charAt(0).toLowerCase() + base.slice(1) : base).replace('{year}', year).replace('{ville}', district?.name ?? city.name).slice(0, 120);
      const step = max >= 1000000 ? 50000 : max >= 100000 ? 5000 : max >= 10000 ? 1000 : 500;
      const price = round(int(min, max), step);
      const types = c.form?.price?.types ?? ['fixed', 'negotiable'];
      const priceType = types.includes('negotiable') && rnd() < 0.4 ? 'negotiable' : types.includes('fixed') ? 'fixed' : types[0];
      const withPrice = priceType === 'fixed' || priceType === 'negotiable';
      const attributes = attributesFor(c.form, title, adType);
      if (attributes.year) attributes.year = year;
      const condition = c.form?.condition ? pick(['new', 'like_new', 'good', 'good', 'fair']) : null;
      const description = c.parent === 'emploi' ? JOB_DESC : c.parent === 'services' ? SERVICE_DESC : pick(DESCRIPTIONS);
      const [l] = await sql`
        insert into listings (user_id, category_id, country_code, city_id, district_id, title, description, price_type, price_xaf, condition, attributes, ad_type)
        values (${seller.id}, ${c.id}, ${city.country_code}, ${city.id}, ${district?.id ?? null}, ${title}, ${description}, ${priceType}, ${withPrice ? price : null}, ${condition}, ${sql.json(attributes)}, ${adType})
        returning id`;
      // Photos : 1 à 4 pour les objets, rarement pour l'emploi et les services
      const nPhotos = ['emploi', 'services'].includes(c.parent) ? (rnd() < 0.25 ? 1 : 0) : int(1, 4);
      for (let p = 0; p < nPhotos; p++) {
        const id = randomUUID();
        const key = `listings/${l.id}/${id}-1200.webp`;
        const img = await image(title, c.parent, p);
        await put(key, img.full);
        await put(key.replace('-1200.webp', '-400.webp'), img.thumb);
        await sql`insert into listing_images (id, listing_id, storage_key, position, width, height) values (${id}, ${l.id}, ${key}, ${p}, 1200, 900)`;
        files += 2;
      }
      // En ligne, publiée dans les 25 derniers jours ; quelques annonces mises à la une
      await sql`update listings set status = 'active', published_at = now() - make_interval(hours => ${int(1, 600)}) where id = ${l.id}`;
      if (rnd() < 0.05) await sql`update listings set boost_until = now() + interval '3 days' where id = ${l.id}`.catch(() => undefined);
      created.push({ id: l.id, seller: seller.id });
      listings++;
      if (listings % 50 === 0) console.log(`… ${listings} annonces`);
    }
  }

  // Remise en main propre (migration 014) : la plupart des objets proposés, jamais emploi, services ni immobilier
  await sql`update listings l set hand_delivery = (random() < 0.85)
             where l.hand_delivery is null and l.ad_type = 'offer'
               and not exists (select 1 from categories c join categories p on p.id = c.parent_id
                                where c.id = l.category_id and p.slug in ('emploi', 'services', 'immobilier'))`;

  // Portefeuilles électroniques acceptés (migration 016) : ceux du pays, chacun 3 fois sur 4 ; pas pour l'emploi ni les demandes
  await sql`update listings l set payment_methods = coalesce((
              select array_agg(cw.wallet order by cw.position) from country_wallets cw
               where cw.country_code = l.country_code and random() < 0.75), '{}')
             where l.ad_type = 'offer' and l.payment_methods = '{}'
               and l.user_id in (select id from users where phone_e164 like ${DEMO_PHONE})
               and not exists (select 1 from categories c join categories p on p.id = c.parent_id where c.id = l.category_id and p.slug = 'emploi')`;

  // Échanges et avis : des conversations réelles (les deux ont écrit), puis une note de l'acheteur
  let reviews = 0;
  const comments = ['Vendeur sérieux et ponctuel, article conforme.', 'Très bon échange, je recommande.', 'Rendez-vous respecté, rien à redire.', 'Article comme décrit, merci !', 'Un peu de retard mais tout s’est bien passé.', null, null];
  for (let i = 0; i < 140; i++) {
    const l = pick(created);
    const buyer = pick(users.filter((u) => u.id !== l.seller));
    const [conv] = await sql`
      insert into conversations (listing_id, buyer_id, seller_id) values (${l.id}, ${buyer.id}, ${l.seller})
      on conflict do nothing returning id`;
    if (!conv) continue;
    await sql`insert into messages (conversation_id, sender_id, body, created_at) values
      (${conv.id}, ${buyer.id}, 'Bonjour, est-ce toujours disponible ?', now() - interval '6 days'),
      (${conv.id}, ${l.seller}, 'Oui, passez quand vous voulez.', now() - interval '6 days' + interval '1 hour')`;
    const rating = pick([5, 5, 5, 4, 4, 4, 3, 5, 2]);
    await sql`insert into reviews (conversation_id, listing_id, author_id, target_id, author_role, rating, comment, created_at)
      values (${conv.id}, ${l.id}, ${buyer.id}, ${l.seller}, 'buyer', ${rating}, ${pick(comments)}, now() - make_interval(days => ${int(0, 5)}))`;
    reviews++;
  }
  // Avant-première : les numéros +237 6990… peuvent appartenir à de vrais abonnés, ils ne sont jamais affichés
  if (AVANT_PREMIERE) await sql`update users set contact_preference = 'messages_only' where phone_e164 like ${DEMO_PHONE}`;
  console.log(`Données de démonstration ajoutées : ${users.length} vendeurs, ${listings} annonces, ${files} fichiers photo, ${reviews} avis.`);
}

try {
  if (process.argv.includes('--reset')) await reset();
  else await seedAll();
} finally {
  await sql.end();
}
