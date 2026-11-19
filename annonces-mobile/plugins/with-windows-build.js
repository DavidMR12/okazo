// Construction Android sous Windows (repris de Louam le 19/11/2026) : les deux retouches qui
// étaient refaites à la main après chaque « expo prebuild --clean ».
// 1. Construction depuis le lecteur K: (subst, chemins courts) : l'autolinking renvoie des chemins C:\…
//    qui cassent le codegen d'async-storage ; okazo-chemins.js les ramène sur K:.
// 2. CMake 3.31 (ninja 1.12) : accepte les chemins longs de Windows.
// 3. 2 compilations C++ à la fois par module (19/11/2026) : ninja en lançait une par cœur et la
//    machine (8 Go) tombait à court de mémoire (« Insufficient system resources »).
const fs = require("fs");
const path = require("path");
const { withAppBuildGradle, withProjectBuildGradle, withSettingsGradle, withDangerousMod } = require("expo/config-plugins");

const CHEMINS_JS = `// Construction depuis le lecteur K: (chemins courts) : ramène les chemins C:\\… de l'autolinking sur K:
const { spawnSync } = require("child_process");
const [cmd, ...args] = process.argv.slice(2);
const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
process.stderr.write(r.stderr || "");
process.stdout.write((r.stdout || "").replace(/C:[\\\\/]+Personnel[\\\\/]+Kaba/gi, "K:"));
process.exit(r.status ?? 1);
`;

module.exports = function withWindowsBuild(config) {
  config = withDangerousMod(config, [
    "android",
    async (mod) => {
      fs.writeFileSync(path.join(mod.modRequest.platformProjectRoot, "okazo-chemins.js"), CHEMINS_JS);
      return mod;
    },
  ]);
  config = withSettingsGradle(config, (mod) => {
    let g = mod.modResults.contents;
    if (!g.includes("okazo-chemins.js")) {
      g = g.replace(
        /ex\.autolinkLibrariesFromCommand\(expoAutolinking\.rnConfigCommand\)/,
        'ex.autolinkLibrariesFromCommand(["node", new File(rootDir, "okazo-chemins.js").absolutePath] + expoAutolinking.rnConfigCommand)',
      );
      if (!g.includes("okazo-chemins.js")) throw new Error("with-windows-build : settings.gradle a changé, retouche de l'autolinking introuvable");
    }
    mod.modResults.contents = g;
    return mod;
  });
  config = withAppBuildGradle(config, (mod) => {
    let g = mod.modResults.contents;
    if (!g.includes('cmake { version "3.31.6" }')) {
      g = g.replace(
        /android \{\n/,
        'android {\n    // CMake 3.31 (ninja 1.12) : accepte les chemins longs de Windows\n    externalNativeBuild { cmake { version "3.31.6" } }\n',
      );
    }
    mod.modResults.contents = g;
    return mod;
  });
  config = withProjectBuildGradle(config, (mod) => {
    let g = mod.modResults.contents;
    if (!g.includes("CMAKE_JOB_POOLS")) {
      g += `
// Machine de 8 Go : 2 compilations C++ à la fois par module (plugin with-windows-build)
subprojects { p ->
  ["com.android.library", "com.android.application"].each { id ->
    p.plugins.withId(id) {
      p.android.defaultConfig.externalNativeBuild.cmake.arguments(
        "-DCMAKE_JOB_POOLS=compile=2", "-DCMAKE_JOB_POOL_COMPILE=compile", "-DCMAKE_JOB_POOL_LINK=compile")
    }
  }
}
`;
    }
    mod.modResults.contents = g;
    return mod;
  });
  return config;
};
