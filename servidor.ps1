# Servidor local para probar la app en este computador.
# Usa solo PowerShell, que ya viene con Windows: no hay que instalar nada.
# Se inicia con doble clic en "iniciar-app.bat". Para detenerlo, cierra la ventana.

$puerto = 8099
$raiz = [System.IO.Path]::GetFullPath($PSScriptRoot)
if (-not $raiz.EndsWith([System.IO.Path]::DirectorySeparatorChar)) { $raiz += [System.IO.Path]::DirectorySeparatorChar }
$direccion = "http://localhost:$puerto/"

$tipos = @{
  '.html' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.png' = 'image/png'
  '.jpg' = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.svg' = 'image/svg+xml'
  '.ico' = 'image/x-icon'
  '.md' = 'text/plain; charset=utf-8'
  '.txt' = 'text/plain; charset=utf-8'
}

$servidor = New-Object System.Net.HttpListener
$servidor.Prefixes.Add($direccion)
try {
  $servidor.Start()
} catch {
  Write-Host ""
  Write-Host "No se pudo iniciar el servidor en el puerto $puerto." -ForegroundColor Red
  Write-Host "Lo mas probable es que ya este abierto en otra ventana negra. Cierrala e intenta de nuevo."
  Write-Host ""
  Write-Host "Detalle: $($_.Exception.Message)"
  exit 1
}

Write-Host ""
Write-Host "  La app esta corriendo en  $direccion" -ForegroundColor Green
Write-Host ""
Write-Host "  Deja esta ventana abierta mientras uses la app."
Write-Host "  Para apagarla, cierra esta ventana."
Write-Host ""

try { Start-Process $direccion } catch { }

while ($servidor.IsListening) {
  try {
    $ctx = $servidor.GetContext()
  } catch { break }

  $resp = $ctx.Response
  try {
    $ruta = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($ruta.EndsWith('/')) { $ruta += 'index.html' }
    $relativa = $ruta.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
    $archivo = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($raiz, $relativa))

    # No servir nada fuera de la carpeta de la app.
    if (-not $archivo.StartsWith($raiz, [System.StringComparison]::OrdinalIgnoreCase) -or -not [System.IO.File]::Exists($archivo)) {
      $resp.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes('No encontrado')
      $resp.ContentType = 'text/plain; charset=utf-8'
    } else {
      $bytes = [System.IO.File]::ReadAllBytes($archivo)
      $ext = [System.IO.Path]::GetExtension($archivo).ToLower()
      if ($tipos.ContainsKey($ext)) { $resp.ContentType = $tipos[$ext] } else { $resp.ContentType = 'application/octet-stream' }
      # Para que el navegador siempre tome la ultima version de lo que se edita.
      $resp.Headers.Add('Cache-Control', 'no-store')
    }
    Write-Host ("  {0}  {1}  {2}" -f (Get-Date -Format 'HH:mm:ss'), $resp.StatusCode, $ruta) -ForegroundColor DarkGray
    $resp.ContentLength64 = $bytes.Length
    $resp.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    # Si el navegador corta una descarga a medias, se ignora y se sigue atendiendo.
  } finally {
    try { $resp.OutputStream.Close() } catch { }
  }
}
