import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assetType, buildRelease, parseAssetSpec } from "../scripts/publish-release.mjs";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "publish-test-"));
}
function file(dir, name, content) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const DATE = "2026-11-25T12:00:00.123Z";

test("parseAssetSpec admite rutas con espacios y con letra de unidad", () => {
  assert.deepEqual(parseAssetSpec("windows x64 C:\\a b\\Melomango_1.0.0_x64-setup.exe"), {
    platform: "windows", arch: "x64", path: "C:\\a b\\Melomango_1.0.0_x64-setup.exe",
  });
  assert.throws(() => parseAssetSpec("windows x64"));
});

test("assetType sale de la extensión", () => {
  assert.equal(assetType("a/Melomango.app.tar.gz"), "app.tar.gz");
  assert.equal(assetType("x.AppImage"), "AppImage");
  assert.equal(assetType("x.appimage"), "AppImage");
  assert.equal(assetType("app-release.apk"), "apk");
  assert.throws(() => assetType("x.zip"));
});

test("escritorio: renombra, calcula SHA-256 y recoge las firmas de Tauri", () => {
  const dir = tempDir();
  const exe = file(dir, "Melomango_1.0.0_x64-setup.exe", "exe");
  file(dir, "Melomango_1.0.0_x64-setup.exe.sig", "firma-exe\n");
  const msi = file(dir, "Melomango_1.0.0_x64_es-ES.msi", "msi!");
  file(dir, "Melomango_1.0.0_x64_es-ES.msi.sig", "firma-msi");

  const { manifest, files } = buildRelease({
    app: "melomango", version: "1.0.0", notes: "Novedades\r\n\r\n- algo\n", date: DATE,
    assets: [{ platform: "windows", arch: "x64", path: exe }, { platform: "windows", arch: "x64", path: msi }],
    minOs: { windows: "10" },
  });

  assert.equal(manifest.tag, "melomango-v1.0.0");
  assert.equal(manifest.prerelease, false);
  assert.equal(manifest.date, "2026-11-25T12:00:00Z");
  assert.equal(manifest.notes, "Novedades\n\n- algo");
  assert.equal(manifest.platforms.windows.minOsVersion, "10");
  assert.deepEqual(manifest.platforms.windows.assets[0], {
    file: "melomango-1.0.0-windows-x64.exe", arch: "x64", type: "exe", size: 3, sha256: sha("exe"),
    updater: { signature: "firma-exe" },
  });
  assert.equal(manifest.platforms.windows.assets[1].updater.signature, "firma-msi");
  assert.deepEqual(files.map((f) => f.name), ["melomango-1.0.0-windows-x64.exe", "melomango-1.0.0-windows-x64.msi"]);
});

test("Android: versionCode, minSdk y tag con plataforma", () => {
  const dir = tempDir();
  const apk = file(dir, "app-release.apk", "apk");
  const { manifest } = buildRelease({
    app: "melomango", version: "0.2.0", tag: "melomango-android-v0.2.0", notes: "Hola", date: DATE,
    assets: [{ platform: "android", arch: "universal", path: apk }], versionCode: "2", minSdk: "26",
  });
  assert.deepEqual(manifest.platforms.android, {
    versionCode: 2, minSdk: 26,
    assets: [{ file: "melomango-0.2.0-android.apk", arch: "universal", type: "apk", size: 3, sha256: sha("apk") }],
  });
});

test("una versión con sufijo sale como pre-release", () => {
  const dir = tempDir();
  const exe = file(dir, "a.exe", "x");
  const { manifest } = buildRelease({
    app: "melomango", version: "1.1.0-beta.1", notes: "Beta", date: DATE,
    assets: [{ platform: "windows", arch: "x64", path: exe }],
  });
  assert.equal(manifest.prerelease, true);
  assert.equal(manifest.tag, "melomango-v1.1.0-beta.1");
});

test("macOS: el .app.tar.gz no se ofrece para descargar", () => {
  const dir = tempDir();
  const tgz = file(dir, "Melomango.app.tar.gz", "tgz");
  file(dir, "Melomango.app.tar.gz.sig", "s");
  const dmg = file(dir, "Melomango.dmg", "dmg");
  const { manifest } = buildRelease({
    app: "melomango", version: "1.0.0", notes: "x", date: DATE,
    assets: [{ platform: "macos", arch: "universal", path: dmg }, { platform: "macos", arch: "universal", path: tgz }],
  });
  const [d, t] = manifest.platforms.macos.assets;
  assert.equal(d.file, "melomango-1.0.0-macos-universal.dmg");
  assert.equal(d.download, undefined);
  assert.equal(t.download, false);
  assert.equal(t.updater.signature, "s");
});

test("rechaza lo que no cumple el formato del catálogo", () => {
  const dir = tempDir();
  const apk = file(dir, "a.apk", "x");
  const exe = file(dir, "a.exe", "x");
  const base = { app: "melomango", version: "1.0.0", notes: "x", date: DATE };
  assert.throws(() => buildRelease({ ...base, assets: [{ platform: "android", arch: "universal", path: apk }] }), /versionCode|minSdk|no es válido/);
  assert.throws(() => buildRelease({ ...base, assets: [{ platform: "windows", arch: "x86", path: exe }] }), /no es válido/);
  assert.throws(() => buildRelease({ ...base, assets: [{ platform: "ios", arch: "arm64", path: exe }] }), /no es válido/);
  assert.throws(() => buildRelease({ ...base, notes: "  ", assets: [{ platform: "windows", arch: "x64", path: exe }] }), /notas/);
  assert.throws(() => buildRelease({ ...base, assets: [{ platform: "windows", arch: "x64", path: path.join(dir, "no.exe") }] }), /No existe/);
  assert.throws(() => buildRelease({ ...base, assets: [{ platform: "windows", arch: "x64", path: exe }], minOs: { linux: "1" } }), /no hay archivos de linux/);
});
