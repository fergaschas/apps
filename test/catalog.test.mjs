import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildCatalog, compareSemver, validateManifest, validateSchema } from "../scripts/catalog.mjs";

const readJson = (file) => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), "utf8"));
const desktop = readJson("../examples/releases/melomango-v0.14.0/manifest.json");
const android = readJson("../examples/releases/melomango-android-v0.1.0/manifest.json");
const config = readJson("../catalog.json");

const clone = (o) => structuredClone(o);
const sha = (c) => c.repeat(64);

/** Manifest de escritorio con otra versión, para las pruebas de "la última". */
function desktopVersion(version, { prerelease = false } = {}) {
  const m = clone(desktop);
  m.version = version;
  m.tag = `melomango-v${version}`;
  m.prerelease = prerelease;
  for (const a of m.platforms.windows.assets) a.file = `melomango-${version}-windows-x64.${a.type}`;
  return m;
}

test("los manifests de ejemplo son válidos", () => {
  assert.deepEqual(validateManifest(desktop), []);
  assert.deepEqual(validateManifest(android), []);
});

test("catalog.json es válido", () => {
  assert.deepEqual(validateSchema("catalog", config), []);
});

test("rechaza un manifest con errores de esquema", () => {
  const cases = {
    "sha256 mal": (m) => (m.platforms.windows.assets[0].sha256 = "ABC"),
    "plataforma desconocida": (m) => (m.platforms.ios = m.platforms.windows),
    "apk en Windows": (m) => (m.platforms.windows.assets[0].type = "apk"),
    "campo de más": (m) => (m.extra = true),
    "campo de más en un archivo": (m) => (m.platforms.windows.assets[0].url = "https://x"),
    "sin notas": (m) => delete m.notes,
    "versión no SemVer": (m) => (m.version = "1.0"),
  };
  for (const [name, change] of Object.entries(cases)) {
    const m = clone(desktop);
    change(m);
    assert.notDeepEqual(validateManifest(m), [], name);
  }
});

test("Android exige versionCode y minSdk", () => {
  const m = clone(android);
  delete m.platforms.android.versionCode;
  assert.notDeepEqual(validateManifest(m), []);
});

test("rechaza un tag que no corresponde a la app y la versión", () => {
  const m = clone(desktop);
  m.tag = "melomango-v0.13.0";
  assert.match(validateManifest(m).join(), /tag debe ser/);
});

test("el tag con plataforma solo vale si la release trae una sola plataforma", () => {
  const m = clone(desktop);
  m.tag = "melomango-windows-v0.14.0";
  assert.deepEqual(validateManifest(m), []);
  m.platforms.android = clone(android.platforms.android);
  m.platforms.android.assets[0].file = "melomango-0.14.0-android.apk";
  assert.match(validateManifest(m).join(), /tag debe ser/);
});

test("rechaza nombres de archivo fuera de la convención", () => {
  const m = clone(desktop);
  m.platforms.windows.assets[0].file = "Melomango_0.14.0_x64-setup.exe";
  assert.notDeepEqual(validateManifest(m), []);
  m.platforms.windows.assets[0].file = "melomango-0.14.0-windows-arm64.exe";
  assert.match(validateManifest(m).join(), /debe ser melomango-0\.14\.0-windows-x64\.exe/);
});

test("una beta tiene que ir como prerelease", () => {
  const beta = desktopVersion("0.15.0-beta.1");
  assert.match(validateManifest(beta).join(), /prerelease debe ser true/);
  beta.prerelease = true;
  assert.deepEqual(validateManifest(beta), []);
});

test("compareSemver ordena como SemVer", () => {
  const sorted = ["1.0.0", "0.14.0", "1.0.0-beta.2", "1.0.0-alpha", "0.9.10", "1.0.0-beta.10", "0.10.0"].sort(compareSemver);
  assert.deepEqual(sorted, ["0.9.10", "0.10.0", "0.14.0", "1.0.0-alpha", "1.0.0-beta.2", "1.0.0-beta.10", "1.0.0"]);
});

test("cada plataforma toma su última versión estable, ignorando las betas", () => {
  const manifests = [desktopVersion("0.13.0"), desktop, desktopVersion("0.15.0-beta.1", { prerelease: true }), android];
  const { files } = buildCatalog(config, manifests, { now: "2026-11-25T12:00:00Z" });
  const latest = files["melomango/latest.json"];
  assert.equal(latest.platforms.windows.version, "0.14.0");
  assert.equal(latest.platforms.android.version, "0.1.0");
  assert.equal(latest.platforms.android.versionCode, 1);
  assert.equal(files["melomango/tauri.json"].version, "0.14.0");
});

test("las URLs apuntan a las releases del repo apps", () => {
  const { files } = buildCatalog(config, [desktop], { now: "2026-11-25T12:00:00Z" });
  const [exe] = files["melomango/latest.json"].platforms.windows.assets;
  assert.equal(exe.url, "https://github.com/fergaschas/apps/releases/download/melomango-v0.14.0/melomango-0.14.0-windows-x64.exe");
});

test("tauri.json tiene las claves que busca tauri-plugin-updater", () => {
  const { files } = buildCatalog(config, [desktop], { now: "2026-11-25T12:00:00Z" });
  const tauri = files["melomango/tauri.json"];
  assert.deepEqual(Object.keys(tauri.platforms), ["windows-x86_64", "windows-x86_64-nsis", "windows-x86_64-msi"]);
  // La clave genérica usa el instalador NSIS (.exe), como hacía el latest.json de Melomango.
  assert.equal(tauri.platforms["windows-x86_64"].url, tauri.platforms["windows-x86_64-nsis"].url);
  assert.equal(tauri.platforms["windows-x86_64-nsis"].signature, desktop.platforms.windows.assets[0].updater.signature);
  assert.deepEqual(validateSchema("tauri", tauri), []);
});

test("tauri.json con macOS universal y Linux", () => {
  const cfg = clone(config);
  cfg.apps[0].platforms.push("macos", "linux");
  const m = clone(desktop);
  const asset = (platform, arch, type, extra = {}) => ({
    file: `melomango-0.14.0-${platform}-${arch}.${type}`, arch, type, size: 10, sha256: sha("a"), ...extra,
  });
  m.platforms.macos = { minOsVersion: "10.15", assets: [asset("macos", "universal", "dmg"), asset("macos", "universal", "app.tar.gz", { download: false, updater: { signature: "s-mac" } })] };
  m.platforms.linux = { assets: [asset("linux", "x64", "deb", { updater: { signature: "s-deb" } }), asset("linux", "x64", "AppImage", { updater: { signature: "s-appimage" } })] };
  assert.deepEqual(validateManifest(m), []);

  const { platforms } = buildCatalog(cfg, [m], { now: "2026-11-25T12:00:00Z" }).files["melomango/tauri.json"];
  assert.equal(platforms["darwin-aarch64"].signature, "s-mac");
  assert.equal(platforms["darwin-x86_64-app"].signature, "s-mac");
  assert.equal(platforms["linux-x86_64"].signature, "s-appimage", "la genérica de Linux prefiere AppImage");
  assert.equal(platforms["linux-x86_64-deb"].signature, "s-deb");
});

test("tauri.json deja fuera la plataforma de escritorio que va por detrás", () => {
  const cfg = clone(config);
  cfg.apps[0].platforms.push("linux");
  const linux = clone(desktop);
  linux.version = "0.13.0";
  linux.tag = "melomango-linux-v0.13.0";
  linux.platforms = { linux: { assets: [{ file: "melomango-0.13.0-linux-x64.AppImage", arch: "x64", type: "AppImage", size: 10, sha256: sha("b"), updater: { signature: "s" } }] } };
  assert.deepEqual(validateManifest(linux), []);

  const { files, warnings } = buildCatalog(cfg, [desktop, linux], { now: "2026-11-25T12:00:00Z" });
  assert.equal(files["melomango/tauri.json"].version, "0.14.0");
  assert.ok(!("linux-x86_64" in files["melomango/tauri.json"].platforms));
  assert.match(warnings.join(), /linux se queda fuera/);
});

test("ignora las apps y plataformas que no están en catalog.json", () => {
  const otra = clone(android);
  otra.app = "otra";
  otra.tag = "otra-v0.1.0";
  otra.platforms.android.assets[0].file = "otra-0.1.0-android.apk";
  const { files, warnings } = buildCatalog(config, [otra], { now: "2026-11-25T12:00:00Z" });
  assert.ok(!("otra/latest.json" in files));
  assert.match(warnings.join(), /otra no está en catalog\.json/);
});

test("una app sin releases estables sale en apps.json sin plataformas", () => {
  const { files } = buildCatalog(config, [], { now: "2026-11-25T12:00:00Z" });
  assert.deepEqual(files["apps.json"].apps[0].platforms, {});
  assert.ok(!("melomango/tauri.json" in files));
  assert.deepEqual(validateSchema("apps", files["apps.json"]), []);
});
