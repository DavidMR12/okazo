import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Mots de passe hachés avec scrypt (inclus dans Node, résistant aux cartes graphiques).
 * Format stocké : « scrypt$N$r$p$sel$empreinte » (base64), pour pouvoir durcir les paramètres plus tard.
 */
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  // Sans mot de passe enregistré, on calcule quand même une empreinte : même durée de réponse
  // (sinon on devinerait quelles adresses ont un compte).
  const parts = stored?.split('$') ?? [];
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    await derive(password, randomBytes(16), N, R, P);
    return false;
  }
  const [, n, r, p, salt, key] = parts;
  const expected = Buffer.from(key, 'base64');
  const given = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return given.length === expected.length && timingSafeEqual(given, expected);
}
