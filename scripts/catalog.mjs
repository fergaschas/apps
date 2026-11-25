// Catálogo del repo apps: valida manifest.json y genera apps.json, <app>/latest.json
// y <app>/tauri.json. Sin efectos secundarios: la lectura y escritura de archivos
// está en build-catalog.mjs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const SCHEMAS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "schemas");
export const SCHEMA_BASE = "https://fergaschas.github.io/apps/schemas/";
const SCHEMA_NAMES = ["manifest", "latest", "catalog", "apps", "tauri"];

const DESKTOP = ["windows", "macos", "linux"];

// --- Validación de esquemas ---------------------------------------------------

let ajv;
function getAjv() {
  if (ajv) return ajv;
  // strictTypes desactivado: los esquemas restringen campos de un $ref sin repetir su "type".
  ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false });
  addFormats(ajv);
  for (const name of SCHEMA_NAMES) {
    ajv.addSchema(JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, `${name}.schema.json`), "utf8")));
  }
  return ajv;
}

/** Valida `data` contra uno de los esquemas (manifest, latest, catalog, apps, tauri). Devuelve una lista de errores. */
export function validateSchema(name, data) {
  const validate = getAjv().getSchema(`${SCHEMA_BASE}${name}.schema.json`);
  if (validate(data)) return [];
  return validate.errors.map((e) => `${e.instancePath || "/"} ${e.message}${e.params?.allowedValues ? ` (${e.params.allowedValues.join(", ")})` : ""}`);
}

// --- Versiones ------------------------------------------------------------------

function parseSemver(v) {
  const [core, pre] = v.split(/-(.*)/s);
  return { core: core.split(".").map(Number), pre: pre ? pre.split(".") : [] };
}

/** Compara dos versiones SemVer: negativo si a < b, 0 si son iguales, positivo si a > b. */
export function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) if (pa.core[i] !== pb.core[i]) return pa.core[i] - pb.core[i];
  // Una versión sin prerelease es mayor que la misma con prerelease (1.0.0 > 1.0.0-beta).
  if (!pa.pre.length || !pb.pre.length) return pb.pre.length - pa.pre.length;
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
    const x = pa.pre[i];
    const y = pb.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) return Number(x) - Number(y);
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

// --- Validación de un manifest --------------------------------------------------

/** Nombre que debe tener un archivo según la convención <app>-<versión>-<plataforma>[-<arch>].<ext>. */
export function expectedFileName(app, version, platform, asset) {
  const arch = platform === "android" ? "" : `-${asset.arch}`;
  return `${app}-${version}-${platform}${arch}.${asset.type}`;
}

/**
 * Valida un manifest.json: el esquema y las reglas que el esquema no puede
 * expresar (tag, nombres de archivo, betas). Devuelve una lista de errores.
 */
export function validateManifest(manifest) {
  const errors = validateSchema("manifest", manifest);
  if (errors.length) return errors;

  const { app, version, tag, prerelease, platforms } = manifest;
  const names = Object.keys(platforms);

  const validTags = [`${app}-v${version}`, ...(names.length === 1 ? [`${app}-${names[0]}-v${version}`] : [])];
  if (!validTags.includes(tag)) errors.push(`/tag debe ser ${validTags.join(" o ")}`);

  if (version.includes("-") && !prerelease) errors.push(`/prerelease debe ser true: ${version} es una beta`);

  const seen = new Set();
  for (const [platform, data] of Object.entries(platforms)) {
    data.assets.forEach((asset, i) => {
      const where = `/platforms/${platform}/assets/${i}`;
      const expected = expectedFileName(app, version, platform, asset);
      if (asset.file !== expected) errors.push(`${where}/file debe ser ${expected}`);
      if (seen.has(asset.file)) errors.push(`${where}/file repetido: ${asset.file}`);
      seen.add(asset.file);
      if (platform === "android" && asset.arch !== "universal") errors.push(`${where}/arch debe ser universal en Android`);
      if (asset.updater && (asset.type === "apk" || asset.type === "dmg")) {
        errors.push(`${where}/updater: el actualizador de Tauri no instala archivos .${asset.type}`);
      }
      if (asset.download === false && !asset.updater) errors.push(`${where}: un archivo que no se descarga (download: false) tiene que servir al actualizador`);
    });
  }
  return errors;
}

// --- Generación del catálogo ---------------------------------------------------

const downloadUrl = (repo, tag, file) => `https://github.com/${repo}/releases/download/${tag}/${file}`;

/** Última versión estable de una plataforma entre todos los manifests de una app. */
function latestFor(manifests, platform) {
  let best;
  for (const m of manifests) {
    if (m.prerelease || !m.platforms[platform]) continue;
    if (!best || compareSemver(m.version, best.version) > 0) best = m;
  }
  return best;
}

function publishedPlatform(repo, manifest, platform) {
  const { assets, ...fields } = manifest.platforms[platform];
  return {
    version: manifest.version,
    tag: manifest.tag,
    date: manifest.date,
    ...fields,
    notes: manifest.notes,
    assets: assets.map((a) => ({ ...a, url: downloadUrl(repo, manifest.tag, a.file) })),
  };
}

const TAURI_OS = { windows: "windows", macos: "darwin", linux: "linux" };
const TAURI_ARCH = { x64: ["x86_64"], arm64: ["aarch64"], universal: ["x86_64", "aarch64"] };
const TAURI_INSTALLER = { exe: "nsis", msi: "msi", "app.tar.gz": "app", AppImage: "appimage", deb: "deb" };
// Qué paquete usa la clave genérica <os>-<arch> cuando hay varios.
const TAURI_PREFERRED = ["exe", "app.tar.gz", "AppImage", "msi", "deb"];

/**
 * JSON del actualizador de Tauri. Tauri admite una sola versión por archivo, así que
 * se toma la versión de escritorio más alta y solo las plataformas que la tienen.
 */
function tauriJson(platforms) {
  const desktop = DESKTOP.filter((p) => platforms[p]?.assets.some((a) => a.updater));
  if (!desktop.length) return { json: undefined, warnings: [] };

  const version = desktop.map((p) => platforms[p].version).sort(compareSemver).at(-1);
  const included = desktop.filter((p) => platforms[p].version === version);
  const warnings = desktop
    .filter((p) => !included.includes(p))
    .map((p) => `tauri.json: ${p} se queda fuera porque va por la ${platforms[p].version} y el resto por la ${version}`);

  const generic = {};
  const specific = {};
  for (const p of included) {
    const signed = platforms[p].assets.filter((a) => a.updater);
    for (const asset of signed) {
      for (const arch of TAURI_ARCH[asset.arch]) {
        const entry = { signature: asset.updater.signature, url: asset.url };
        specific[`${TAURI_OS[p]}-${arch}-${TAURI_INSTALLER[asset.type]}`] = entry;
        const key = `${TAURI_OS[p]}-${arch}`;
        const current = generic[key];
        if (!current || TAURI_PREFERRED.indexOf(asset.type) < TAURI_PREFERRED.indexOf(current.type)) {
          generic[key] = { type: asset.type, entry };
        }
      }
    }
  }
  const first = platforms[included[0]];
  const json = {
    version,
    notes: first.notes,
    pub_date: first.date,
    platforms: {
      ...Object.fromEntries(Object.entries(generic).map(([k, v]) => [k, v.entry])),
      ...specific,
    },
  };
  return { json, warnings };
}

/**
 * Genera el catálogo a partir de la configuración (catalog.json) y de todos los
 * manifest.json publicados. Devuelve { files: { "<ruta>": objeto }, warnings }.
 * Los manifests tienen que estar validados con validateManifest.
 */
export function buildCatalog(config, manifests, { now = new Date() } = {}) {
  const generated = new Date(now).toISOString().replace(/\.000Z$/, "Z");
  const files = {};
  const warnings = [];
  const known = new Set(config.apps.map((a) => a.id));

  for (const m of manifests) {
    if (!known.has(m.app)) warnings.push(`${m.tag}: la app ${m.app} no está en catalog.json y se ignora`);
  }

  const apps = config.apps.map(({ platforms: wanted, ...info }) => {
    const own = manifests.filter((m) => m.app === info.id);
    const platforms = {};
    for (const p of wanted) {
      const m = latestFor(own, p);
      if (m) platforms[p] = publishedPlatform(config.repo, m, p);
    }
    for (const m of own) {
      for (const p of Object.keys(m.platforms)) {
        if (!wanted.includes(p)) warnings.push(`${m.tag}: ${p} no está en las plataformas de ${info.id} en catalog.json y se ignora`);
      }
    }

    files[`${info.id}/latest.json`] = {
      $schema: `${SCHEMA_BASE}latest.schema.json`,
      schemaVersion: 1,
      app: info.id,
      generated,
      platforms,
    };

    const tauri = tauriJson(platforms);
    warnings.push(...tauri.warnings);
    if (tauri.json) files[`${info.id}/tauri.json`] = tauri.json;

    return {
      ...info,
      platforms,
      latest: `${info.id}/latest.json`,
      ...(tauri.json ? { tauri: `${info.id}/tauri.json` } : {}),
    };
  });

  files["apps.json"] = { $schema: `${SCHEMA_BASE}apps.schema.json`, schemaVersion: 1, generated, apps };
  return { files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))), warnings };
}

/** Valida los archivos generados por buildCatalog contra sus esquemas. */
export function validateCatalogFiles(files) {
  const errors = [];
  for (const [file, data] of Object.entries(files)) {
    const schema = file === "apps.json" ? "apps" : file.endsWith("/latest.json") ? "latest" : "tauri";
    errors.push(...validateSchema(schema, data).map((e) => `${file}: ${e}`));
  }
  return errors;
}
