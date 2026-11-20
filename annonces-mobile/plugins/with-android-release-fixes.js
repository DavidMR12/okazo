// Okazo : retouches Android de la version Play Store (21/11/2026).
// 1. R8 (minify) : garder WorkManager et Room. AdMob s'appuie sur WorkManager ; sans ces règles, R8 retire
//    WorkDatabase_Impl et l'appli se ferme dès l'ouverture (« Failed to create an instance of
//    androidx.work.impl.WorkDatabase »), comme LocAr et Louam en novembre 2026.
// 2. Wi-Fi et écran portrait déclarés facultatifs : sinon Google Play cache l'appli aux appareils sans Wi-Fi
//    ou sans mode portrait (avertissement de la Play Console du 20/11/2026).
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const KEEP_RULES = `
# Okazo : WorkManager et Room (utilisés par AdMob), jamais retirés par R8
-keep class androidx.work.** { *; }
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keep class androidx.room.** { *; }
-dontwarn androidx.work.**
`;

const OPTIONAL_FEATURES = ["android.hardware.wifi", "android.hardware.screen.portrait"];

function withKeepRules(config) {
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const file = path.join(mod.modRequest.platformProjectRoot, "app", "proguard-rules.pro");
      const rules = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      if (!rules.includes("androidx.work.**")) fs.writeFileSync(file, rules + KEEP_RULES);
      return mod;
    },
  ]);
}

function withOptionalFeatures(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest.$["xmlns:tools"] = manifest.$["xmlns:tools"] || "http://schemas.android.com/tools";
    const features = (manifest["uses-feature"] = manifest["uses-feature"] || []);
    for (const name of OPTIONAL_FEATURES) {
      const found = features.find((f) => f.$["android:name"] === name);
      const attrs = { "android:name": name, "android:required": "false", "tools:replace": "android:required" };
      if (found) found.$ = { ...found.$, ...attrs };
      else features.push({ $: attrs });
    }
    return mod;
  });
}

module.exports = function withAndroidReleaseFixes(config) {
  return withOptionalFeatures(withKeepRules(config));
};
