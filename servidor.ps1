# Plyscope - servidor local minimo.
# O navegador exige http:// (e nao file://) para carregar o motor WebAssembly
# dentro de um Web Worker. Nada sai desta maquina.
#
# Os cabecalhos COOP + COEP abaixo ligam o "cross-origin isolation", que libera
# o SharedArrayBuffer e, com ele, o Stockfish multi-thread. Eles nao atrapalham
# as buscas no Chess.com e no Lichess: o COEP so barra requisicoes "no-cors", e
# o fetch do app roda em modo "cors" (as duas APIs mandam Access-Control-Allow-Origin).
#
# Manda tambem o Content-Security-Policy lido do _headers, o mesmo arquivo que o
# src/build.py gera com os hashes dos <script> inline. Local e publicado rodam
# sob a mesma politica de proposito: um erro de CSP tem que aparecer aqui, na
# maquina de quem programa, e nao so depois do deploy.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$mime = @{
  ".html"="text/html; charset=utf-8"; ".js"="text/javascript; charset=utf-8";
  ".css"="text/css; charset=utf-8";   ".wasm"="application/wasm";
  ".json"="application/json";         ".svg"="image/svg+xml";
  ".png"="image/png";                 ".ico"="image/x-icon";
  ".pgn"="text/plain; charset=utf-8";  ".txt"="text/plain; charset=utf-8";
  ".map"="application/json"
}

# Uma copia so da politica, no _headers, para o servidor local e a hospedagem
# nao poderem divergir. Repetir a string aqui dentro seria pedir para ficar
# velha. -like nao diferencia maiusculas de minusculas no PowerShell.
$csp = $null
$arqHeaders = Join-Path $root "_headers"
if (Test-Path -LiteralPath $arqHeaders -PathType Leaf) {
  foreach ($linha in (Get-Content -LiteralPath $arqHeaders -Encoding UTF8)) {
    $t = $linha.Trim()
    if ($t -like "Content-Security-Policy:*") {
      $csp = $t.Substring($t.IndexOf(":") + 1).Trim()
      break
    }
  }
}

$listener = $null
$port = 0
foreach ($p in 8123..8140) {
  try {
    $try = New-Object System.Net.HttpListener
    $try.Prefixes.Add("http://localhost:$p/")
    $try.Start()
    $listener = $try
    $port = $p
    break
  } catch {
    if ($try) { try { $try.Close() } catch { } }
  }
}
if ($port -eq 0) {
  Write-Host "Nao consegui abrir uma porta local (8123-8140)." -ForegroundColor Red
  Read-Host "Enter para sair"
  exit 1
}

$url = "http://localhost:$port/index.html"
Write-Host ""
Write-Host "  Plyscope rodando em $url" -ForegroundColor Green
Write-Host "  Deixe esta janela aberta enquanto usar o app."
Write-Host "  Para encerrar: feche a janela ou pressione Ctrl+C."
if (-not $csp) {
  Write-Host ""
  Write-Host "  AVISO: nao achei o Content-Security-Policy no _headers." -ForegroundColor Yellow
  Write-Host "  Rode 'python src\build.py'; sem isso o app roda aqui com regras"
  Write-Host "  mais frouxas do que no site publicado."
}
Write-Host ""
Start-Process $url

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $ctx.Response.Headers.Add("Cross-Origin-Opener-Policy", "same-origin")
    $ctx.Response.Headers.Add("Cross-Origin-Embedder-Policy", "require-corp")
    if ($csp) { $ctx.Response.Headers.Add("Content-Security-Policy", $csp) }
    $rel =[System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart("/"))
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }
    $path = Join-Path $root $rel
    $full = [System.IO.Path]::GetFullPath($path)
    if (-not $full.StartsWith([System.IO.Path]::GetFullPath($root))) {
      $ctx.Response.StatusCode = 403; $ctx.Response.Close(); continue
    }
    if (Test-Path -LiteralPath $full -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $ctx.Response.ContentType = $(if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" })
      $ctx.Response.Headers.Add("Cache-Control", "no-cache")
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - nao encontrado: $rel")
      $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $ctx.Response.Close()
  } catch {
    # cliente desconectou; segue o jogo
  }
}
