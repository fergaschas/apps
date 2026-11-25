# Formato del catálogo

Un único formato para la CI de las apps, la web y los actualizadores. Los esquemas (JSON Schema 2020-12) están en [`schemas/`](../schemas) y se publicarán en `https://fergaschas.github.io/apps/schemas/`.

| Archivo | Quién lo escribe | Quién lo lee | Esquema |
|---|---|---|---|
| `manifest.json` (uno por release) | La CI de cada app, junto a los instaladores | El workflow del catálogo | [`manifest.schema.json`](../schemas/manifest.schema.json) |
| `catalog.json` (en este repo) | Yo, a mano | El workflow del catálogo | [`catalog.schema.json`](../schemas/catalog.schema.json) |
| `apps.json` | El workflow del catálogo | La web | [`apps.schema.json`](../schemas/apps.schema.json) |
| `<app>/latest.json` | El workflow del catálogo | La web y el actualizador de Android | [`latest.schema.json`](../schemas/latest.schema.json) |
| `<app>/tauri.json` | El workflow del catálogo | El actualizador de Tauri (escritorio) | [`tauri.schema.json`](../schemas/tauri.schema.json) |

Solo la CI escribe releases y solo el workflow del catálogo escribe los JSON de la web. Así no hay conflictos si dos apps publican a la vez.

Las claves van en inglés. Los textos para el usuario (`name`, `description`, `notes`) van en español. **Todo es público.**

Ejemplos reales de Melomango: [`examples/`](../examples).

## Versiones por plataforma

Cada plataforma de una app puede llevar su propia versión. Por ejemplo, Melomango escritorio va por la 0.14.0 y Android por la 0.1.0.

- Una release trae una o varias plataformas, todas con la versión de la release.
- Tag `<app>-v<versión>`. Si la plataforma se versiona aparte (la release trae solo esa plataforma), el tag es `<app>-<plataforma>-v<versión>`: `melomango-v0.14.0` y `melomango-android-v0.1.0`.
- `latest.json` guarda, **para cada plataforma**, la última release estable que la incluye.
- Las escritorio (Windows, macOS y Linux) se publican juntas en la misma release, porque Tauri solo admite una versión por `tauri.json`.

## manifest.json

```jsonc
{
  "schemaVersion": 1,
  "app": "melomango",                // id de catalog.json
  "version": "0.14.0",               // SemVer; las betas con sufijo: 0.15.0-beta.1
  "tag": "melomango-v0.14.0",
  "prerelease": false,               // true en las betas: no cuentan como última versión
  "date": "2026-11-25T11:01:10Z",
  "notes": "Novedades de…",          // Markdown, público
  "platforms": {
    "android": {
      "versionCode": 1,              // lo que compara el actualizador de Android
      "minSdk": 26,                  // 26 = Android 8.0
      "assets": [ /* solo .apk */ ]
    },
    "windows": {
      "minOsVersion": "10",          // opcional en escritorio
      "assets": [
        {
          "file": "melomango-0.14.0-windows-x64.exe",
          "arch": "x64",             // x64 | arm64 | universal (Android: universal)
          "type": "exe",             // ver la tabla de tipos
          "size": 4125492,           // bytes
          "sha256": "d29a12…",
          "updater": { "signature": "dW50cn…" }   // contenido del .sig de Tauri
        }
      ]
    }
  }
}
```

### Tipos de archivo

| Plataforma | `type` | Para qué | Clave de Tauri |
|---|---|---|---|
| `android` | `apk` | Instalar | — |
| `windows` | `exe` | Instalador NSIS | `windows-<arch>-nsis` (y la genérica) |
| `windows` | `msi` | Instalador MSI | `windows-<arch>-msi` |
| `macos` | `dmg` | Instalar | — |
| `macos` | `app.tar.gz` | Solo el actualizador (`"download": false`) | `darwin-<arch>-app` (y la genérica) |
| `linux` | `AppImage` | Instalar | `linux-<arch>-appimage` (y la genérica) |
| `linux` | `deb` | Instalar | `linux-<arch>-deb` |

- `arch` de Tauri: `x64` → `x86_64`, `arm64` → `aarch64`, `universal` → los dos.
- La clave genérica `<os>-<arch>` usa, por orden de preferencia: `exe`, `app.tar.gz`, `AppImage`, `msi`, `deb`.
- Un solo archivo por plataforma, arquitectura y tipo. De Melomango se publica el MSI en `es-ES` y no el de `en-US`.
- Los `.sig` no se suben como archivos: su contenido va en `updater.signature`.

### Reglas que comprueba el validador además del esquema

- `tag` es `<app>-v<versión>`, o `<app>-<plataforma>-v<versión>` si la release trae una sola plataforma.
- Cada `file` es exactamente `<app>-<versión>-<plataforma>-<arch>.<type>`. En Android, `<app>-<versión>-android.apk`.
- Una versión con sufijo (`-beta.1`) tiene que ir con `prerelease: true`.
- Sin archivos repetidos, sin `updater` en `.apk` ni `.dmg`, y un archivo con `"download": false` tiene que llevar `updater`.

## catalog.json

Qué apps salen en la web y sus datos fijos. Las versiones no van aquí: salen de las releases. Las releases de apps o plataformas que no estén aquí se ignoran (por ejemplo, `prueba-v0.0.1`).

```json
{
  "schemaVersion": 1,
  "repo": "fergaschas/apps",
  "siteUrl": "https://fergaschas.github.io/apps",
  "apps": [
    {
      "id": "melomango",
      "name": "Melomango",
      "description": "Reproductor de música…",
      "icon": "icons/melomango.svg",
      "homepage": "https://github.com/fergaschas/melomango",
      "platforms": ["android", "windows"]
    }
  ]
}
```

## apps.json y &lt;app&gt;/latest.json

`latest.json` tiene, para cada plataforma con una release estable, los campos de esa plataforma en el manifest. Añade `version`, `tag`, `date` y `notes`, y una `url` en cada archivo:

```jsonc
{
  "schemaVersion": 1,
  "app": "melomango",
  "generated": "2026-11-25T12:00:00Z",
  "platforms": {
    "android": {
      "version": "0.1.0", "tag": "melomango-android-v0.1.0", "date": "…",
      "versionCode": 1, "minSdk": 26, "notes": "…",
      "assets": [{ "file": "melomango-0.1.0-android.apk", "…": "…",
                   "url": "https://github.com/fergaschas/apps/releases/download/melomango-android-v0.1.0/melomango-0.1.0-android.apk" }]
    },
    "windows": { "version": "0.14.0", "…": "…" }
  }
}
```

`apps.json` lleva una entrada por app de `catalog.json`, en el mismo orden. Cada entrada tiene sus datos fijos, el mismo `platforms` que su `latest.json` (la web no necesita más peticiones) y las rutas `latest` y `tauri`. Una app sin releases estables sale con `"platforms": {}`.

### Actualizador de Android

Lee `https://fergaschas.github.io/apps/<app>/latest.json`. Compara `platforms.android.versionCode` con el instalado, descarga `platforms.android.assets[0].url` (sigue la redirección) y comprueba `sha256` antes de abrir el instalador.

## &lt;app&gt;/tauri.json

Es el formato estático que exige `tauri-plugin-updater` v2. Se genera solo, a partir de las firmas de los manifests, con la versión de escritorio más alta. Si alguna plataforma de escritorio va por detrás, se queda fuera y el generador avisa. En la app, el endpoint de `tauri.conf.json` pasa a ser:

```
https://fergaschas.github.io/apps/<app>/tauri.json
```

## Herramientas

```sh
npm install
npm test            # valida los esquemas, las reglas, los ejemplos y que examples/site esté al día
npm run examples    # regenera examples/site a partir de examples/releases
npm run catalog -- --manifests <carpeta> --out <carpeta>   # lo que usará el workflow de Pages
```

`build-catalog.mjs` falla sin escribir nada si algún manifest no es válido. La CI de cada app puede usar `validateManifest` de [`scripts/catalog.mjs`](../scripts/catalog.mjs) antes de publicar.
