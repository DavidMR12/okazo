// Vraies photos pour les annonces de démonstration (développement local uniquement).
// Usage : node scripts/demo-photos.mjs   (après seed-demo.mjs)
// Les photos viennent de Wikimedia Commons (photos libres, précisément décrites : marque, modèle, objet).
// Elles sont gardées dans Maquettes/photos-demo (cache : relancer le script ne retélécharge rien) avec
// leurs crédits (credits.json). Elles remplacent les visuels d'illustration des comptes de démonstration ;
// chaque annonce garde son nombre de photos (au moins une, au plus trois).
import { DeleteObjectsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import sharp from 'sharp';

const ENV_FILE = new URL('../.env', import.meta.url);
const env = existsSync(ENV_FILE)
  ? Object.fromEntries(
      readFileSync(ENV_FILE, 'utf8')
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    )
  : process.env;
// Hors base locale : seulement pour l'avant-première fermée (PREVIEW_MODE), sur demande explicite
if (!/localhost|127\.0\.0\.1/.test(env.DATABASE_URL) && !(process.env.DEMO_AVANT_PREMIERE === 'oui' && env.PREVIEW_MODE === 'true')) {
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
const DIR = process.env.DEMO_PHOTOS_DIR
  ? new URL(`file://${process.env.DEMO_PHOTOS_DIR.replace(/\/?$/, '/')}`)
  : new URL('../../Maquettes/photos-demo/', import.meta.url);
mkdirSync(DIR, { recursive: true });
const CREDITS_FILE = new URL('credits.json', DIR);
const SEARCH_FILE = new URL('recherches.json', DIR); // résultats de recherche gardés : relancer le script ne réinterroge pas Commons
const credits = existsSync(CREDITS_FILE) ? JSON.parse(readFileSync(CREDITS_FILE, 'utf8')) : {};
const searches = existsSync(SEARCH_FILE) ? JSON.parse(readFileSync(SEARCH_FILE, 'utf8')) : {};

// ---------------------------------------------------------------- sujet de l'annonce → recherche (en anglais)
// Clé : début du titre (avant la virgule), sans « Recherche », en minuscules.
const QUERIES = {
  'aquarium 100 l complet': 'aquarium fish tank', 'cage pour chien taille l': 'dog crate', 'chaton de 3 mois': 'kitten',
  'chiots berger allemand vaccinés': 'german shepherd puppy', 'perroquet gris du gabon': 'african grey parrot', 'chèvres adultes': 'goats farm',
  'porcelets de 2 mois': 'piglets', 'poulets de chair (lot de 50)': 'chickens poultry farm', 'lit parapluie pour bébé': 'baby travel cot',
  'poussette chicco avec nacelle': 'baby stroller pram', 'siège auto 0-4 ans': 'child car seat', 'cartable à roulettes': 'school backpack',
  'lot de manuels de 3e': 'school textbooks', 'lot de jouets éducatifs': 'educational toys wooden', 'vélo enfant 16 pouces': 'kids bicycle',
  'lot de vêtements bébé 0-6 mois': 'baby clothes', 'uniforme scolaire': 'school uniform africa',
  'chargeur rapide samsung 25 w d’origine': 'phone charger usb', 'écouteurs airpods pro': 'airpods', 'onduleur 1000 va pour ordinateur': 'ups power supply computer',
  'batterie externe 20 000 mah': 'power bank', 'manette ps5 dualsense blanche': 'dualsense controller', 'playstation 5 avec deux manettes': 'playstation 5',
  'ps4 slim 500 go + fifa 23': 'playstation 4', 'xbox series s': 'xbox series', 'asus vivobook 15': 'asus laptop', 'dell latitude 5490': 'dell laptop',
  'hp elitebook 840 g5': 'hp laptop', 'macbook air m1': 'macbook air', 'ordinateur de bureau hp + écran 22 pouces': 'desktop computer monitor',
  'lenovo thinkpad t480': 'thinkpad', 'appareil photo canon eos 2000d + objectif': 'canon eos camera', 'caméra gopro hero 9': 'gopro camera',
  'trépied professionnel 1': 'camera tripod', 'ipad 9e génération': 'ipad', 'samsung galaxy tab a8': 'samsung galaxy tab', 'tablette enfant lenovo avec coque': 'android tablet',
  'huawei p30 lite': 'huawei smartphone', 'infinix hot 40i': 'android smartphone', 'infinix note 30': 'android smartphone', 'iphone 11': 'iphone 11',
  'iphone 12': 'iphone 12', 'iphone 13': 'iphone 13', 'itel a70': 'smartphone', 'samsung galaxy a54': 'samsung galaxy smartphone', 'tecno spark 10': 'smartphone',
  'redmi note 13': 'xiaomi redmi', 'samsung galaxy a15': 'samsung galaxy smartphone', 'samsung galaxy a15 128 go': 'samsung galaxy smartphone',
  'samsung galaxy s21': 'samsung galaxy s21', 'samsung galaxy s22 ultra': 'samsung galaxy s22', 'tecno camon 20 pro': 'android smartphone',
  'tecno spark 20': 'smartphone', 'téléphone fixe sans fil panasonic': 'cordless phone', 'xiaomi redmi note 12': 'xiaomi redmi',
  'barre de son jbl avec caisson': 'soundbar', 'décodeur canal+ avec parabole': 'satellite dish', 'enceinte bluetooth jbl charge 5': 'jbl speaker',
  'télévision samsung 43 pouces smart tv': 'flat screen television', 'tv lg 55 pouces 4k': 'lg television',
  'caissière pour supermarché': 'supermarket cashier', 'chauffeur de direction': 'chauffeur car driver', 'commercial terrain': 'salesman meeting',
  'comptable confirmé': 'accountant office', 'développeur web (react': 'programmer laptop code', 'secrétaire bilingue': 'office receptionist',
  'serveur ou serveuse de restaurant': 'restaurant waiter', 'vendeuse en boutique de prêt-à-porter': 'clothing store', 'aide pour déménagement samedi': 'moving boxes',
  'distribution de prospectus': 'flyers', 'hôtesse pour événement': 'event hostess', 'livreur à moto': 'delivery motorcycle',
  'stage en comptabilité': 'accounting calculator', 'stage en marketing digital (3 mois)': 'digital marketing laptop',
  'boutique de 20 m² sur axe passant': 'small shop storefront', 'bureau de 60 m² climatisé': 'office interior', 'chambre en colocation': 'bedroom interior',
  'colocation étudiante proche université': 'student room', 'appartement 2 chambres': 'apartment living room', 'appartement 3 chambres neuf': 'apartment interior',
  'chambre moderne avec douche interne': 'modern bedroom', 'villa 4 chambres avec jardin': 'villa garden', 'studio moderne meublé': 'studio apartment',
  'lot de 300 m² avec certificat de propriété': 'land plot', 'terrain 500 m² titré': 'empty land plot', 'terrain 1 000 m² en bordure de route': 'land plot road',
  'duplex 5 chambres': 'duplex house', 'immeuble r+2 à vendre': 'apartment building africa', 'maison 3 chambres titrée': 'house africa',
  'jeu de société monopoly': 'monopoly board game', 'table de ping-pong': 'ping pong table', '2 billets pour le concert du 31 décembre': 'concert crowd',
  'billet match lions indomptables': 'football stadium', 'masque traditionnel sculpté': 'african mask', 'pièces de monnaie anciennes': 'old coins',
  'batterie complète': 'drum kit', 'clavier yamaha psr 61 touches': 'yamaha keyboard', 'guitare acoustique yamaha': 'acoustic guitar',
  'encyclopédie larousse': 'encyclopedia books', 'romans africains (lot de 10)': 'books stack', 'ballon adidas officiel': 'football ball',
  'tapis de course électrique': 'treadmill', 'vtt 26 pouces': 'mountain bike', 'marmites en aluminium (lot de 5)': 'cooking pots',
  'mixeur moulinex 2 en 1': 'blender kitchen', 'service de vaisselle 24 pièces': 'dinnerware plates', 'miroir mural décoratif': 'wall mirror',
  'rideaux occultants (la paire)': 'curtains window', 'tableau d’art africain': 'african painting', 'climatiseur split 1': 'air conditioner',
  'congélateur coffre 250 l': 'chest freezer', 'cuisinière 4 feux avec four': 'gas stove oven', 'machine à laver samsung 7 kg': 'washing machine',
  'réfrigérateur lg 180 l': 'refrigerator', 'réfrigérateur lg 300 l': 'refrigerator', 'ventilateur sur pied binatone': 'electric fan',
  'groupe électrogène 3': 'power generator', 'perceuse bosch avec coffret': 'power drill', 'draps 2 places en coton': 'bed sheets',
  'serviettes de bain (lot de 4)': 'bath towels', 'armoire 3 portes': 'wardrobe furniture', 'bureau en bois avec tiroirs': 'wooden desk',
  'lit 2 places avec matelas': 'double bed', 'salon complet 7 places en bois': 'sofa living room', 'table à manger 6 chaises': 'dining table chairs',
  'bétonnière 350 l': 'concrete mixer', 'échafaudage métallique': 'scaffolding', 'friteuse professionnelle 2 bacs': 'deep fryer',
  'vitrine réfrigérée pour boissons': 'drinks fridge', 'motoculteur diesel': 'walking tractor', 'pulvérisateur 16 l': 'garden sprayer',
  'fauteuil de bureau ergonomique': 'office chair', 'photocopieuse canon multifonction': 'photocopier', 'lot de produits pour cheveux naturels': 'hair products',
  'parfum dior sauvage 100 ml': 'perfume bottle', 'baskets nike air force 1': 'nike air force', 'escarpins noirs': 'black high heels',
  'sandales en cuir faites main': 'leather sandals', 'collier et boucles en or 18 carats': 'gold necklace', 'montre casio g-shock': 'casio watch',
  'sac à dos pour ordinateur': 'laptop backpack', 'sac à main en cuir': 'leather handbag', 'pagne wax hollandais 6 yards': 'african wax print fabric',
  'tissu bazin riche 5 m': 'african fabric', 'ensemble kaba moderne': 'african dress', 'jean taille haute': 'jeans', 'robe en pagne wax': 'african print dress',
  'chemise en pagne': 'african print shirt', 'costume deux pièces bleu nuit': 'navy suit', 'lot de 3 polos lacoste': 'polo shirt',
  'création de logo et flyers': 'graphic designer', 'traduction anglais-français certifiée': 'dictionary translation', 'électricien bâtiment': 'electrician',
  'peintre en bâtiment': 'house painter', 'plombier disponible 7j/7': 'plumber', 'coiffeuse à domicile : tresses': 'braids hairstyle',
  'maquillage pour mariage et événements': 'makeup artist', 'cours d’anglais': 'english lesson', 'cours de maths à domicile': 'math tutoring',
  'cours de maths et physique': 'math blackboard', 'préparation au bac': 'student studying', 'répétiteur primaire à domicile': 'children homework',
  'couturier : tenues en pagne sur mesure': 'tailor sewing', 'retouches rapides': 'sewing machine', 'déménagement avec camion et porteurs': 'moving truck',
  'transport de marchandises douala-yaoundé': 'cargo truck', 'dj et sonorisation pour vos fêtes': 'dj party', 'location de bâches et chaises': 'event tent chairs',
  'traiteur pour mariages et anniversaires': 'catering buffet', 'garde d’enfants le week-end': 'babysitter children', 'nounou expérimentée': 'nanny child',
  'aide-ménagère sérieuse avec références': 'house cleaning', 'femme de ménage disponible': 'cleaning mop', 'dépannage d’ordinateurs à domicile': 'computer repair',
  'réparation de téléphones en 1 h': 'phone repair', 'moto sanili 125': 'motorcycle africa', 'moto tvs apache 160': 'tvs apache', 'moto yamaha crypton': 'yamaha motorcycle',
  'scooter honda pcx 150': 'honda pcx', 'batterie de voiture 70 ah': 'car battery', 'jantes alliage 17 pouces': 'alloy wheels', 'phare avant toyota corolla': 'car headlight',
  'pneus michelin 205/55 r16 (les 4)': 'car tires', 'camion mitsubishi canter 2019': 'mitsubishi canter', 'pick-up toyota hilux 2016': 'toyota hilux',
  'pick-up toyota hilux 2018': 'toyota hilux', 'toyota hiace 2016': 'toyota hiace', 'toyota hiace 2021': 'toyota hiace', 'honda cr-v 2012': 'honda cr-v',
  'hyundai tucson 2014': 'hyundai tucson', 'hyundai tucson 2015': 'hyundai tucson', 'kia rio 2020': 'kia rio', 'mercedes-benz c200 2016': 'mercedes c-class',
  'mercedes-benz c200 2018': 'mercedes c-class', 'nissan x-trail 2014': 'nissan x-trail', 'peugeot 508 2019': 'peugeot 508', 'toyota corolla 2009': 'toyota corolla',
  'toyota corolla 2012': 'toyota corolla', 'toyota corolla 2017': 'toyota corolla', 'toyota prado 2014': 'toyota land cruiser prado', 'toyota rav4 2019': 'toyota rav4',
  'toyota yaris 2011': 'toyota yaris',
};
const subjectOf = (title) => title.split(',')[0].replace(/^Recherche\s+/i, '').trim().toLowerCase();
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BAD_TITLE = /pictogram|diagram|logo|map\b|drawing|sketch|icon|chart|poster|advert|stamp|manual|label|gauge|scheme|plan\b|svg|coat of arms|flag of|nude|naked|erotic|lingerie|bikini|museum|exhibit|statue|sculpture|painting by|engraving|lithograph|postcard|toy\b|lego|model car|miniature/i;
// Photos écartées à la main après relecture des planches-contact (noms de fichiers)
const EXCLUDE_FILE = new URL('exclusions.json', DIR);
const excluded = new Set(existsSync(EXCLUDE_FILE) ? JSON.parse(readFileSync(EXCLUDE_FILE, 'utf8')) : []);
// --relues : n'utiliser que les photos déjà téléchargées (donc relues), sans en chercher de nouvelles
const REVIEWED_ONLY = process.argv.includes('--relues');
const UA = { 'User-Agent': 'okazo-demo-seed/1.0 (developpement local ; donnees de demonstration)' };
// Requête polie : pause entre deux appels, et attente quand Wikimedia demande de ralentir (429)
let lastFetch = 0;
async function politeFetch(url, opts = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const wait = 1200 - (Date.now() - lastFetch);
    if (wait > 0) await sleep(wait);
    lastFetch = Date.now();
    const res = await fetch(url, { ...opts, headers: UA });
    if (res.status !== 429 && res.status !== 503) return res;
    const retry = Number(res.headers.get('retry-after')) || 20 * (attempt + 1);
    console.log(`Wikimedia demande de ralentir : pause de ${retry} s`);
    await sleep(retry * 1000);
  }
  throw new Error('Wikimedia refuse toujours (trop de requêtes) : relancez le script plus tard, rien n’est perdu.');
}
const strip = (html) => String(html ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- recherche Wikimedia Commons (avec mise en mémoire)
// Fichiers décrits avec précision (marque, modèle, objet), tous sous licence libre ; vignette 1200 px fournie par Commons.
async function search(query) {
  if (searches[query]) return searches[query];
  const params = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrlimit: '24',
    gsrsearch: `filetype:bitmap ${query}`, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1280',
  });
  const res = await politeFetch(`https://commons.wikimedia.org/w/api.php?${params}`);
  if (!res.ok) throw new Error(`Commons ${res.status} pour « ${query} »`);
  const body = await res.json();
  const pages = Object.values(body.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const items = pages
    .map((pg) => ({ pg, ii: pg.imageinfo?.[0] }))
    .filter(({ pg, ii }) => ii && /jpe?g/.test(ii.mime) && ii.width >= 800 && ii.height >= 500 && ii.width / ii.height >= 0.75 && ii.width / ii.height <= 2.2 && !BAD_TITLE.test(pg.title))
    .map(({ pg, ii }) => ({
      id: String(pg.pageid),
      url: ii.thumburl ?? ii.url,
      title: pg.title.replace(/^File:/, ''),
      creator: strip(ii.extmetadata?.Artist?.value),
      license: strip(ii.extmetadata?.LicenseShortName?.value),
      source: ii.descriptionurl,
    }));
  searches[query] = items;
  writeFileSync(SEARCH_FILE, JSON.stringify(searches, null, 1));
  return items;
}

// Photo n° k d'une recherche, téléchargée une seule fois (cache local), recadrée en 4:3
async function photo(query, k) {
  const items = (await search(query)).filter((it) => !excluded.has(`wm-${slug(query)}-${it.id}.jpg`));
  for (let tries = 0; tries < items.length; tries++) {
    const it = items[(k + tries) % items.length];
    const name = `wm-${slug(query)}-${it.id}.jpg`;
    const file = new URL(name, DIR);
    if (REVIEWED_ONLY && !existsSync(file)) continue;
    try {
      if (!existsSync(file)) {
        // Taille standard de Wikimedia (1280 px, déjà prête) : une taille inhabituelle est fabriquée à la demande et vite limitée
        const res = await politeFetch(it.url.replace(/\/\d+px-/, '/1280px-'), { signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(String(res.status));
        const buf = Buffer.from(await res.arrayBuffer());
        await sharp(buf).rotate().resize(1200, 900, { fit: 'cover', position: 'attention' }).jpeg({ quality: 85 }).toFile(fileURLToPath(file));
        credits[name] = { titre: it.title, auteur: it.creator, licence: it.license, source: it.source };
        writeFileSync(CREDITS_FILE, JSON.stringify(credits, null, 1));
      }
      return file;
    } catch {
      /* photo indisponible : on prend la suivante */
    }
  }
  return null;
}

const put = (Key, Body) => s3.send(new PutObjectCommand({ Bucket: BUCKET, Key, Body, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }));

// ---------------------------------------------------------------- remplacement des photos
const rows = await sql`
  select l.id, l.title, coalesce((select count(*) from listing_images i where i.listing_id = l.id), 0)::int as n
    from listings l join users u on u.id = l.user_id
   where u.phone_e164 like ${DEMO_PHONE}
   order by l.created_at`;
const missing = [...new Set(rows.map((r) => subjectOf(r.title)).filter((s) => !QUERIES[s]))];
if (missing.length) console.warn(`Sujets sans recherche (ignorés) : ${missing.join(' ; ')}`);

const used = new Map(); // recherche → nombre de photos déjà prises (deux annonces du même sujet n'ont pas la même photo)
let done = 0;
let files = 0;
for (const r of rows) {
  const query = QUERIES[subjectOf(r.title)];
  if (!query) continue;
  const want = Math.min(3, Math.max(1, r.n));
  const picked = [];
  for (let p = 0; p < want; p++) {
    const k = used.get(query) ?? 0;
    used.set(query, k + 1);
    const f = await photo(query, k);
    if (f && !picked.some((x) => x.href === f.href)) picked.push(f);
  }
  // Anciennes photos : fichiers puis lignes (une annonce sans photo valable reste sans photo, jamais avec une mauvaise)
  const old = await sql`select storage_key from listing_images where listing_id = ${r.id}`;
  const keys = old.flatMap((o) => [o.storage_key, o.storage_key.replace(/-1200\.webp$/, '-400.webp')]);
  if (keys.length) await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: keys.map((Key) => ({ Key })) } })).catch(() => undefined);
  await sql`delete from listing_images where listing_id = ${r.id}`;
  if (!picked.length) {
    console.warn(`Sans photo : « ${r.title} » (${query})`);
    continue;
  }
  for (const [position, f] of picked.entries()) {
    const id = randomUUID();
    const key = `listings/${r.id}/${id}-1200.webp`;
    const src = sharp(fileURLToPath(f));
    await put(key, await src.clone().webp({ quality: 75 }).toBuffer());
    await put(key.replace('-1200.webp', '-400.webp'), await src.clone().resize(400, 300).webp({ quality: 70 }).toBuffer());
    await sql`insert into listing_images (id, listing_id, storage_key, position, width, height) values (${id}, ${r.id}, ${key}, ${position}, 1200, 900)`;
    files += 2;
  }
  if (++done % 25 === 0) console.log(`… ${done} annonces`);
}
console.log(`Photos réelles posées sur ${done} annonces (${files} fichiers). Crédits : Maquettes/photos-demo/credits.json`);
await sql.end();
