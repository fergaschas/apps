#!/usr/bin/env node
// Genera el catálogo (apps.json, <app>/latest.json y <app>/tauri.json) a partir de
// catalog.json y de una carpeta con los manifest.json de las releases.
//
//   node scripts/build-catalog.mjs --manifests <carpeta> --out <carpeta> [--now <fecha ISO>] [--check]
//
// --manifests  Carpeta donde se buscan, en cualquier subcarpeta, los archivos manifest.json.
// --out        Carpeta donde se escribe el catálogo.
// --now        Fecha del campo "generated" (por defecto, ahora). Sirve para que los ejemplos no cambien.
// --check      No escribe nada: falla si lo que hay en --out no coincide con lo generado.
//
// Si un manifest no es válido, falla sin escribir nada.

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { buildCatalog, validateCatalogFiles, validateManifest, validateSchema } from "./catalog.mjs";

const { values: args } = parseArgs({
  options: {
    manifests: { type: "string" },
    out: { type: "string" },
    config: { type: "string", default: "catalog.json" },
    now: { type: "string" },
    check: { type: "boolean", default: false },
  },
});
if (!args.manifests || !args.out) {
  console.error("Uso: node scripts/build-catalog.mjs --manifests <carpeta> --out <carpeta> [--now <fecha>] [--check]");
  process.exit(2);
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const toJson = (data) => JSON.stringify(data, null, 2) + "\n";

function findManifests(dir) {
  return fs
    .readdirSync(dir, { recursive: true })
    .filter((f) => path.basename(f) === "manifest.json")
    .map((f) => path.join(dir, f))
    .sort();
}

const errors = [];

const config = readJson(args.config);
errors.push(...validateSchema("catalog", config).map((e) => `${args.config}: ${e}`));

const manifests = [];
const tags = new Map();
for (const file of findManifests(args.manifests)) {
  const manifest = readJson(file);
  const problems = validateManifest(manifest);
  errors.push(...problems.map((e) => `${file}: ${e}`));
  if (problems.length) continue;
  if (tags.has(manifest.tag)) errors.push(`${file}: el tag ${manifest.tag} ya está en ${tags.get(manifest.tag)}`);
  tags.set(manifest.tag, file);
  manifests.push(manifest);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const { files, warnings } = buildCatalog(config, manifests, { now: args.now ?? new Date() });
for (const w of warnings) console.warn(`Aviso: ${w}`);

const invalid = validateCatalogFiles(files);
if (invalid.length) {
  console.error(`El catálogo generado no es válido:\n${invalid.join("\n")}`);
  process.exit(1);
}

if (args.check) {
  const stale = Object.entries(files).filter(([file, data]) => {
    const target = path.join(args.out, file);
    return !fs.existsSync(target) || fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n") !== toJson(data);
  });
  if (stale.length) {
    console.error(`No coincide con lo generado: ${stale.map(([f]) => f).join(", ")}. Regenera con npm run examples.`);
    process.exit(1);
  }
  console.log(`${manifests.length} manifests y ${Object.keys(files).length} archivos del catálogo, todo válido y al día.`);
} else {
  for (const [file, data] of Object.entries(files)) {
    const target = path.join(args.out, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, toJson(data));
    console.log(`Escrito ${target}`);
  }
}
