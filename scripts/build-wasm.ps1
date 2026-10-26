param(
	[string]$BuildDir = "build-wasm",
	[string]$Generator = "Ninja"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root
$HostPython = (Get-Command python -ErrorAction Stop).Source
$PinnedNodeVersion = (Get-Content -LiteralPath "$Root\.node-version" -Raw).Trim()
$HostNode = "$Root\.tools\node-v$PinnedNodeVersion-win-x64\node.exe"
if (-not (Test-Path -LiteralPath $HostNode)) { $HostNode = (Get-Command node -ErrorAction Stop).Source }

function Import-CMakeTools {
	foreach ($directory in @("$Root\.tools\cmake-4.4.4-windows-x86_64\bin", "$Root\.tools\ninja-1.13.2")) {
		if (Test-Path -LiteralPath $directory) { $env:PATH = "$directory;" + $env:PATH }
	}
	if ((Get-Command cmake -ErrorAction SilentlyContinue) -and (Get-Command ninja -ErrorAction SilentlyContinue)) { return }
	$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
	if (Test-Path -LiteralPath $vswhere) {
		$vsRoot = & $vswhere -latest -products '*' -property installationPath
		if ($vsRoot) {
			$cmakeTools = Join-Path $vsRoot "Common7\IDE\CommonExtensions\Microsoft\CMake"
			foreach ($directory in @((Join-Path $cmakeTools "CMake\bin"), (Join-Path $cmakeTools "Ninja"))) {
				if (Test-Path -LiteralPath $directory) { $env:PATH = "$directory;" + $env:PATH }
			}
		}
	}
	if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) { throw "CMake is required. Install CMake or Visual Studio CMake tools." }
	if ($Generator -eq "Ninja" -and -not (Get-Command ninja -ErrorAction SilentlyContinue)) { throw "Ninja is required. Install Ninja or Visual Studio CMake tools." }
}

function Import-Emsdk {
	if (Get-Command emcmake -ErrorAction SilentlyContinue) { return }
	$candidates = @(
		(Join-Path $Root ".tools\emsdk\emsdk_env.ps1"),
		(Join-Path $env:USERPROFILE "emsdk\emsdk_env.ps1"),
		"C:\emsdk\emsdk_env.ps1",
		"$env:EMSDK\emsdk_env.ps1"
	)
	foreach ($envScript in $candidates) {
		if ($envScript -and (Test-Path $envScript)) {
			Write-Host "Chargement Emscripten: $envScript"
			. $envScript
			return
		}
	}
	Write-Error "emcmake introuvable. Installez Emscripten (https://emscripten.org) puis relancez ce script."
}

function Ensure-Vendor($rel, $url, $ref = $null) {
	$path = Join-Path $Root $rel
	$hasFiles = (Test-Path $path) -and (@(Get-ChildItem $path -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne ".git" }).Count -gt 0)
	if ($hasFiles) { return }
	Write-Host "Clonage de $rel ..."
	if (Test-Path -LiteralPath $path) {
		$resolved = (Resolve-Path -LiteralPath $path).ProviderPath
		if (-not $resolved.StartsWith($Root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Vendor path escapes project." }
		Remove-Item -LiteralPath $resolved -Recurse -Force
	}
	$cloneArgs = @('clone', '--depth', '1')
	if ($ref) { $cloneArgs += @('--branch', $ref) }
	git @cloneArgs $url $path
	if ($LASTEXITCODE -ne 0) { throw "Echec du clone $url" }
}

function Ensure-Protoc {
	$ver = "36.2"
	$protocDir = Join-Path $Root "tools\protoc\bin"
	$protocExe = Join-Path $protocDir "protoc.exe"
	$ok = $false
	if (Test-Path $protocExe) {
		$got = & $protocExe --version 2>$null
		if ("$got" -match '^libprotoc 36\.2$') { $ok = $true }
	}
	if (-not $ok) {
		$url = "https://github.com/protocolbuffers/protobuf/releases/download/v$ver/protoc-$ver-win64.zip"
		$dest = Join-Path $Root "tools\protoc"
		$zip = Join-Path $env:TEMP "protoc-$ver-win64.zip"
		Write-Host "Telechargement de protoc $ver vers tools\protoc (ignore le protoc systeme) ..."
		[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
		New-Item -ItemType Directory -Force -Path $dest | Out-Null
		Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
		Expand-Archive -Path $zip -DestinationPath $dest -Force
		Remove-Item $zip -ErrorAction SilentlyContinue
		if (-not (Test-Path $protocExe)) {
			Write-Error "Echec du telechargement de protoc $ver."
		}
	}
	$env:PATH = "$protocDir;" + (($env:PATH -split ";" | Where-Object { $_ -and ($_ -notmatch "[\\/]protoc[\\/]bin") }) -join ";")
	return $protocExe
}

function Ensure-WasmPython {
	$venv = Join-Path $Root "tools\wasm-python"
	$py = Join-Path $venv "Scripts\python.exe"
	if (-not (Test-Path $py)) {
		Write-Host "Creation de tools\wasm-python (protobuf 7.36.2) ..."
		$base = Get-Command python -ErrorAction SilentlyContinue
		if (-not $base) { Write-Error "Python 3 introuvable (requis pour nanopb)." }
		& $base.Source -m venv $venv
		if ($LASTEXITCODE -ne 0) { throw "Echec de python -m venv" }
	}
	$ok = $false
	try {
		$ver = & $py -c "import google.protobuf; print(google.protobuf.__version__)"
		if ($ver -eq "7.36.2") { $ok = $true }
	} catch {}
	if (-not $ok) {
		Write-Host "Installation de protobuf 7.36.2 dans tools\wasm-python ..."
		& $py -m pip install --quiet --disable-pip-version-check "protobuf==7.36.2"
		if ($LASTEXITCODE -ne 0) { throw "Echec pip install protobuf==7.36.2" }
	}
	return $py
}

Import-Emsdk
$env:EMSDK_NODE = $HostNode
$env:EMSDK_PYTHON = $HostPython
Import-CMakeTools
$ProtocExe = Ensure-Protoc
$WasmPython = Ensure-WasmPython

Ensure-Vendor "third-party\nanopb" "https://github.com/nanopb/nanopb.git" "0.4.9.2"
Ensure-Vendor "third-party\jerasure" "https://github.com/streetpea/jerasure.git"
Ensure-Vendor "third-party\gf-complete" "https://github.com/streetpea/gf-complete.git"

$nanopbProto = Join-Path $Root "third-party\nanopb\generator\proto"
& $ProtocExe "--proto_path=$nanopbProto" "--proto_path=$Root\tools\protoc\include" "--python_out=$nanopbProto" "$nanopbProto\nanopb.proto"
if ($LASTEXITCODE -ne 0) { throw "Failed to regenerate nanopb descriptors with the pinned protoc." }

$GfCpu = Join-Path $Root "third-party\gf-complete\src\gf_cpu.c"
if (Test-Path $GfCpu) {
	$gf = [System.IO.File]::ReadAllText($GfCpu)
	$pat = "int gf_cpu_identify\(void\)(\r?\n\{\r?\n    gf_cpu_identified = 1;)\r?\n    return 0;(\r?\n\})"
	if ($gf -match $pat) {
		Write-Host "Correction de gf_cpu_identify (prototype void vs definition int) ..."
		[System.IO.File]::WriteAllText($GfCpu, [regex]::Replace($gf, $pat, 'void gf_cpu_identify(void)$1$2'))
	}
}

Write-Host "emcc: $((Get-Command emcc).Source)"
Write-Host "protoc: $ProtocExe"
Write-Host "python (nanopb): $WasmPython"
Write-Host "Configuration Emscripten dans $BuildDir ..."
emcmake cmake -S $Root -B (Join-Path $Root $BuildDir) -G $Generator -DCHIAKI_ENABLE_WASM=ON "-DGIT_EXECUTABLE=$((Get-Command git).Source)" "-DCMAKE_MAKE_PROGRAM=$((Get-Command ninja).Source)" -DPYTHON_EXECUTABLE="$WasmPython" -DPython_EXECUTABLE="$WasmPython" -DPython3_EXECUTABLE="$WasmPython" "-DPROTOC=$ProtocExe"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Compilation chiaki-wasm ..."
cmake --build (Join-Path $Root $BuildDir) --target chiaki-wasm
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$Out = Join-Path $Root "$BuildDir\wasm"
Write-Host "OK. Lancer:  node `"$Out\server.mjs`""
Write-Host "Puis ouvrir http://127.0.0.1:8080/"
