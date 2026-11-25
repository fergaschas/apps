import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildCatalog } from "../scripts/catalog.mjs";
import { esc, formatSize, renderNotes, renderPage } from "../scripts/site.mjs";

const readJson = (file) => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), "utf8"));
const desktop = readJson("../examples/releases/melomango-v0.14.0/manifest.json");
const android = readJson("../examples/releases/melomango-android-v0.1.0/manifest.json");
const config = readJson("../catalog.json");
const NOW = { now: "2026-11-25T12:00:00Z" };

test("la página lista la app con sus descargas, el SHA-256 y el QR del APK", () => {
  const apps = buildCatalog(config, [desktop, android], NOW).files["apps.json"];
  const html = renderPage(apps, config);
  assert.match(html, /<h2>Melomango<\/h2>/);
  assert.match(html, /href="https:\/\/github\.com\/fergaschas\/apps\/releases\/download\/melomango-v0\.14\.0\/melomango-0\.14\.0-windows-x64\.exe"/);
  assert.match(html, /Descargar para Windows/);
  assert.match(html, /Descargar para Android/);
  assert.ok(html.includes(desktop.platforms.windows.assets[0].sha256));
  assert.match(html, /src="qr\/melomango-0\.1\.0-android\.apk\.svg"/);
  assert.match(html, /Android 8\.0 o posterior/);
  assert.match(html, /Windows 10 o posterior/);
  assert.match(html, /<strong>Emisoras:<\/strong>/);
});

test("una plataforma sin versión sale como Próximamente", () => {
  const apps = buildCatalog(config, [desktop], NOW).files["apps.json"];
  const html = renderPage(apps, config);
  assert.match(html, /<h3>Android<\/h3>\s*<p class="meta">Próximamente<\/p>/);
  assert.doesNotMatch(html, /Descargar para Android/);
});

test("la descarga principal de Windows es el .exe", () => {
  const apps = buildCatalog(config, [desktop], NOW).files["apps.json"];
  const primary = renderPage(apps, config).match(/<div class="primary" data-os="windows"[\s\S]*?<\/div>/)[0];
  assert.match(primary, /windows-x64\.exe"/);
  assert.match(primary, /3,9 MB/);
});

test("las notas no pueden inyectar HTML", () => {
  const html = renderNotes('Hola <script>alert(1)</script> [x](javascript:alert(1)) [ok](https://a.b/c) **bien** `x<y`');
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /<a href="https:\/\/a\.b\/c" rel="noopener">ok<\/a>/);
  assert.match(html, /<strong>bien<\/strong>/);
  assert.match(html, /<code>x&lt;y<\/code>/);
});

test("las notas convierten listas y párrafos", () => {
  assert.equal(renderNotes("Uno:\n\n- a\n- **b**"), "<p>Uno:</p>\n<ul><li>a</li><li><strong>b</strong></li></ul>");
});

test("esc escapa comillas para los atributos", () => {
  assert.equal(esc(`"'<>&`), "&quot;&#39;&lt;&gt;&amp;");
});

test("formatSize", () => {
  assert.equal(formatSize(4125492), "3,9 MB");
  assert.equal(formatSize(2048), "2 KB");
});
