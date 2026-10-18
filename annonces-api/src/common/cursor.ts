import { BadRequestException } from '@nestjs/common';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PG_TS_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}(:\d{2})?$/;

/**
 * Pagination par curseur (date + id) : stable même quand de nouvelles lignes arrivent.
 * La date est gardée en texte PostgreSQL pour conserver la précision à la microseconde.
 */
export const encodeCursor = (ts: string, id: string) =>
  Buffer.from(JSON.stringify({ t: ts, i: id })).toString('base64url');

export function decodeCursor(cursor: string): { t: string; i: string } {
  try {
    const o = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { t?: unknown; i?: unknown };
    if (typeof o.t === 'string' && typeof o.i === 'string' && PG_TS_RE.test(o.t) && UUID_RE.test(o.i)) {
      return { t: o.t, i: o.i };
    }
  } catch {
    /* tombe dans l'erreur ci-dessous */
  }
  throw new BadRequestException({ code: 'INVALID_CURSOR', message: 'Curseur invalide.' });
}

/** Curseur du tri par prix : (prix, id). Le prix est un entier (XAF, sans centimes). */
export const encodePriceCursor = (price: number, id: string) =>
  Buffer.from(JSON.stringify({ p: price, i: id })).toString('base64url');

export function decodePriceCursor(cursor: string): { p: number; i: string } {
  try {
    const o = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { p?: unknown; i?: unknown };
    if (typeof o.p === 'number' && Number.isSafeInteger(o.p) && typeof o.i === 'string' && UUID_RE.test(o.i)) {
      return { p: o.p, i: o.i };
    }
  } catch {
    /* tombe dans l'erreur ci-dessous */
  }
  throw new BadRequestException({ code: 'INVALID_CURSOR', message: 'Curseur invalide.' });
}
