import { env } from '../config/env';

/** Options de connexion pour BullMQ (évite tout conflit de versions avec l'instance ioredis de l'app). */
export function bullConnection() {
  const u = new URL(env.REDIS_URL);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined,
    tls: u.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null as null,
  };
}
