# Token de la CI: APPS_REPO_TOKEN

La CI de cada app (repos privados y `melomango`) publica sus releases en este repo con un *fine-grained personal access token*. Ese token solo tiene acceso al repo `apps`.

Hace falta un token propio, y no el `GITHUB_TOKEN` de Actions, por dos motivos:

- El `GITHUB_TOKEN` de un repo no puede escribir en otro.
- Las releases creadas con el `GITHUB_TOKEN` no lanzan workflows. Con este token sí, así que [`release.yml`](../.github/workflows/release.yml) regenera la web solo.

## Crearlo

1. Abre [Fine-grained tokens → Generate new token](https://github.com/settings/personal-access-tokens/new?name=APPS_REPO_TOKEN&description=CI%20de%20mis%20apps%3A%20publicar%20releases%20en%20fergaschas%2Fapps&target_name=fergaschas&expires_in=366&contents=write). El enlace rellena casi todo; comprueba cada campo:
   - **Token name:** `APPS_REPO_TOKEN`
   - **Resource owner:** `fergaschas`
   - **Expiration:** 366 días (el máximo)
   - **Repository access:** *Only select repositories* → **solo `apps`**. Esto hay que elegirlo a mano.
   - **Repository permissions:** **Contents: Read and write**. Se añade solo *Metadata: Read-only*, que es obligatorio. **Nada más.**
2. *Generate token* y copia el valor. GitHub no vuelve a mostrarlo.
3. Comprueba que hace lo que debe y nada más (ver abajo).
4. Guárdalo como secret en cada repo que publique (ver abajo).
5. Pon un recordatorio unas dos semanas antes de que caduque.

Con *Contents: Read and write* el token también podría hacer push a `main`. La protección de la rama impide los force-push y que se borre, pero no un push normal. Es el mínimo que permite crear releases. Si algún día hace falta más aislamiento, la alternativa es una GitHub App propia con tokens de corta duración.

## Comprobarlo

En tu terminal, no en un chat ni en un log:

```powershell
cd C:\Code\apps
powershell -ExecutionPolicy Bypass -File scripts\check-apps-token.ps1
```

[`check-apps-token.ps1`](../scripts/check-apps-token.ps1) pide el token sin mostrarlo, no lo guarda y comprueba esto:

| Prueba | Se espera |
|---|---|
| Lee `apps` | 200 |
| Tiene fecha de caducidad | Sí |
| Crea y borra un **borrador** de release en `apps` (no publica nada ni lanza workflows) | 201 y 204 |
| Ve el repo privado `melomango-mobile` | No (404) |
| Crea releases en `melomango` | No (403 o 404) |
| Tiene acceso a algún repo privado | Ninguno |

## Guardarlo en los repos que publican

Como secret `APPS_REPO_TOKEN` en cada repo cuya CI publica en `apps`. Desde tu terminal (pide el valor sin mostrarlo):

```powershell
gh secret set APPS_REPO_TOKEN --repo fergaschas/melomango
gh secret set APPS_REPO_TOKEN --repo fergaschas/melomango-mobile
```

O en la web: *Settings → Secrets and variables → Actions → New repository secret*.

Repos que lo tienen:

| Repo | Desde |
|---|---|
| `melomango` | — |
| `melomango-mobile` | — |

En los repos públicos (`melomango`), los secrets no llegan a los workflows de pull requests desde forks. Aun así, el workflow de publicación solo debe correr con tags `v*` (KAN-200).

## Rotarlo

Cuando vaya a caducar, o si se ha filtrado:

1. Crea un token nuevo con la misma configuración (arriba).
2. Compruébalo con `check-apps-token.ps1`.
3. Sustituye el secret en **todos** los repos de la tabla (`gh secret set` lo sobrescribe).
4. Borra el token viejo en [Fine-grained tokens](https://github.com/settings/personal-access-tokens).
5. Actualiza el recordatorio de la caducidad.

Si se ha filtrado, empieza por el paso 4: borrarlo lo invalida al momento, y las publicaciones pueden esperar al token nuevo.
