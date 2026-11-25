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

## Privacidad

Todo lo que se publica aquí (notas de versión, nombres de archivo, manifests) es público. Nada de datos privados.
