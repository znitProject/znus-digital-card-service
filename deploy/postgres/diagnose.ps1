$ErrorActionPreference = 'Stop'

$composeFile = Join-Path $PSScriptRoot 'docker-compose.yml'
$envFile = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path -LiteralPath $envFile)) { throw "Missing $envFile" }

Write-Host '== container status ==' -ForegroundColor Cyan
docker compose --env-file $envFile -f $composeFile ps db

$containerId = (docker compose --env-file $envFile -f $composeFile ps -q db).Trim()
if (-not $containerId) { throw 'The db container is not running.' }

Write-Host '== configured database identity (password hidden) ==' -ForegroundColor Cyan
docker inspect $containerId --format '{{range .Config.Env}}{{println .}}{{end}}' |
  Select-String -Pattern '^POSTGRES_(DB|USER)='

Write-Host '== local SQL check inside the container ==' -ForegroundColor Cyan
docker exec $containerId sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select current_user, current_database(), inet_server_addr(), inet_server_port();"'

Write-Host '== password authentication check (password hidden) ==' -ForegroundColor Cyan
$passwordCheck = docker exec $containerId sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select 1;"' 2>$null
if ($LASTEXITCODE -ne 0 -or $passwordCheck.Trim() -ne '1') {
  throw 'POSTGRES_PASSWORD does not match the password stored for the configured database role. An existing Docker volume may have an older password.'
}
Write-Host 'Password authentication check passed.' -ForegroundColor Green

Write-Host '== host port check ==' -ForegroundColor Cyan
Test-NetConnection -ComputerName '100.102.230.73' -Port 5432 |
  Select-Object ComputerName, RemotePort, TcpTestSucceeded

Write-Host 'If the local SQL check works but the development PC still gets 28P01, the existing volume has a different password or port 5432 points to another PostgreSQL instance.' -ForegroundColor Yellow
