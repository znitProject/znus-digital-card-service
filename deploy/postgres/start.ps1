$ErrorActionPreference = 'Stop'

$composeFile = Join-Path $PSScriptRoot 'docker-compose.yml'
$envFile = Join-Path $PSScriptRoot '.env'

if (-not (Test-Path -LiteralPath $envFile)) {
  throw "Missing $envFile. Copy the prepared .env file here, set POSTGRES_PASSWORD, then run this script again."
}

docker compose --env-file $envFile -f $composeFile config | Out-Null
docker compose --env-file $envFile -f $composeFile up -d db
docker compose --env-file $envFile -f $composeFile ps db
