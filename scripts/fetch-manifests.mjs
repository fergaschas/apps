#!/usr/bin/env node
// Descarga el manifest.json de cada release publicada del repo en <out>/<tag>/manifest.json.
//
//   node scripts/fetch-manifests.mjs --repo fergaschas/apps --out manifests
//
// Usa GITHUB_TOKEN o GH_TOKEN si existen (en Actions, para no chocar con el límite
// de la API sin autenticar). Se saltan los borradores y las releases sin manifest.json.
// "prerelease" lo decide la release de GitHub, que se puede cambiar a mano desde la web.

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: { repo: { type: "string" }, out: { type: "string" } },
});
if (!args.repo || !args.out) {
  console.error("Uso: node scripts/fetch-manifests.mjs --repo <usuario>/<repo> --out <carpeta>");
  process.exit(2);
}

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const headers = {
  "User-Agent": "apps-catalog",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};
const warn = (msg) => console.log(process.env.GITHUB_ACTIONS ? `::warning::${msg}` : `Aviso: ${msg}`);

async function get(url, accept) {
  const res = await fetch(url, { headers: { ...headers, Accept: accept } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status} ${await res.text()}`);
  return res;
}

async function listReleases() {
  const releases = [];
  for (let page = 1; ; page++) {
    const res = await get(`https://api.github.com/repos/${args.repo}/releases?per_page=100&page=${page}`, "application/vnd.github+json");
    const batch = await res.json();
    releases.push(...batch);
    if (batch.length < 100) return releases;
  }
}

fs.rmSync(args.out, { recursive: true, force: true });
fs.mkdirSync(args.out, { recursive: true });

let saved = 0;
for (const release of await listReleases()) {
  if (release.draft) continue;
  const asset = release.assets.find((a) => a.name === "manifest.json");
  if (!asset) {
    warn(`${release.tag_name}: no tiene manifest.json y no sale en el catálogo`);
    continue;
  }
  let manifest;
  try {
    manifest = await (await get(asset.url, "application/octet-stream")).json();
  } catch (e) {
    warn(`${release.tag_name}: no se pudo leer manifest.json (${e.message})`);
    continue;
  }
  if (manifest.tag !== release.tag_name) {
    warn(`${release.tag_name}: el manifest dice tag ${manifest.tag}; se ignora`);
    continue;
  }
  if (manifest.prerelease !== release.prerelease) {
    warn(`${release.tag_name}: el manifest dice prerelease ${manifest.prerelease} y la release ${release.prerelease}; manda la release`);
    manifest.prerelease = release.prerelease;
  }
  // Los archivos del manifest tienen que estar de verdad en la release, con el mismo tamaño.
  const missing = Object.values(manifest.platforms ?? {})
    .flatMap((p) => p.assets ?? [])
    .filter((a) => release.assets.find((r) => r.name === a.file)?.size !== a.size)
    .map((a) => a.file);
  if (missing.length) {
    warn(`${release.tag_name}: archivos que faltan en la release o con otro tamaño (${missing.join(", ")}); se ignora`);
    continue;
  }
  const dir = path.join(args.out, release.tag_name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  saved++;
}
console.log(`${saved} manifests descargados de ${args.repo}`);
