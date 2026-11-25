# Comprueba que el token APPS_REPO_TOKEN puede publicar releases en el repo apps
# y nada más. Pide el token sin mostrarlo, no lo guarda y no lo imprime.
#
#   powershell -ExecutionPolicy Bypass -File scripts\check-apps-token.ps1
#
# Ejecútalo en tu propia terminal: no lo pegues en ningún chat ni en ningún log.

param(
    [string]$Owner = "fergaschas",
    [string]$AppsRepo = "apps",
    # Un repo privado al que el token NO debe tener acceso.
    [string]$PrivateRepo = "melomango-mobile",
    # Un repo al que el token NO debe poder escribir.
    [string]$OtherRepo = "melomango"
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$secure = Read-Host -AsSecureString "Pega el token (no se mostrará)"
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
if (-not $token) { Write-Host "No has pegado nada."; exit 2 }

$headers = @{
    Authorization          = "Bearer $token"
    Accept                 = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
    "User-Agent"           = "apps-token-check"
}

function Invoke-GitHub([string]$Method, [string]$Path, $Body) {
    $params = @{ Method = $Method; Uri = "https://api.github.com$Path"; Headers = $headers; UseBasicParsing = $true }
    if ($Body) { $params.Body = ($Body | ConvertTo-Json); $params.ContentType = "application/json" }
    try {
        $res = Invoke-WebRequest @params
        $data = $null
        if ($res.Content) { $data = $res.Content | ConvertFrom-Json }
        return @{ Status = [int]$res.StatusCode; Data = $data; Headers = $res.Headers }
    } catch {
        $status = 0
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        return @{ Status = $status; Data = $null; Headers = @{} }
    }
}

$results = New-Object System.Collections.ArrayList
function Test-Check([string]$Name, [bool]$Ok, [string]$Detail) {
    [void]$results.Add([pscustomobject]@{ Resultado = $(if ($Ok) { "OK" } else { "FALLO" }); Prueba = $Name; Detalle = $Detail })
}

# 1. Puede leer el repo apps.
$r = Invoke-GitHub GET "/repos/$Owner/$AppsRepo"
Test-Check "Lee $AppsRepo" ($r.Status -eq 200) "HTTP $($r.Status)"

# 2. Caducidad (GitHub la indica en una cabecera en los tokens de grano fino).
$expiry = $r.Headers["github-authentication-token-expiration"]
Test-Check "Tiene fecha de caducidad" ([bool]$expiry) $(if ($expiry) { "Caduca: $expiry" } else { "Sin caducidad" })

# 3. Puede crear y borrar una release en apps (como borrador: no publica nada ni lanza workflows).
$tag = "token-check-" + (Get-Date -Format "yyyyMMddHHmmss")
$created = Invoke-GitHub POST "/repos/$Owner/$AppsRepo/releases" @{ tag_name = $tag; name = "Prueba del token"; draft = $true; target_commitish = "main"; body = "Borrador temporal de check-apps-token.ps1" }
Test-Check "Crea un borrador de release en $AppsRepo" ($created.Status -eq 201) "HTTP $($created.Status)"
if ($created.Status -eq 201) {
    $deleted = Invoke-GitHub DELETE "/repos/$Owner/$AppsRepo/releases/$($created.Data.id)"
    Test-Check "Borra el borrador" ($deleted.Status -eq 204) "HTTP $($deleted.Status)"
}

# 4. NO puede leer un repo privado que no es apps.
$r = Invoke-GitHub GET "/repos/$Owner/$PrivateRepo"
Test-Check "No ve el repo privado $PrivateRepo" ($r.Status -eq 404) "HTTP $($r.Status) (se espera 404)"

# 5. NO puede crear releases en otro repo.
$r = Invoke-GitHub POST "/repos/$Owner/$OtherRepo/releases" @{ tag_name = $tag; draft = $true }
$ok = $r.Status -eq 403 -or $r.Status -eq 404
Test-Check "No crea releases en $OtherRepo" $ok "HTTP $($r.Status) (se espera 403 o 404)"
if ($r.Status -eq 201) { [void](Invoke-GitHub DELETE "/repos/$Owner/$OtherRepo/releases/$($r.Data.id)") }

# 6. Solo tiene acceso a apps entre los repos privados.
$r = Invoke-GitHub GET "/user/repos?per_page=100&visibility=private"
$names = @()
if ($r.Data) { $names = @($r.Data | ForEach-Object { $_.name }) }
Test-Check "No tiene acceso a ningún repo privado" ($r.Status -ne 200 -or $names.Count -eq 0) $(if ($names.Count) { "Ve: $($names -join ', ')" } else { "Ninguno" })

$token = $null
$headers = $null

$results | Format-Table -AutoSize -Wrap
$failed = @($results | Where-Object { $_.Resultado -eq "FALLO" }).Count
if ($failed) { Write-Host "$failed comprobaciones fallidas. Revisa los permisos del token." -ForegroundColor Red; exit 1 }
Write-Host "El token puede publicar en $AppsRepo y nada más." -ForegroundColor Green
