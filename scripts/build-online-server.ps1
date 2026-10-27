param([string]$Version = '1.10.4')
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Push-Location $projectDir
try {
    if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid version.' }
    $stage = Join-Path $projectDir ('.tools/online-bundle-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    $files = @('.dockerignore', 'COPYING', 'LICENSE', 'docs/ONLINE_PLAY.md', 'wasm/www/online-protocol.js', 'wasm/www/pc-controls.js')
    $files += @(git ls-files wasm/online)
    foreach ($file in $files) {
        if ($file -match '(^|/)(node_modules|secrets)(/|$)|(^|/)\.env($|\.)') { throw 'Private/dependency path in online bundle.' }
        $target = Join-Path $stage $file
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        Copy-Item -LiteralPath $file -Destination $target
    }
    Copy-Item -LiteralPath docs/ONLINE_PLAY.md -Destination (Join-Path $stage 'START-HERE.md')
    $output = Join-Path $projectDir 'dist-browser'
    New-Item -ItemType Directory -Path $output -Force | Out-Null
    $archive = Join-Path $output "Chiaki-Online-Server-$Version.zip"
    Compress-Archive -Path "$stage/*" -DestinationPath $archive -Force
    # Compress-Archive excludes dotfiles on some platforms; include the context allowlist explicitly.
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::Open($archive, [IO.Compression.ZipArchiveMode]::Update)
    try {
        if (-not $zip.GetEntry('.dockerignore')) { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $stage '.dockerignore'), '.dockerignore') | Out-Null }
    } finally { $zip.Dispose() }
    $digest = Get-FileHash -LiteralPath $archive -Algorithm SHA256
    ($digest.Hash.ToLowerInvariant() + '  ' + (Split-Path -Leaf $archive)) | Add-Content -LiteralPath "$output/SHA256SUMS.txt" -Encoding ascii
    Write-Host "Self-hosted service ZIP: $archive"
} finally { Pop-Location }
