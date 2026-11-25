# apps

Descargas de mis apps personales para Android y escritorio.

Este repositorio **no contiene el código de las apps**: ese vive en repositorios privados. Aquí solo están la web, el catálogo y, en las [Releases](https://github.com/fergaschas/apps/releases), los instaladores.

- Web (GitHub Pages): https://fergaschas.github.io/apps
- Descargas: [Releases](https://github.com/fergaschas/apps/releases)

## Cómo funciona

```
Repos privados (código) ──tag──► GitHub Actions (compila y firma)
                                        │ token de grano fino (solo este repo)
                                        ▼
Repo PÚBLICO "apps" (solo web y catálogo)
  Releases: <app>-v<versión> → APK, .msi/.exe, .dmg, .AppImage/.deb + manifest.json
        │ evento release: published
        ▼
  Workflow de este repo: regenera apps.json y <app>/latest.json y despliega Pages
        ▼
GitHub Pages: https://fergaschas.github.io/apps
```

Las CI privadas solo crean releases. El catálogo (`apps.json`, `<app>/latest.json`) lo regenera únicamente este repo, así no hay conflictos si dos apps publican a la vez.

## Convenciones

Un mismo repo aloja las releases de todas las apps, así que tags, títulos y archivos llevan siempre el nombre de la app.

| Qué | Formato | Ejemplo |
|---|---|---|
| Tag | `<app>-v<versión>` | `melomango-v0.14.0` |
| Tag de una plataforma que se versiona aparte | `<app>-<plataforma>-v<versión>` | `melomango-android-v0.1.0` |
| Título de la release | `<App> <versión>` | `Melomango 0.14.0` |
| Archivo | `<app>-<versión>-<plataforma>-<arch>.<ext>` | `melomango-0.14.0-windows-x64.exe` |
| Archivo de Android | `<app>-<versión>-android.apk` | `melomango-0.1.0-android.apk` |

Plataformas: `android`, `windows`, `macos`, `linux`. Arquitecturas: `x64`, `arm64`, `universal`.

- `<app>` en minúsculas y con guiones (`fuera-de-mi-finca`). La versión sigue [SemVer](https://semver.org/lang/es/).
- Cada plataforma puede llevar su propia versión: el catálogo guarda la última de cada una.
- Cada release incluye además un `manifest.json` con los metadatos de esa versión.
- Las betas se publican como **pre-release** y con sufijo SemVer (`melomango-v1.5.0-beta.1`).

El formato de `manifest.json`, `apps.json`, `<app>/latest.json` y `<app>/tauri.json` está en [docs/catalogo.md](docs/catalogo.md), con sus esquemas en [`schemas/`](schemas) y ejemplos reales en [`examples/`](examples). Para validarlo: `npm install && npm test`.

## Descargas

La URL de cada archivo es estable y no requiere iniciar sesión en GitHub:

```
https://github.com/fergaschas/apps/releases/download/<tag>/<archivo>
```

> **No uses `releases/latest`.** Como el repo mezcla varias apps, "la última release" puede ser de otra app. Para saber la versión más reciente de una app, consulta `https://fergaschas.github.io/apps/<app>/latest.json`.

Límite de GitHub: 2 GB por archivo.

## Publicar una app desde su CI

Cada app publica con la action [`publish`](publish/action.yml) y el secret `APPS_REPO_TOKEN` ([docs/token-ci.md](docs/token-ci.md)). Recibe los archivos ya compilados, los renombra según la convención, calcula tamaño y SHA-256, mete las firmas `.sig` de Tauri, genera y valida el `manifest.json` y crea la release como borrador para publicarla al final:

```yaml
- uses: fergaschas/apps/publish@main
  with:
    token: ${{ secrets.APPS_REPO_TOKEN }}
    app: melomango                 # id de catalog.json
    version: 0.15.0
    notes-file: notas.md
    min-os: windows=10
    assets: |                      # "<plataforma> <arch> <ruta>", uno por línea
      windows x64 src-tauri/target/release/bundle/nsis/Melomango_0.15.0_x64-setup.exe
      windows x64 src-tauri/target/release/bundle/msi/Melomango_0.15.0_x64_es-ES.msi
```

Para Android hacen falta además `tag: <app>-android-v<versión>`, `version-code` y `min-sdk`. Ejemplos completos: `publicar.yml` en `melomango` y `melomango-mobile`. Para probar sin publicar: `dry-run: true`, o en local `node scripts/publish-release.mjs … --dry-run`.

## La web

El workflow [`pages.yml`](.github/workflows/pages.yml) se lanza al hacer push a `main`, a mano y al publicar, editar o borrar una release. Para las releases pasa por [`release.yml`](.github/workflows/release.yml), que lo lanza sobre `main`: así siempre corre la versión actual, sea cual sea el commit del tag. Descarga los `manifest.json` de las releases ([`fetch-manifests.mjs`](scripts/fetch-manifests.mjs)) y genera el catálogo y la web ([`build-site.mjs`](scripts/build-site.mjs)): `index.html` ya renderizado, los JSON del catálogo, los QR de los APK y los esquemas. Después la despliega en Pages.

Si una release tiene un manifest inválido, el workflow avisa y la deja fuera, sin tumbar la web.

Para verla en local con los ejemplos:

```sh
npm install
npm run site                  # genera _site/ a partir de examples/releases
npx serve _site               # o cualquier servidor estático
```

## Privacidad

Todo lo que se publica aquí (notas de versión, nombres de archivo, manifests) es público. Nada de datos privados.
