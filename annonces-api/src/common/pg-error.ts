/** Rassemble les messages d'une erreur et de ses causes (Drizzle enveloppe les erreurs PostgreSQL). */
export function pgErrorText(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 4 && cur; i++) {
    const e = cur as { message?: unknown; cause?: unknown };
    if (typeof e.message === 'string') parts.push(e.message);
    cur = e.cause;
  }
  return parts.join(' | ');
}
