$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$postgresBin = 'C:\Program Files\PostgreSQL\17\bin'
$testRoot = Join-Path $projectRoot ('.tmp\arborization-db-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$clusterPath = Join-Path $testRoot 'data'
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$testPort = $listener.LocalEndpoint.Port
$listener.Stop()
Push-Location -LiteralPath $projectRoot
try {
  & (Join-Path $postgresBin 'initdb.exe') -D $clusterPath -U postgres -A trust --no-locale --encoding=UTF8 > (Join-Path $testRoot 'init.log') 2>&1
  if ($LASTEXITCODE -ne 0) { throw "initdb falhou. Consulte $testRoot\init.log" }
  & (Join-Path $postgresBin 'pg_ctl.exe') -D $clusterPath -l (Join-Path $testRoot 'server.log') -o "-h 127.0.0.1 -p $testPort" -w start
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível iniciar o PostgreSQL local.' }
  try {
    $ErrorActionPreference = 'Continue'
    & (Join-Path $postgresBin 'psql.exe') -X -h 127.0.0.1 -p $testPort -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'set client_min_messages=warning;' -f 'supabase/tests/arborization.sql' > (Join-Path $testRoot 'result.log') 2>&1
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath (Join-Path $testRoot 'result.log') -Tail 35; throw 'A verificação SQL falhou.' }
    Get-Content -LiteralPath (Join-Path $testRoot 'result.log') -Tail 8
    Write-Output "Resultado completo: $testRoot\result.log"
  } finally {
    & (Join-Path $postgresBin 'pg_ctl.exe') -D $clusterPath -m fast -w stop
  }
} finally { Pop-Location }
