param([int]$Port = 8093)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Push-Location $projectDir
try {
    $package = Get-Content .tools/last-browser-package.json -Raw | ConvertFrom-Json
    $data = Join-Path $projectDir ('.tools/package-test-data-' + [Guid]::NewGuid().ToString('N'))
    $smokeArgs = '--smoke-test --port ' + $Port + ' --data-dir "' + $data + '"'
    $portable = Start-Process -FilePath (Join-Path $package.payload 'Chiaki-NG Web.exe') -ArgumentList $smokeArgs -WindowStyle Hidden -Wait -PassThru
    if ($portable.ExitCode -ne 0) { throw "Portable smoke failed; inspect $data" }
    Get-Content -LiteralPath (Join-Path $data 'smoke-result.txt')
    $installed = Join-Path $projectDir ('.tools/install-test-' + [Guid]::NewGuid().ToString('N'))
    $installArgs = '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /NOICONS /DIR="' + $installed + '"'
    $setup = Start-Process -FilePath $package.installer -ArgumentList $installArgs -WindowStyle Hidden -Wait -PassThru
    if ($setup.ExitCode -ne 0) { throw 'Installer test failed.' }
    $installedLauncher = Join-Path $installed 'Chiaki-NG Web.exe'
    if (-not (Test-Path -LiteralPath $installedLauncher)) { throw 'Installed launcher missing.' }
    $installedSmoke = Start-Process -FilePath $installedLauncher -ArgumentList $smokeArgs -WindowStyle Hidden -Wait -PassThru
    if ($installedSmoke.ExitCode -ne 0) { throw 'Installed smoke test failed.' }
    $resolved = (Resolve-Path -LiteralPath $installed).ProviderPath
    if (-not $resolved.StartsWith((Join-Path $projectDir '.tools') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Uninstall path escaped the test workspace.' }
    $uninstall = Start-Process -FilePath (Join-Path $resolved 'unins000.exe') -ArgumentList '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART' -WindowStyle Hidden -Wait -PassThru
    if ($uninstall.ExitCode -ne 0) { throw 'Uninstall test failed.' }
    if (-not (Test-Path -LiteralPath (Join-Path $data 'smoke-result.txt'))) { throw 'Uninstall removed separate data.' }
    if (Test-Path -LiteralPath $installedLauncher) { throw 'Uninstall left the application executable behind.' }
    Write-Output 'PASS: portable startup, installer, installed startup, isolation headers, offline guide, uninstall and data preservation.'
} finally { Pop-Location }
