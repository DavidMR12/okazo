// Signe la version Google Play (fichier .aab) avec la clé d'envoi d'Okazo (repris de Louam, 19/11/2026).
// La clé et son mot de passe restent hors du code, dans C:\Personnel\Kaba\cles-android\key.properties
// (ou le fichier donné par OKAZO_KEY_PROPERTIES). Sans ce fichier, la version reste signée en mode debug.
const { withAppBuildGradle } = require("expo/config-plugins");

const KEY_PROPERTIES = (process.env.OKAZO_KEY_PROPERTIES || "C:/Personnel/Kaba/cles-android/key.properties").replace(/\\/g, "/");

module.exports = function withUploadSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;
    if (gradle.includes("okazoUpload")) return mod;

    gradle = gradle.replace(
      /signingConfigs \{/,
      `signingConfigs {
        okazoUpload {
            def props = new Properties()
            def file = new File("${KEY_PROPERTIES}")
            if (file.exists()) {
                file.withInputStream { props.load(it) }
                storeFile new File(props["storeFile"])
                storePassword props["storePassword"]
                keyAlias props["keyAlias"]
                keyPassword props["keyPassword"]
            }
        }`
    );
    gradle = gradle.replace(
      /(release \{[\s\S]*?)signingConfig signingConfigs\.debug/,
      `$1signingConfig new File("${KEY_PROPERTIES}").exists() ? signingConfigs.okazoUpload : signingConfigs.debug`
    );
    mod.modResults.contents = gradle;
    return mod;
  });
};
