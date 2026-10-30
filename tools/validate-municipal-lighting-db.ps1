$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$postgresBin = 'C:\Program Files\PostgreSQL\17\bin'
$testRoot = Join-Path $projectRoot ('.tmp\municipal-lighting-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$clusterPath = Join-Path $testRoot 'data'
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$testPort = $listener.LocalEndpoint.Port
$listener.Stop()
Push-Location -LiteralPath $projectRoot
try {
  & (Join-Path $postgresBin 'initdb.exe') -D $clusterPath -U codex_validation -A trust --no-locale --encoding=UTF8 > (Join-Path $testRoot 'init.log') 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Falha no initdb local.' }
  & (Join-Path $postgresBin 'pg_ctl.exe') -D $clusterPath -l (Join-Path $testRoot 'server.log') -o "-h 127.0.0.1 -p $testPort" -w start
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar o banco local.' }
  try {
    # O Windows PowerShell trata NOTICE do psql como erro de PowerShell.
    # O código de saída do cliente determina se a suíte passou.
    $ErrorActionPreference = 'Continue'
    & (Join-Path $postgresBin 'psql.exe') -X -h 127.0.0.1 -p $testPort -U codex_validation -d postgres -v ON_ERROR_STOP=1 -f supabase/tests/municipal_administrator_lighting.sql > (Join-Path $testRoot 'tests.log') 2>&1
    $testExitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    Get-Content -LiteralPath (Join-Path $testRoot 'tests.log') -Tail 25
    if ($testExitCode -ne 0) { throw "Falha nos testes de iluminação municipal. Consulte $testRoot\tests.log" }
  } finally {
    & (Join-Path $postgresBin 'pg_ctl.exe') -D $clusterPath -m fast -w stop
  }
} finally {
  Pop-Location
}
