param(
    [string]$Version = '1.10.3',
    [string]$CompilerPath,
    [switch]$AllowDirty
)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Push-Location $projectDir
try {
    if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Version must be numeric major.minor.patch.' }
    $dirty = @(git status --porcelain --untracked-files=normal --ignore-submodules=dirty)
    if ($dirty.Count -and -not $AllowDirty) { throw 'Commit source changes before packaging a release. Use -AllowDirty for local smoke tests only.' }
    $nodeVersion = (Get-Content .node-version -Raw).Trim()
    $nodeRoot = Join-Path $projectDir ".tools/node-v$nodeVersion-win-x64"
    if (-not (Test-Path -LiteralPath "$nodeRoot/node.exe")) { throw 'Run scripts/install-node.ps1 first.' }
    if ((& "$nodeRoot/node.exe" -p 'process.versions.node') -ne $nodeVersion) { throw 'Node pin mismatch.' }
    foreach ($name in @('chiaki.js', 'chiaki.wasm')) {
        if (-not (Test-Path -LiteralPath "build-wasm/wasm/$name")) { throw 'Build WASM with scripts/build-wasm.ps1 first.' }
    }
    $cargo = Get-Command cargo -ErrorAction SilentlyContinue
    if (-not $cargo) {
        $env:CARGO_HOME = Join-Path $projectDir '.tools/cargo'
        $env:RUSTUP_HOME = Join-Path $projectDir '.tools/rustup'
        $cargoPath = Join-Path $env:CARGO_HOME 'bin/cargo.exe'
    } else { $cargoPath = $cargo.Source }
    $previousRustflags = $env:RUSTFLAGS
    $previousEncodedRustflags = $env:CARGO_ENCODED_RUSTFLAGS
    try {
        # Encoded arguments preserve spaces in checkout paths.
        $env:CARGO_ENCODED_RUSTFLAGS = @('-C', 'target-feature=+crt-static', "--remap-path-prefix=$projectDir=.", "--remap-path-prefix=$($projectDir.Replace('\','/'))=.") -join [char]31
        & $cargoPath build --release --locked --target x86_64-pc-windows-msvc --target-dir .tools/relay-windows-static --manifest-path wasm/relay-rust/Cargo.toml
        if ($LASTEXITCODE -ne 0) { throw 'Static Rust relay build failed.' }
    } finally {
        $env:RUSTFLAGS = $previousRustflags
        $env:CARGO_ENCODED_RUSTFLAGS = $previousEncodedRustflags
    }
    $stage = Join-Path $projectDir ('.tools/browser-package-' + [Guid]::NewGuid().ToString('N'))
    $payload = Join-Path $stage 'payload'
    foreach ($dir in @('runtime','core','proxy','www','documentation','LICENSES')) { New-Item -ItemType Directory -Path "$payload/$dir" -Force | Out-Null }
    Copy-Item -LiteralPath "$nodeRoot/node.exe" -Destination "$payload/runtime/node.exe"
    Copy-Item -LiteralPath '.tools/relay-windows-static/x86_64-pc-windows-msvc/release/chiaki-relay.exe' -Destination "$payload/runtime/chiaki-relay.exe"
    foreach ($name in @('chiaki.js','chiaki.wasm')) { Copy-Item -LiteralPath "build-wasm/wasm/$name" -Destination "$payload/core/$name" }
    foreach ($name in @('server.mjs','env.mjs','store.mjs','share.mjs','rust-relay.mjs','updater.mjs')) { Copy-Item -LiteralPath "wasm/proxy/$name" -Destination "$payload/proxy/$name" }
    # Only tracked/staged public UI source is allowed into the distribution.
    foreach ($file in @(git ls-files wasm/www)) {
        if ($file -like 'wasm/www/downloads/*') { continue }
        $relative = $file.Substring('wasm/www/'.Length)
        $destination = Join-Path "$payload/www" $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Copy-Item -LiteralPath $file -Destination $destination
    }
    if (-not (Test-Path -LiteralPath "$payload/www/first-run.html")) { throw 'Stage/commit first-run.html before packaging.' }
    foreach ($file in @('GETTING_STARTED.md','USER_GUIDE.md','BROWSER_SETUP.md','SECURITY_AUDIT.md','PRIVACY_REVIEW.md','WINDOWS_INSTALLER.md')) {
        if (Test-Path -LiteralPath "docs/$file") { Copy-Item -LiteralPath "docs/$file" -Destination "$payload/documentation/$file" }
    }
    New-Item -ItemType Directory -Path "$payload/documentation/images" -Force | Out-Null
    foreach ($file in @(git ls-files docs/images)) { Copy-Item -LiteralPath $file -Destination "$payload/documentation/images" }
    Copy-Item -LiteralPath 'COPYING' -Destination "$payload/LICENSES/COPYING"
    Copy-Item -LiteralPath 'LICENSE' -Destination "$payload/LICENSES/PROJECT-LICENSE"
    Copy-Item -LiteralPath "$nodeRoot/LICENSE" -Destination "$payload/LICENSES/NODE-LICENSE"
    Copy-Item -LiteralPath 'gui/chiaking.ico' -Destination "$payload/app.ico"
    foreach ($entry in @(
        @('MBEDTLS','build-wasm/_deps/mbedtls-src/LICENSE'),
        @('OPUS','build-wasm/_deps/opus-src/COPYING'),
        @('NANOPB','third-party/nanopb/LICENSE.txt'),
        @('JERASURE','third-party/jerasure/COPYING'),
        @('GF-COMPLETE','third-party/gf-complete/COPYING')
    )) {
        if (Test-Path -LiteralPath $entry[1]) { Copy-Item -LiteralPath $entry[1] -Destination (Join-Path "$payload/LICENSES" $entry[0]) }
    }
    $lock = Get-Content wasm/relay-rust/Cargo.lock -Raw
    foreach ($block in ($lock -split '\[\[package\]\]')) {
        if ($block -notmatch 'name = "([^"]+)"') { continue }; $name = $Matches[1]
        if ($block -notmatch 'version = "([^"]+)"') { continue }; $crateVersion = $Matches[1]
        $cargoHome = if ($env:CARGO_HOME) { $env:CARGO_HOME } else { Join-Path $env:USERPROFILE '.cargo' }
        foreach ($registry in @(Get-ChildItem -LiteralPath "$cargoHome/registry/src" -Directory -ErrorAction SilentlyContinue)) {
            $crate = Join-Path $registry.FullName "$name-$crateVersion"
            if (-not (Test-Path -LiteralPath $crate)) { continue }
            foreach ($license in @(Get-ChildItem -LiteralPath $crate -File | Where-Object { $_.Name -match '^(LICENSE|COPYING)' })) {
                Copy-Item -LiteralPath $license.FullName -Destination (Join-Path "$payload/LICENSES" ("$name-$crateVersion-" + $license.Name))
            }
        }
    }
    $csc = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    & $csc /nologo /target:winexe /platform:x64 "/out:$payload\Chiaki-NG Web.exe" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "/win32icon:$projectDir\gui\chiaking.ico" "$projectDir\wasm\desktop-browser\Launcher.cs"
    if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed.' }
    $sourceCommit = (git rev-parse HEAD).Trim()
    [ordered]@{ version=$Version; sourceCommit=$sourceCommit; sourceDirty=($dirty.Count -gt 0); node=$nodeVersion; browserOrigin='http://127.0.0.1:8090'; architecture='windows-x64' } | ConvertTo-Json | Set-Content -LiteralPath "$payload/BUILD-INFO.json" -Encoding utf8
    "Corresponding source: https://github.com/SKIZZOO/Chiaki-NG-Web/tree/$sourceCommit`nSource license: see LICENSES/COPYING. This community preview is not code-signed." | Set-Content -LiteralPath "$payload/SOURCE.txt" -Encoding utf8
    if (-not $CompilerPath) { $CompilerPath = Join-Path $projectDir '.tools/inno/ISCC.exe' }
    if (-not (Test-Path -LiteralPath $CompilerPath)) { throw 'Install official Inno Setup 7 and pass -CompilerPath to ISCC.exe.' }
    $output = Join-Path $projectDir 'dist-browser'
    New-Item -ItemType Directory -Path $output -Force | Out-Null
    & $CompilerPath "/DPackageDir=$payload" "/DOutputDir=$output" "/DAppVersion=$Version" wasm/desktop-browser/installer.iss
    if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed.' }
    $portable = Join-Path $output "Chiaki-NG-Web-Portable-$Version-x64.zip"
    Compress-Archive -Path "$payload/*" -DestinationPath $portable -Force
    $sumLines = foreach ($path in @((Join-Path $output "Chiaki-NG-Web-Setup-$Version-x64.exe"), $portable)) {
        $hash = Get-FileHash -LiteralPath $path -Algorithm SHA256
        $hash.Hash.ToLowerInvariant() + '  ' + (Split-Path -Leaf $path)
    }
    $sumLines | Set-Content -LiteralPath "$output/SHA256SUMS.txt" -Encoding ascii
    [ordered]@{ payload=$payload; installer=(Join-Path $output "Chiaki-NG-Web-Setup-$Version-x64.exe"); portable=$portable; sourceCommit=$sourceCommit } | ConvertTo-Json | Set-Content -LiteralPath '.tools/last-browser-package.json' -Encoding utf8
    Write-Host "Installer and portable ZIP: $output"
} finally { Pop-Location }
