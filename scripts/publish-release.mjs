#!/usr/bin/env node
// Publica una versión de una app en el repo apps: renombra los archivos según la
// convención, calcula tamaño y SHA-256, recoge las firmas de Tauri (.sig), genera y
// valida el manifest.json y crea la release como borrador, la completa y la publica.
// Lo usa la action publish/ desde la CI de cada app.
//
//   node scripts/publish-release.mjs --app melomango --version 0.15.0 --notes-file notas.md \
//     --asset "windows x64 ruta/Melomango_0.15.0_x64-setup.exe" \
//     --asset "windows x64 ruta/Melomango_0.15.0_x64_es-ES.msi" --min-os windows=10 [--dry-run]
//
//   --asset "<plataforma> <arch> <ruta>"   Repetible. El tipo sale de la extensión. Si existe <ruta>.sig,
//                                          su contenido va en updater.signature.
//   --tag            Por defecto <app>-v<versión>. Para una plataforma con versión propia,
//                    <app>-<plataforma>-v<versión>.
//   --version-code / --min-sdk             Obligatorios si hay un APK.
//   --min-os <plataforma>=<versión>        Repetible. Versión mínima del sistema en escritorio.
//   --prerelease     Por defecto, si la versión lleva sufijo (0.15.0-beta.1).
//   --out            Carpeta donde se dejan los archivos renombrados y el manifest.
//   --dry-run        Lo prepara y lo valida todo, pero no publica.
//
// Publica con gh y el token de GH_TOKEN, que tiene que poder escribir en el repo apps.

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { expectedFileName, validateManifest } from "./catalog.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const TYPES = ["app.tar.gz", "AppImage", "apk", "exe", "msi", "dmg", "deb"];

/** Tipo de archivo según su extensión (app.tar.gz antes que las demás). */
export function assetType(file) {
  const type = TYPES.find((t) => file.toLowerCase().endsWith(`.${t.toLowerCase()}`));
  if (!type) throw new Error(`${file}: extensión desconocida (se admiten ${TYPES.map((t) => `.${t}`).join(", ")})`);
  return type;
}

/** "windows x64 ruta con espacios.exe" → { platform, arch, path } */
export function parseAssetSpec(spec) {
  const match = spec.trim().match(/^(\S+)\s+(\S+)\s+(.+)$/);
  if (!match) throw new Error(`--asset "${spec}": tiene que ser "<plataforma> <arch> <ruta>"`);
  return { platform: match[1], arch: match[2], path: match[3].trim() };
}

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

/**
 * Prepara la release: el manifest (validado) y la lista de archivos a subir con su
 * nombre final. No toca la red ni copia nada.
 */
export function buildRelease({ app, version, tag, notes, prerelease, assets, versionCode, minSdk, minOs = {}, date = new Date() }) {
  if (!notes?.trim()) throw new Error("Faltan las notas de la versión");
  const platforms = {};
  const files = [];

  for (const spec of assets) {
    if (!fs.existsSync(spec.path)) throw new Error(`No existe ${spec.path}`);
    const type = assetType(spec.path);
    const asset = { file: "", arch: spec.arch, type, size: fs.statSync(spec.path).size, sha256: sha256(spec.path) };
    asset.file = expectedFileName(app, version, spec.platform, asset);
    if (type === "app.tar.gz") asset.download = false;
    const sig = `${spec.path}.sig`;
    if (fs.existsSync(sig) && type !== "apk" && type !== "dmg") {
      asset.updater = { signature: fs.readFileSync(sig, "utf8").trim() };
    }

    platforms[spec.platform] ??= { assets: [] };
    platforms[spec.platform].assets.push(asset);
    files.push({ from: spec.path, name: asset.file });
  }

  if (platforms.android) {
    platforms.android = { versionCode: Number(versionCode), minSdk: Number(minSdk), assets: platforms.android.assets };
  }
  for (const [platform, value] of Object.entries(minOs)) {
    if (!platforms[platform]) throw new Error(`--min-os ${platform}: no hay archivos de ${platform}`);
    platforms[platform] = { minOsVersion: value, ...platforms[platform] };
  }

  const manifest = {
    schemaVersion: 1,
    app,
    version,
    tag: tag || `${app}-v${version}`,
    prerelease: prerelease ?? version.includes("-"),
    date: new Date(date).toISOString().replace(/\.\d{3}Z$/, "Z"),
    notes: notes.replace(/\r\n/g, "\n").trim(),
    platforms,
  };
  const errors = validateManifest(manifest);
  if (errors.length) throw new Error(`El manifest no es válido:\n${errors.join("\n")}`);
  return { manifest, files };
}

// --- Publicación -----------------------------------------------------------------

function gh(args, { json = false } = {}) {
  const out = execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return json ? JSON.parse(out) : out.trim();
}

function releaseExists(repo, tag) {
  try {
    execFileSync("gh", ["release", "view", tag, "--repo", repo, "--json", "tagName"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { values: args } = parseArgs({
    options: {
      app: { type: "string" },
      version: { type: "string" },
      tag: { type: "string" },
      title: { type: "string" },
      "notes-file": { type: "string" },
      asset: { type: "string", multiple: true, default: [] },
      "version-code": { type: "string" },
      "min-sdk": { type: "string" },
      "min-os": { type: "string", multiple: true, default: [] },
      prerelease: { type: "boolean" },
      repo: { type: "string" },
      out: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  for (const required of ["app", "version", "notes-file"]) {
    if (!args[required]) throw new Error(`Falta --${required}`);
  }
  if (!args.asset.length) throw new Error("Falta al menos un --asset");

  const repo = args.repo ?? JSON.parse(fs.readFileSync(path.join(ROOT, "catalog.json"), "utf8")).repo;
  const minOs = Object.fromEntries(
    args["min-os"].map((s) => {
      const [platform, value] = s.split("=");
      if (!platform || !value) throw new Error(`--min-os "${s}": tiene que ser <plataforma>=<versión>`);
      return [platform.trim(), value.trim()];
    }),
  );

  const { manifest, files } = buildRelease({
    app: args.app,
    version: args.version,
    tag: args.tag,
    notes: fs.readFileSync(args["notes-file"], "utf8"),
    prerelease: args.prerelease,
    assets: args.asset.map(parseAssetSpec),
    versionCode: args["version-code"],
    minSdk: args["min-sdk"],
    minOs,
  });

  const out = args.out ?? fs.mkdtempSync(path.join(os.tmpdir(), "publicar-"));
  fs.mkdirSync(out, { recursive: true });
  const upload = files.map(({ from, name }) => {
    const target = path.join(out, name);
    fs.copyFileSync(from, target);
    return target;
  });
  const manifestPath = path.join(out, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  const notesPath = path.join(out, "notas.md");
  fs.writeFileSync(notesPath, manifest.notes + "\n");

  console.log(`${manifest.tag} → ${repo}${manifest.prerelease ? " (pre-release)" : ""}`);
  for (const [platform, data] of Object.entries(manifest.platforms)) {
    for (const a of data.assets) console.log(`  ${platform}: ${a.file} (${a.size} bytes, sha256 ${a.sha256.slice(0, 12)}…${a.updater ? ", firmado" : ""})`);
  }
  console.log(`  ${manifestPath}`);

  if (args["dry-run"]) {
    console.log("Simulación: no se publica nada.");
    return;
  }

  if (releaseExists(repo, manifest.tag)) throw new Error(`Ya existe la release ${manifest.tag} en ${repo}. Sube la versión.`);

  const title = args.title ?? `${args.app.replace(/^./, (c) => c.toUpperCase())} ${manifest.version}`;
  // Borrador primero: el catálogo solo ve la release cuando ya tiene todos los archivos.
  gh([
    "release", "create", manifest.tag, "--repo", repo, "--target", "main", "--draft",
    "--title", title, "--notes-file", notesPath, ...(manifest.prerelease ? ["--prerelease"] : []),
    ...upload, manifestPath,
  ]);
  try {
    const { assets } = gh(["release", "view", manifest.tag, "--repo", repo, "--json", "assets"], { json: true });
    for (const file of [...upload, manifestPath]) {
      const uploaded = assets.find((a) => a.name === path.basename(file));
      if (uploaded?.size !== fs.statSync(file).size) throw new Error(`${path.basename(file)} no se ha subido entero`);
    }
    // --latest=false: el repo mezcla apps, así que "la última release" no significa nada.
    gh(["release", "edit", manifest.tag, "--repo", repo, "--draft=false", "--latest=false"]);
  } catch (e) {
    console.error(`No se ha podido completar la release; se borra el borrador. ${e.message}`);
    try {
      gh(["release", "delete", manifest.tag, "--repo", repo, "--yes"]);
    } catch {
      console.error(`Borra a mano el borrador ${manifest.tag} en https://github.com/${repo}/releases`);
    }
    throw e;
  }
  console.log(`Publicada: https://github.com/${repo}/releases/tag/${manifest.tag}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
