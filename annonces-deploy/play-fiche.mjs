#!/usr/bin/env node
/**
 * Okazo : met à jour la fiche Google Play (textes et images) depuis annonces-deploy/play-store/fr-FR/ (19/11/2026).
 *
 *   python annonces-deploy/play-store/genere-images.py   # icône, bannière, captures encadrées
 *   node annonces-deploy/play-fiche.mjs                  # envoi
 *
 * fr-FR/title.txt (30 car. max), shortDescription.txt (80), fullDescription.txt (4000), icon.png (512 x 512),
 * featureGraphic.png (1024 x 500), phoneScreenshots/*.png (2 à 8 ; rien n'est remplacé si le dossier est vide).
 * Même clé que play-upload.mjs (compte de service, C:\Personnel\Kaba\cles-android\, exclu de Git).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PACKAGE = "org.okazo.app";
const LANG = "fr-FR";
const KEY_FILE = process.env.OKAZO_PLAY_KEY || "C:/Personnel/Kaba/cles-android/play-compte-service.json";
const DIR = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "play-store", LANG);
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;
const UPLOAD = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE}`;

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}
const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8").trim();
const LIMITS = { "title.txt": 30, "shortDescription.txt": 80, "fullDescription.txt": 4000 };
for (const [f, max] of Object.entries(LIMITS)) if ([...read(f)].length > max) fail(`${f} dépasse ${max} caractères`);

async function accessToken() {
  const key = JSON.parse(fs.readFileSync(KEY_FILE, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const b = (x) => Buffer.from(x).toString("base64url");
  const head = b(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b(JSON.stringify({ iss: key.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = crypto.createSign("RSA-SHA256").update(`${head}.${claims}`).sign(key.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }) });
  const json = await res.json();
  if (!res.ok) fail(`Google refuse la clé : ${json.error_description ?? json.error}`);
  return json.access_token;
}

const token = await accessToken();
async function call(method, url, body, type = "application/json") {
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": type } : {}) }, body: body && type === "application/json" ? JSON.stringify(body) : body });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url.replace(API, "").replace(UPLOAD, "")} : ${JSON.parse(text || "{}").error?.message ?? res.status}`);
  return text ? JSON.parse(text) : {};
}

const edit = await call("POST", `${API}/edits`, {});
const E = `${API}/edits/${edit.id}`;
const U = `${UPLOAD}/edits/${edit.id}`;
try {
  await call("PUT", `${E}/listings/${LANG}`, { language: LANG, title: read("title.txt"), shortDescription: read("shortDescription.txt"), fullDescription: read("fullDescription.txt") });
  console.log("  ✓ Titre et descriptions");
  for (const type of ["icon", "featureGraphic"]) {
    await call("DELETE", `${E}/listings/${LANG}/${type}`);
    await call("POST", `${U}/listings/${LANG}/${type}?uploadType=media`, fs.readFileSync(path.join(DIR, `${type}.png`)), "image/png");
    console.log(`  ✓ ${type}`);
  }
  const shots = fs.existsSync(path.join(DIR, "phoneScreenshots")) ? fs.readdirSync(path.join(DIR, "phoneScreenshots")).filter((f) => f.endsWith(".png")).sort() : [];
  if (shots.length) {
    await call("DELETE", `${E}/listings/${LANG}/phoneScreenshots`);
    for (const f of shots) await call("POST", `${U}/listings/${LANG}/phoneScreenshots?uploadType=media`, fs.readFileSync(path.join(DIR, "phoneScreenshots", f)), "image/png");
    console.log(`  ✓ ${shots.length} capture(s) d'écran`);
  }
  await call("POST", `${E}:commit`);
  console.log("✓ Fiche Google Play mise à jour.");
} catch (e) {
  await call("DELETE", E).catch(() => undefined);
  fail(e.message);
}
