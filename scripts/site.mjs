// Genera el HTML de la web a partir del catálogo. La página sale ya renderizada
// (funciona sin JavaScript); site/app.js solo destaca la descarga del sistema del
// visitante y añade los botones de copiar.

const PLATFORM_LABEL = { android: "Android", windows: "Windows", macos: "macOS", linux: "Linux" };
const TYPE_LABEL = {
  apk: "APK",
  exe: "Instalador (.exe)",
  msi: "Instalador MSI (.msi)",
  dmg: "Imagen de disco (.dmg)",
  AppImage: "AppImage",
  deb: "Paquete .deb",
  "app.tar.gz": "Paquete del actualizador",
};
const ARCH_LABEL = { x64: "x64", arm64: "ARM64", universal: "" };
// Qué archivo se ofrece como descarga principal en cada plataforma.
const PREFERRED = { android: ["apk"], windows: ["exe", "msi"], macos: ["dmg"], linux: ["AppImage", "deb"] };

const ANDROID_API = { 21: "5.0", 22: "5.1", 23: "6", 24: "7.0", 25: "7.1", 26: "8.0", 27: "8.1", 28: "9", 29: "10", 30: "11", 31: "12", 32: "12L", 33: "13", 34: "14", 35: "15", 36: "16" };

/** Escapa texto para HTML (contenido y atributos). */
export function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** Markdown mínimo y seguro para las notas: párrafos, listas, **negrita**, `código` y enlaces https. */
export function renderNotes(markdown) {
  const inline = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
  return markdown
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^\s*[-*] /.test(l))) {
        return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*] /, ""))}</li>`).join("")}</ul>`;
      }
      return `<p>${lines.map(inline).join("<br>")}</p>`;
    })
    .join("\n");
}

const sizeFormat = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
export const formatSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${sizeFormat.format(bytes / 1024 / 1024)} MB` : `${sizeFormat.format(Math.max(1, Math.round(bytes / 1024)))} KB`;

const dateFormat = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });
export const formatDate = (iso) => dateFormat.format(new Date(iso));

/** Ruta del QR de un archivo dentro de la web. */
export const qrPath = (asset) => `qr/${asset.file}.svg`;

function requirement(platform, data) {
  if (platform === "android") {
    const version = ANDROID_API[data.minSdk];
    return version ? `Android ${version} o posterior` : `Android con API ${data.minSdk} o posterior`;
  }
  return data.minOsVersion ? `${PLATFORM_LABEL[platform]} ${data.minOsVersion} o posterior` : "";
}

const downloadable = (data) => data.assets.filter((a) => a.download !== false);

function mainAsset(platform, data) {
  const assets = downloadable(data);
  for (const type of PREFERRED[platform]) {
    const found = assets.find((a) => a.type === type);
    if (found) return found;
  }
  return assets[0];
}

function assetLabel(asset) {
  return [TYPE_LABEL[asset.type], ARCH_LABEL[asset.arch]].filter(Boolean).join(" · ");
}

function renderPrimary(app, platform, data) {
  const asset = mainAsset(platform, data);
  if (!asset) return "";
  return `
      <div class="primary" data-os="${platform}" hidden>
        <a class="button" href="${esc(asset.url)}">
          <span>Descargar para ${PLATFORM_LABEL[platform]}</span>
          <small>${esc(app.name)} ${esc(data.version)} · ${formatSize(asset.size)}</small>
        </a>
        <a class="help-link" href="ayuda.html#${platform}">¿Cómo se instala en ${PLATFORM_LABEL[platform]}?</a>
      </div>`;
}

function renderAsset(asset, platform) {
  return `
            <li class="file">
              <a href="${esc(asset.url)}">${esc(assetLabel(asset))}</a>
              <span class="meta">${formatSize(asset.size)}</span>
              <details class="sha">
                <summary>SHA-256</summary>
                <code>${esc(asset.sha256)}</code>
                <button type="button" class="copy" data-copy="${esc(asset.sha256)}" hidden>Copiar</button>
                <a class="help-link" href="ayuda.html#sha256">Cómo comprobarlo</a>
              </details>
              ${
                platform === "android"
                  ? `<figure class="qr">
                <img src="${esc(qrPath(asset))}" width="148" height="148" alt="Código QR del enlace de descarga del APK">
                <figcaption>Escanéalo con el móvil para descargarlo allí.</figcaption>
              </figure>`
                  : ""
              }
            </li>`;
}

function renderPlatform(platform, data) {
  if (!data) {
    return `
        <section class="platform soon" data-os="${platform}">
          <h3>${PLATFORM_LABEL[platform]}</h3>
          <p class="meta">Próximamente</p>
        </section>`;
  }
  const req = requirement(platform, data);
  return `
        <section class="platform" data-os="${platform}">
          <h3>${PLATFORM_LABEL[platform]} <span class="version">${esc(data.version)}</span></h3>
          <p class="meta"><time datetime="${esc(data.date)}">${formatDate(data.date)}</time>${req ? ` · ${esc(req)}` : ""}</p>
          <ul class="files">${downloadable(data).map((a) => renderAsset(a, platform)).join("")}
          </ul>
          <a class="help-link" href="ayuda.html#${platform}">Cómo instalarlo</a>
          <details class="notes">
            <summary>Novedades de la ${esc(data.version)}</summary>
            ${renderNotes(data.notes)}
          </details>
        </section>`;
}

function renderApp(app, wanted) {
  const order = [...wanted, ...Object.keys(app.platforms).filter((p) => !wanted.includes(p))];
  const available = order.filter((p) => app.platforms[p]);
  return `
    <article class="app" id="${esc(app.id)}">
      <header class="app-head">
        <img class="icon" src="${esc(app.icon)}" width="64" height="64" alt="">
        <div>
          <h2>${esc(app.name)}</h2>
          <p>${esc(app.description)}</p>
          ${app.homepage ? `<a class="homepage" href="${esc(app.homepage)}" rel="noopener">Página del proyecto</a>` : ""}
        </div>
      </header>
      ${available.map((p) => renderPrimary(app, p, app.platforms[p])).join("")}
      <p class="primary-none" hidden>${available.length ? `${esc(app.name)} no está disponible para tu sistema. Estas son todas las descargas:` : ""}</p>
      <div class="platforms">${order.map((p) => renderPlatform(p, app.platforms[p])).join("")}
      </div>
    </article>`;
}

/**
 * Página principal. `apps` es apps.json y `config` es catalog.json (de él sale el
 * orden de las plataformas y las que aún no tienen versión, que salen como "Próximamente").
 */
export function renderPage(apps, config) {
  const wanted = Object.fromEntries(config.apps.map((a) => [a.id, a.platforms]));
  const repoUrl = `https://github.com/${config.repo}`;
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'">
  <meta name="color-scheme" content="light dark">
  <title>Mis apps</title>
  <meta name="description" content="Descargas de mis apps para Android y escritorio.">
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="style.css">
  <script src="app.js" defer></script>
</head>
<body>
  <main>
    <header class="site-head">
      <h1>Mis apps</h1>
      <p>Descargas para Android y escritorio. Las versiones se publican en <a href="${repoUrl}/releases">GitHub Releases</a> y esta página se actualiza sola.</p>
    </header>
${apps.apps.map((app) => renderApp(app, wanted[app.id] ?? [])).join("\n")}
  </main>
  <footer>
    <p>El código de estas apps está en repositorios privados; aquí solo se publican las versiones. Comprueba el SHA-256 si descargas desde otro sitio.</p>
    <p><a href="ayuda.html">Cómo instalar</a> · <a href="${repoUrl}">Repositorio</a> · <a href="apps.json">apps.json</a> · Actualizada el <time datetime="${esc(apps.generated)}">${formatDate(apps.generated)}</time></p>
  </footer>
</body>
</html>
`;
}
