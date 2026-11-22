// Okazo : notifications push par Firebase (22/11/2026). google-services.json (projet Firebase « Okazo », console
// Firebase > Paramètres du projet > Applications > Android org.okazo.app) est pris s'il est présent à la racine.
// Sans lui, l'appli se construit quand même, simplement sans notifications (src/lib/push.ts).
const fs = require("fs");
const path = require("path");

module.exports = function withGoogleServices(config) {
  const file = path.join(config._internal?.projectRoot ?? process.cwd(), "google-services.json");
  if (!fs.existsSync(file)) return config;
  return { ...config, android: { ...config.android, googleServicesFile: "./google-services.json" } };
};
