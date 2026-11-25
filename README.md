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
| Tag | `<app>-v<versión>` | `melomango-v1.4.0` |
| Título de la release | `<App> <versión>` | `Melomango 1.4.0` |
| Archivo | `<app>-<versión>-<plataforma>.<ext>` | `melomango-1.4.0-android.apk` |

Plataformas: `android`, `windows-x64`, `macos-arm64`, `macos-x64`, `linux-x64`.

- `<app>` en minúsculas y con guiones (`fuera-de-mi-finca`). La versión sigue [SemVer](https://semver.org/lang/es/).
- Cada release incluye además un `manifest.json` con los metadatos de esa versión.
- Las betas se publican como **pre-release** y con sufijo SemVer (`melomango-v1.5.0-beta.1`).

## Descargas

La URL de cada archivo es estable y no requiere iniciar sesión en GitHub:

```
https://github.com/fergaschas/apps/releases/download/<tag>/<archivo>
```

> **No uses `releases/latest`.** Como el repo mezcla varias apps, "la última release" puede ser de otra app. Para saber la versión más reciente de una app, consulta `https://fergaschas.github.io/apps/<app>/latest.json`.

Límite de GitHub: 2 GB por archivo.

## Privacidad

Todo lo que se publica aquí (notas de versión, nombres de archivo, manifests) es público. Nada de datos privados.
