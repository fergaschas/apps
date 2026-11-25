# Ejemplos

- `releases/<tag>/manifest.json`: los manifests tal como los subiría la CI a cada release.
- `site/`: lo que genera `npm run examples` a partir de ellos. No se edita a mano: `npm test` falla si no está al día.

**`melomango-v0.14.0`** es real. Tiene los tamaños, el SHA-256, las firmas de Tauri y las notas de la release v0.14.0 de [fergaschas/melomango](https://github.com/fergaschas/melomango/releases/tag/v0.14.0). Los archivos llevan ya la convención de nombres nueva. El `site/melomango/tauri.json` que se genera tiene las mismas claves y firmas que el `latest.json` real de esa release.

**`melomango-android-v0.1.0`** es ilustrativo: Melomango para Android aún no tiene ninguna release. La versión, `versionCode` y `minSdk` son los reales del proyecto, pero `size` y `sha256` son de relleno.
