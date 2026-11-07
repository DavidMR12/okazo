import postgres from 'postgres';
import { env } from '../config/env';
import { StorageService } from './storage.service';
import { loadClip, VisualSearchService } from './visual-search.service';

/**
 * Recherche par image : calcule l'empreinte des photos publiées avant cette fonctionnalité. Peut être relancé sans risque.
 *   node dist/media/index-photos.js            calcule les empreintes manquantes
 *   node dist/media/index-photos.js --model    télécharge seulement le modèle (construction de l'image Docker)
 */
async function main() {
  if (process.argv.includes('--model')) {
    await loadClip();
    return;
  }
  const db = postgres(env.DATABASE_URL, { max: 2 });
  const storage = new StorageService();
  const visual = new VisualSearchService();
  const rows = await db<{ id: string; storage_key: string }[]>`
    select id, storage_key from listing_images where embedding is null and storage_key like 'listings/%' order by created_at desc`;
  let done = 0;
  for (const row of rows) {
    try {
      const vector = await visual.embed(await storage.getBuffer(row.storage_key));
      await db`update listing_images set embedding = ${vector}::vector where id = ${row.id}`;
      done++;
    } catch (err) {
      console.warn(`Photo ${row.id} ignorée : ${err}`);
    }
  }
  console.log(`${done} photos indexées sur ${rows.length}`);
  await db.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
