/** Premiers octets de chaque format accepté : le type annoncé à l'envoi ne prouve rien sur le contenu du fichier. */
const startsWith = (head: Buffer, bytes: number[], offset = 0) => bytes.every((b, i) => head[offset + i] === b);

const CHECKS: Record<string, (head: Buffer) => boolean> = {
  'image/jpeg': (h) => startsWith(h, [0xff, 0xd8, 0xff]),
  'image/png': (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/webp': (h) => startsWith(h, [0x52, 0x49, 0x46, 0x46]) && startsWith(h, [0x57, 0x45, 0x42, 0x50], 8),
  'application/pdf': (h) => startsWith(h, [0x25, 0x50, 0x44, 0x46, 0x2d]),
};

export const matchesType = (contentType: string, head: Buffer): boolean => CHECKS[contentType]?.(head) ?? false;
