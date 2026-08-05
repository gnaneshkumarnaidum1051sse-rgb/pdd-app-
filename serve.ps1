param([int]$Port = 8080)
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving http://localhost:$Port/"
while ($listener.IsListening) {
  $context = $listener.GetContext(); $path = $context.Request.Url.AbsolutePath.TrimStart('/')
  if ([string]::IsNullOrWhiteSpace($path)) { $path = 'index.html' }
  $file = Join-Path $PSScriptRoot $path
  if (Test-Path -LiteralPath $file -PathType Leaf) {
    $bytes = [IO.File]::ReadAllBytes($file)
    $context.Response.ContentType = switch ([IO.Path]::GetExtension($file)) { '.html' {'text/html; charset=utf-8'} '.css' {'text/css; charset=utf-8'} '.js' {'text/javascript; charset=utf-8'} '.svg' {'image/svg+xml'} '.jpeg' {'image/jpeg'} '.jpg' {'image/jpeg'} default {'application/octet-stream'} }
    $context.Response.StatusCode = 200; $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else { $context.Response.StatusCode = 404 }
  $context.Response.Close()
}
