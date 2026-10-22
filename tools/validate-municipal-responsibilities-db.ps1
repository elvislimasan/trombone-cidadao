$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$postgresBin = 'C:\Program Files\PostgreSQL\17\bin'
$testRoot = Join-Path $projectRoot ('.tmp\municipal-responsibilities-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$clusterPath = Join-Path $testRoot 'data'
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$testPort = $listener.LocalEndpoint.Port
$listener.Stop()
$previousPort = $env:PGPORT
$previousDir = $env:PG_TEST_DATA_DIR
Push-Location -LiteralPath $projectRoot
try {
  & (Join-Path $postgresBin 'initdb.exe') -D $clusterPath -U codex_validation -A trust --no-locale --encoding=UTF8 > (Join-Path $testRoot 'init.log') 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Falha no initdb local.' }
  & (Join-Path $postgresBin 'pg_ctl.exe') -D $clusterPath -l (Join-Path $testRoot 'server.log') -o "-h 127.0.0.1 -p $testPort" -w start
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar o banco local.' }
  try {
    $env:PGPORT = [string]$testPort
    $env:PG_TEST_DATA_DIR = $clusterPath
    node tools/validate-atendimento-flows-db.mjs --responsibilities
    if ($LASTEXITCODE -ne 0) { throw 'Falha nos testes de atendimento por responsabilidades.' }
  } finally {
    & (Join-Path $postgresBin 'pg_ctl.exe') -D $clusterPath -m fast -w stop
  }
} finally {
  $env:PGPORT = $previousPort
  $env:PG_TEST_DATA_DIR = $previousDir
  Pop-Location
}
