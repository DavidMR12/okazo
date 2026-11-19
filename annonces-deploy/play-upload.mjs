#!/usr/bin/env node
/**
 * Envoi d'une version de l'application (fichier .aab) sur Google Play, sans passer par la
 * console (repris de Louam le 19/11/2026). Interface officielle « Google Play Developer API ».
 *
 * Utilisation : node annonces-deploy/play-upload.mjs <fichier.aab> [piste] [notes]
 *   piste : internal (test interne, par défaut), alpha (test fermé), beta (test ouvert), production
 *   notes : « Nouveautés » en français (facultatif)
 *
 * Clé : compte de service Google (fichier JSON) créé par le porteur, gardé hors du code dans
 * C:\Personnel\Kaba\cles-android\play-compte-service.json (ou OKAZO_PLAY_KEY), exclu de Git.
 * La clé ne passe jamais par la conversation ni par le dépôt.
 */
import crypto from "node:crypto";
import fs from "node:fs";

// Nom technique de l’application (BRAND.appId dans annonces-mobile/app.config.ts) : ne change plus après le premier envoi.
const PACKAGE = "org.okazo.app";
const KEY_FILE = process.env.OKAZO_PLAY_KEY || "C:/Personnel/Kaba/cles-android/play-compte-service.json";
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;
const UPLOAD = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE}`;

const [aab, track = "internal", notes = ""] = process.argv.slice(2);
if (!aab || !fs.existsSync(aab)) fail(`Fichier .aab introuvable : ${aab ?? "(aucun)"}`);
if (!["internal", "alpha", "beta", "production"].includes(track)) fail(`Piste inconnue : ${track}`);
if (!fs.existsSync(KEY_FILE)) {
  fail(
    `Clé Google Play absente : ${KEY_FILE}\n` +
      "Créez le compte de service (voir « Publication sur les stores » dans CLAUDE.md), puis enregistrez son fichier JSON à cet endroit.",
  );
}

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

const b64url = (b) => Buffer.from(b).toString("base64url");

/** Jeton d'accès à partir du compte de service (JWT signé, échangé chez Google). */
async function accessToken() {
  const key = JSON.parse(fs.readFileSync(KEY_FILE, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const sig = crypto.createSign("RSA-SHA256").update(`${head}.${claims}`).sign(key.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }),
  });
  const json = await res.json();
  if (!res.ok) fail(`Google refuse la clé : ${json.error_description ?? json.error ?? res.status}`);
  return json.access_token;
}

async function call(token, method, url, body, contentType = "application/json") {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": contentType } : {}) },
    body: body ? (contentType === "application/json" ? JSON.stringify(body) : body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = new Error(json.error?.message ?? `Erreur ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

const token = await accessToken();
console.log(`→ Envoi de ${aab} sur la piste « ${track} »…`);

let edit;
try {
  edit = await call(token, "POST", `${API}/edits`, {});
} catch (e) {
  fail(
    e.status === 403 || e.status === 401
      ? `Accès refusé par Google Play : le compte de service n'a pas les droits sur l'application (${e.message}).`
      : `Ouverture de la modification impossible : ${e.message}`,
  );
}

try {
  const bundle = await call(token, "POST", `${UPLOAD}/edits/${edit.id}/bundles?uploadType=media`, fs.readFileSync(aab), "application/octet-stream");
  console.log(`  ✓ Fichier reçu par Google (versionCode ${bundle.versionCode})`);

  const release = (status) => ({
    track,
    releases: [
      {
        versionCodes: [String(bundle.versionCode)],
        status,
        ...(notes ? { releaseNotes: [{ language: "fr-FR", text: notes.slice(0, 500) }] } : {}),
      },
    ],
  });
  let status = "completed";
  try {
    await call(token, "PUT", `${API}/edits/${edit.id}/tracks/${track}`, release(status));
    await call(token, "POST", `${API}/edits/${edit.id}:commit`);
  } catch (e) {
    // Application pas encore publiée (fiche en brouillon) : Google n'accepte que des versions brouillon
    if (!/draft/i.test(e.message)) throw e;
    status = "draft";
    await call(token, "PUT", `${API}/edits/${edit.id}/tracks/${track}`, release(status));
    await call(token, "POST", `${API}/edits/${edit.id}:commit`);
  }
  console.log(
    status === "completed"
      ? `  ✓ Version ${bundle.versionCode} publiée sur la piste « ${track} » (Google peut encore la vérifier avant diffusion).`
      : `  ✓ Version ${bundle.versionCode} envoyée en brouillon sur « ${track} » : l'application n'est pas encore publiée, un clic « Déployer » reste à faire dans la Play Console.`,
  );
} catch (e) {
  await call(token, "DELETE", `${API}/edits/${edit.id}`).catch(() => undefined);
  fail(`Envoi refusé par Google Play : ${e.message}`);
}
