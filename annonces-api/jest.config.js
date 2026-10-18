/** Tests : unitaires (test/unit) et de bout en bout sur une vraie base (test/e2e, voir test/compose.yml). */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  // Simple transpilation (rapide) : les types sont vérifiés par « npm run typecheck »
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/test/tsconfig.jest.json', diagnostics: false }] },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  // Une seule base partagée : les fichiers s'exécutent l'un après l'autre
  maxWorkers: 1,
  testTimeout: 30000,
};
