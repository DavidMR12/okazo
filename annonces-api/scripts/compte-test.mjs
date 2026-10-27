// Compte de test prêt à l'emploi pour essayer le site et l'application (développement local uniquement).
// Usage : node scripts/compte-test.mjs   → crée le compte, ou remet son mot de passe à zéro s'il existe déjà
// Connexion : onglet « E-mail » de la page de connexion, avec l'adresse et le mot de passe ci-dessous.
// Le compte a déjà un numéro de téléphone et les CGU acceptées : il peut publier tout de suite.
// Son numéro est hors de la plage de démonstration : « seed-demo.mjs --reset » ne l'efface pas.
import { randomBytes, scrypt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const EMAIL = 'test@okazo.local';
const PASSWORD = 'OkazoTest2026!';
const PHONE = '+237698000001';
const NAME = 'Compte de test';
const TERMS_VERSION = '2026-10-15'; // même valeur que TERMS_VERSION dans src/config/env.ts

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
if (!/localhost|127\.0\.0\.1/.test(env.DATABASE_URL)) {
  console.error('Refusé : ce script ne tourne que sur une base locale.');
  process.exit(1);
}

// Même format que src/auth/password.ts : « scrypt$N$r$p$sel$empreinte »
const salt = randomBytes(16);
const key = await new Promise((ok, ko) =>
  scrypt(PASSWORD.normalize('NFKC'), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? ko(e) : ok(k))),
);
const hash = `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;

const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
const [city] = await sql`select c.id from cities c where c.country_code = 'CM' order by (c.name = 'Douala') desc, c.name limit 1`;
const [user] = await sql`
  insert into users (phone_e164, email, email_verified_at, password_hash, country_code, city_id, display_name,
                     verification_level, daily_listing_limit, terms_version, terms_accepted_at)
  values (${PHONE}, ${EMAIL}, now(), ${hash}, 'CM', ${city?.id ?? null}, ${NAME}, 'phone', 50, ${TERMS_VERSION}, now())
  on conflict (phone_e164) do update set email = excluded.email, email_verified_at = now(), password_hash = excluded.password_hash,
    terms_version = excluded.terms_version, terms_accepted_at = now(), status = 'active'
  returning id`;
await sql`insert into terms_acceptances (user_id, version) values (${user.id}, ${TERMS_VERSION})`;
await sql.end();
console.log(`Compte de test prêt : ${EMAIL} / ${PASSWORD} (téléphone ${PHONE})`);
