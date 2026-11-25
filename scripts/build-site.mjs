#!/usr/bin/env node
// Monta la web completa de GitHub Pages: el catálogo (apps.json, <app>/latest.json y
// <app>/tauri.json), los QR de los APK, los esquemas, los iconos y index.html.
//
//   node scripts/build-site.mjs --manifests <carpeta> --out <carpeta> [--now <fecha ISO>] [--skip-invalid]
//
// --skip-invalid  Un manifest inválido se avisa y se ignora en vez de parar el build
//                 (lo usa el workflow, para que una release mal hecha no tumbe la web).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import QRCode from "qrcode";
import { buildCatalog, loadManifests, validateCatalogFiles, validateSchema } from "./catalog.mjs";
import { qrPath, renderPage } from "./site.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const { values: args } = parseArgs({
  options: {
    manifests: { type: "string" },
    out: { type: "string" },
    config: { type: "string", default: path.join(ROOT, "catalog.json") },
    now: { type: "string" },
    "skip-invalid": { type: "boolean", default: false },
  },
});
if (!args.manifests || !args.out) {
  console.error("Uso: node scripts/build-site.mjs --manifests <carpeta> --out <carpeta> [--now <fecha>] [--skip-invalid]");
  process.exit(2);
}

const warn = (msg) => console.log(process.env.GITHUB_ACTIONS ? `::warning::${msg}` : `Aviso: ${msg}`);
const fail = (lines) => {
  console.error(lines.join("\n"));
  process.exit(1);
};

const config = JSON.parse(fs.readFileSync(args.config, "utf8"));
const configErrors = validateSchema("catalog", config);
if (configErrors.length) fail(configErrors.map((e) => `catalog.json: ${e}`));

const loaded = loadManifests(args.manifests, { skipInvalid: args["skip-invalid"] });
if (loaded.errors.length) fail(loaded.errors);
loaded.warnings.forEach(warn);

const { files, warnings } = buildCatalog(config, loaded.manifests, { now: args.now ?? new Date() });
warnings.forEach(warn);
const invalid = validateCatalogFiles(files);
if (invalid.length) fail([`El catálogo generado no es válido:`, ...invalid]);

const out = path.resolve(args.out);
fs.rmSync(out, { recursive: true, force: true });
const write = (file, content) => {
  const target = path.join(out, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};

for (const [file, data] of Object.entries(files)) write(file, JSON.stringify(data, null, 2) + "\n");

fs.cpSync(path.join(ROOT, "site"), out, { recursive: true });
fs.cpSync(path.join(ROOT, "icons"), path.join(out, "icons"), { recursive: true });
fs.cpSync(path.join(ROOT, "schemas"), path.join(out, "schemas"), { recursive: true });

const apps = files["apps.json"];
for (const app of apps.apps) {
  for (const asset of app.platforms.android?.assets ?? []) {
    write(qrPath(asset), await QRCode.toString(asset.url, { type: "svg", margin: 2, errorCorrectionLevel: "M" }));
  }
}

write("index.html", renderPage(apps, config));
write(".nojekyll", "");

const count = apps.apps.map((a) => `${a.name} (${Object.keys(a.platforms).join(", ") || "sin versiones"})`).join("; ");
console.log(`Web generada en ${out}: ${loaded.manifests.length} releases. ${count}`);
