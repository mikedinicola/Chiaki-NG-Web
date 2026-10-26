# Dependency and toolchain audit — 2026-10-26

## Windows browser installer

The new native Windows tray launcher bundles the pinned Node **26.12.1** runtime,
the Rust relay built with a static C runtime, and the compiled WASM core. It does
not use Electron. The optional Electron exception below remains in force.
The installer binds the server to loopback, stores user data separately, and
stops an owned server through a parent input pipe. Source-only allowlists exclude
developer environment/database files from the package. See
[installer design and verification](WINDOWS_INSTALLER.md).

This is a point-in-time audit of the browser edition and optional Electron
packaging tools, not a claim that the whole upstream project is vulnerability
free. Native Qt, Android and Switch dependency trees were not comprehensively
audited. A clean package-manager report does not cover every bundled native
library or application logic vulnerability.

## Verified versions and changes

| Component | Result |
|---|---|
| Browser server Node | Updated project pin and portable runtime to **26.12.1**, latest stable verified from Node.js; official archive SHA-256 checked |
| npm | Workspace runtime updated to **12.2.1** |
| Electron | Updated 37.x dependency to exact **45.0.0**, latest stable checked; embedded Node exception below |
| electron-builder | Updated to exact **26.18.0**, lockfile refreshed |
| npm advisory scan | **7 high-severity findings before, 0 known vulnerabilities after** |
| Rust compiler | **1.99.1**, rustup 1.29.2: official update check reports current |
| Rust dependencies | Lockfile refreshed; **0 vulnerabilities and 0 warnings** in cargo-audit 0.22.2, RustSec database commit `21d909e4c8bd4e14c7aea58bf980c881a0053ab1` |
| Mbed TLS | Updated browser cryptography pin from **2.28.0 to maintained 3.6.7 LTS**, commit `068ff080b369adfac81509f9b57b2afabaf82dc5` |
| Opus | Updated **1.5.2 → 1.6.1**, commit `22244de5a79bd1d6d623c32e72bf1954b56235be` |
| nanopb | Replaced a development-commit pin with stable security-fix release **0.4.9.2**, commit `160d4f09e5fabb2b66aa2dea32d4f38ace2c4b3f` |
| Python protobuf | Updated **4.25.3 → 7.36.2**; protoc **3.9.1 → 36.2**; build scripts enforce matching current pins |
| Python build environment | pip updated to **26.2.2**; pip-audit **2.10.1** reports **no known vulnerabilities** |
| Emscripten | **6.0.13**, verified as current official release |
| CMake / Ninja | Workspace tools updated to **4.4.4 / 1.13.2**, official release digests checked |
| Host Python | **3.13.15**, retained supported patched interpreter; Emscripten is directed to the host Python and pinned Node rather than its older bundled interpreters |
| Browser CI | Node pin updated; maintained checkout/setup-node v6 actions pinned to verified full commits; npm and cargo advisory checks added |

The original npm findings involved brace-expansion, Electron, extract-zip,
fast-uri, http-cache-semantics, js-yaml and undici. Audit JSON and downloaded
SDKs stay in ignored `.tools`; no tokens, console keys, private account database
or `.env` are published.

Mbed TLS 3 needs different ECDH context ownership. The integration now owns
public EC/MPI objects instead of accessing the library's private ECDH structure;
the obsolete GCM initialization call was removed in favor of the existing
one-shot API. The regression fixture covers registration/encryption vectors,
two-party ECDH agreement and rejection of an invalid peer point. The original
SHA-256 output-size fix remains covered by AddressSanitizer.

## Remaining exception: stable Electron's bundled runtime

The official Electron 45.0.0 binary was downloaded and inspected in
`ELECTRON_RUN_AS_NODE` mode. It reports **Node 24.22.0, Brotli 1.2.0, Chromium
156.0.8078.48**. Node's October 21 advisory identifies fixes in 24.22.1 and
26.12.1. Installing a newer system Node does not replace Electron's embedded
runtime, and npm's advisory report alone does not resolve this discrepancy.

**The optional Electron launcher now refuses embedded Node versions below the
verified security baseline. Use the browser edition with Node 26.12.1.** Resume
desktop packaging only after a patched stable Electron release is available,
then update the lockfile, inspect the embedded versions and re-run tests. The
guard accepts the verified fixed release lines 22.23.4+, 24.22.1+ and 26.12.1+;
future Node major lines need an explicit policy review. No nightly Electron
build or insecure override was introduced.

## Reproduce

Install the pinned portable Node/npm on Windows:

```powershell
.\scripts\install-node.ps1
$nodeDir = Join-Path $PWD '.tools/node-v26.12.1-win-x64'
$env:PATH = "$nodeDir;" + $env:PATH
npm ci --prefix wasm/electron --ignore-scripts
npm audit --prefix wasm/electron
cargo install cargo-audit --version 0.22.2 --locked
cargo audit --file wasm/relay-rust/Cargo.lock
tools/wasm-python/Scripts/python.exe -m pip install pip-audit==2.10.1
tools/wasm-python/Scripts/python.exe -m pip_audit
```

Then run the [build, crypto and browser checks](BROWSER_SETUP.md#verification-and-troubleshooting).
Treat audit-tool exceptions as findings to review, not success. No audit ignores
or npm overrides were added to suppress advisories.

## Primary advisory sources

- [Node.js October 21, 2026 security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
- [Electron supported releases](https://releases.electronjs.org/?channel=stable)
- [Mbed TLS releases and security fixes](https://github.com/Mbed-TLS/mbedtls/releases)
- [Python protobuf denial-of-service advisory](https://github.com/protocolbuffers/protobuf/security/advisories/GHSA-8qvm-5x2c-j2w7)
- [nanopb security-fix changelog](https://github.com/nanopb/nanopb/blob/0.4.9.2/CHANGELOG.txt)
- [RustSec advisory database](https://rustsec.org/advisories/)
