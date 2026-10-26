param([switch]$NoBuild, [ValidateRange(1, 65535)][int]$Port)

$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Push-Location $projectDir
try {
    if ($PSBoundParameters.ContainsKey('Port')) { $env:CHIAKI_WASM_PORT = [string]$Port }
    $cargoCommand = Get-Command cargo -ErrorAction SilentlyContinue
    if (-not $cargoCommand -and (Test-Path -LiteralPath "$projectDir\.tools\cargo\bin\cargo.exe")) {
        $env:CARGO_HOME = "$projectDir\.tools\cargo"
        $env:RUSTUP_HOME = "$projectDir\.tools\rustup"
        $cargoPath = "$projectDir\.tools\cargo\bin\cargo.exe"
    } elseif ($cargoCommand) {
        $cargoPath = $cargoCommand.Source
    } elseif (-not $NoBuild) {
        throw "Rust is required. Install it from https://rust-lang.org/tools/install/ and restart the terminal."
    }
    if (-not $NoBuild) {
        & $cargoPath build --release --locked --manifest-path wasm/relay-rust/Cargo.toml
        if ($LASTEXITCODE -ne 0) { throw "Rust relay build failed." }
    }
    $env:CHIAKI_RELAY_BACKEND = "rust"
    if (-not $env:CHIAKI_RELAY_BIN) {
        $env:CHIAKI_RELAY_BIN = "$projectDir\wasm\relay-rust\target\release\chiaki-relay.exe"
    }
    if (-not (Test-Path -LiteralPath $env:CHIAKI_RELAY_BIN)) { throw "Rust relay executable missing. Run without -NoBuild." }
    $wasmRoot = if ($env:CHIAKI_WASM_ROOT) { $env:CHIAKI_WASM_ROOT } else { "$projectDir\build-wasm\wasm" }
    if (-not (Test-Path -LiteralPath "$wasmRoot\chiaki.wasm")) {
        Write-Warning "The streaming core has not been built. The UI will open, but Remote Play needs scripts/build-wasm.ps1 first."
    }
    node wasm/proxy/server.mjs
    if ($LASTEXITCODE -ne 0) { throw "Web server stopped with an error." }
} finally {
    Pop-Location
}
