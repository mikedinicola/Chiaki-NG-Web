$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$nodeVersion = (Get-Content -LiteralPath (Join-Path $projectDir '.node-version') -Raw).Trim()
if ($nodeVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid pinned Node version.' }
$toolsDir = Join-Path $projectDir '.tools'
New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
$archiveName = "node-v$nodeVersion-win-x64.zip"
$archivePath = Join-Path $toolsDir $archiveName
$baseUrl = "https://nodejs.org/dist/v$nodeVersion"
Invoke-WebRequest "$baseUrl/$archiveName" -OutFile $archivePath
$checksums = (Invoke-WebRequest "$baseUrl/SHASUMS256.txt").Content
$entry = $checksums -split "`n" | Where-Object { $_.Trim().EndsWith("  $archiveName") }
$expectedHash = ($entry -split '\s+')[0]
if (-not $expectedHash -or (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -ne $expectedHash) {
    throw 'Node download checksum mismatch.'
}
Expand-Archive -LiteralPath $archivePath -DestinationPath $toolsDir -Force
$runtimeDir = Join-Path $toolsDir "node-v$nodeVersion-win-x64"
$npmVersion = (Get-Content -LiteralPath (Join-Path $projectDir '.npm-version') -Raw).Trim()
if ($npmVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid pinned npm version.' }
$env:npm_config_cache = Join-Path $toolsDir 'npm-cache'
& "$runtimeDir\node.exe" "$runtimeDir\node_modules\npm\bin\npm-cli.js" install --global --prefix $runtimeDir "npm@$npmVersion" --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw 'npm update failed.' }
& "$runtimeDir\node.exe" --version
& "$runtimeDir\node.exe" "$runtimeDir\node_modules\npm\bin\npm-cli.js" --version
Write-Host 'Verified official Node archive. run-web.ps1 will select this runtime.'
