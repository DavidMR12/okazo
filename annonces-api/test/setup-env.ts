// Chargé avant chaque fichier de test, avant toute importation de src/config/env.ts.
// Les valeurs déjà définies (ex. CI) sont conservées.
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  VISUAL_SEARCH_ENABLED: 'false',
  DATABASE_URL: 'postgres://annonces:annonces@localhost:5433/annonces_test',
  REDIS_URL: 'redis://localhost:6380',
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef0123456789abcdef',
  OTP_SECRET: 'test-otp-secret-0123456789abcdef0123456789abcdef',
  SMS_PROVIDER: 'console',
  S3_ENDPOINT: 'http://localhost:9999',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'test-media',
  S3_ACCESS_KEY_ID: 'test',
  S3_SECRET_ACCESS_KEY: 'test',
  MEDIA_PUBLIC_BASE_URL: 'http://media.test',
  // Les workers sont pilotés à la main dans les tests
  RUN_MODERATION_WORKER: 'false',
  RUN_MAINTENANCE_WORKER: 'false',
};

for (const [k, v] of Object.entries(defaults)) {
  if (process.env[k] === undefined) process.env[k] = v;
}
